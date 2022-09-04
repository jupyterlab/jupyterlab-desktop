// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IAppRemoteInterface } from '../main/app';

declare let __webpack_public_path__: string;

// needs to be loaded first as it contains the core federated extensions
import { main } from './extensions';

import { JSONObject } from '@lumino/coreutils';

import { PageConfig } from '@jupyterlab/coreutils';

import { StateDB } from '@jupyterlab/statedb';

import { asyncRemoteRenderer } from '../asyncremote';

import { IServerFactory } from '../main/server';

import { ISessions } from '../main/sessions';

import { ServerError, ServerManager, SplashScreen } from './components';

import { ElectronJupyterLab } from './extensions/electron-extension';

import { JupyterServer } from './utils';

import { JupyterLabSession } from '../main/sessions';

import {
  JupyterLabDesktopError,
  JupyterLabError,
  JupyterServerError
} from './errors';

import { ipcRenderer } from 'electron';

import * as React from 'react';
import log from 'electron-log';
import { LabShell } from '@jupyterlab/application';
import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';
import { showErrorMessage } from '@jupyterlab/apputils';

export class Application extends React.Component<
  Application.IProps,
  Application.IState
> {
  constructor(props: Application.IProps) {
    super(props);
    this._labDirUpdate = this._setLabDir();
    this._preventDefaults();
    this._renderServerManager = this._renderServerManager.bind(this);
    this._renderSplash = this._renderSplash.bind(this);
    this._renderEmpty = this._renderEmpty.bind(this);
    this._renderErrorScreen = this._renderErrorScreen.bind(this);
    this._connectionAdded = this._connectionAdded.bind(this);
    this._launchFromPath = this._launchFromPath.bind(this);
    this._changeEnvironment = this._changeEnvironment.bind(this);
    this._splash = React.createRef<SplashScreen>();

    if (this.props.options.serverState === 'local') {
      this.state = {
        renderSplash: this._renderEmpty,
        renderState: this._renderEmpty,
        remotes: []
      };
      asyncRemoteRenderer
        .runRemoteMethod(IServerFactory.requestServerStart, undefined)
        .then(data => {
          this._serverReady(data);
        })
        .catch((error: any) => {
          this._setErrorScreen(
            new JupyterServerError('requestServerStart failed', {
              cause: error
            })
          );
        });
    } else {
      this.state = {
        renderSplash: this._renderEmpty,
        renderState: this._renderServerManager,
        remotes: []
      };
    }

    this._serverState = new StateDB(/*{namespace: Application.STATE_NAMESPACE}*/);
    this._serverState
      .fetch(Application.SERVER_STATE_ID)
      .then((data: Application.IRemoteServerState | null) => {
        if (!data || !data.remotes) {
          return;
        }
        // Find max connection ID
        let maxID = 0;
        for (let val of data.remotes) {
          // Check validity of server state
          if (
            !val.id ||
            val.id < this._nextRemoteId ||
            !JupyterServer.verifyServer(val)
          ) {
            continue;
          }
          maxID = Math.max(maxID, val.id);
        }
        this._nextRemoteId = maxID + 1;
        // Render UI with saved servers
        this.setState({ remotes: data.remotes });
      })
      .catch((e: any) => {
        log.log(e);
      });
  }

  render(): JSX.Element | null {
    let splash = this.state.renderSplash();
    let content = this.state.renderState();

    return (
      <div className="jpe-body">
        {splash}
        {content}
      </div>
    );
  }

  private _serverReady(data: IServerFactory.IServerStarted): void {
    if (data.error) {
      log.error(data.error);
      this._setErrorScreen(data.error);
      if (this._splash.current) {
        this._splash.current.fadeSplashScreen();
      }
      return;
    }
    this._registerFileHandler();
    window.addEventListener('beforeunload', () => {
      // asyncRemoteRenderer.runRemoteMethod(IServerFactory.requestServerStop, {
      //     factoryId: data.factoryId
      // });
    });

    this._server = {
      token: data.token,
      url: data.url,
      name: 'Local',
      type: 'local'
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    __webpack_public_path__ = data.url;

    PageConfig.setOption('token', this._server.token);
    PageConfig.setOption('baseUrl', this._server.url);
    PageConfig.setOption('appUrl', 'lab');

    // get lab settings
    const settings = ServerConnection.makeSettings();
    const requestUrl = URLExt.join(settings.baseUrl, 'lab');
    // store hard-coded version
    let version: string = PageConfig.getOption('appVersion') || 'unknown';
    if (version[0] === 'v') {
      version = version.slice(1);
    }

    ServerConnection.makeRequest(requestUrl, {}, settings)
      .then(async response => {
        const indexTemplateCode = await response.text();

        const parser = new DOMParser();
        const template = parser.parseFromString(indexTemplateCode, 'text/html');
        const configElement = template.getElementById('jupyter-config-data');
        const upstreamConfig = JSON.parse(configElement.textContent || '{}');

        for (let key in upstreamConfig) {
          if (upstreamConfig.hasOwnProperty(key)) {
            const value = upstreamConfig[key];
            PageConfig.setOption(
              key,
              typeof value === 'string' ? value : JSON.stringify(value)
            );
          }
        }
        // overwrite the server URL to make use of absolute URL
        PageConfig.setOption('baseUrl', this._server.url);
        // overwrite version and app name
        PageConfig.setOption('appVersion', version);

        // correctly set the base URL so that relative paths can be used
        // (relative paths are used by upstream JupyterLab, e.g. for kernelspec
        // logos see https://github.com/jupyterlab/jupyterlab-desktop/pull/316,
        // and for other static assets like MathJax).
        const base = document.createElement('base');
        base.setAttribute('href', this._server.url);
        document.body.appendChild(base);

        this._setupLab()
          .then(lab => {
            this._lab = lab;
            try {
              this._lab
                .start({ ignorePlugins: this._ignorePlugins })
                .catch((error: any) => {
                  this._setErrorScreen(
                    new JupyterLabError('JupyterLab start failed', {
                      cause: error
                    })
                  );
                });
            } catch (e) {
              log.log(e);
            }
            this._lab.restored
              .then(() => {
                ipcRenderer.send('lab-ready');
                if (this._splash.current) {
                  this._splash.current.fadeSplashScreen();
                }
              })
              .catch((error: any) => {
                this._setErrorScreen(
                  new JupyterLabError('JupyterLab loading failed', {
                    cause: error
                  })
                );
              });
          })
          .catch((error: any) => {
            this._setErrorScreen(
              new JupyterServerError('JupyterLab set up failed', {
                cause: error
              })
            );
          });
      })
      .catch((error: any) => {
        this._setErrorScreen(
          new JupyterServerError('ServerConnection request failed', {
            cause: error
          })
        );
      });
  }

  private _launchFromPath() {
    asyncRemoteRenderer
      .runRemoteMethod(IServerFactory.requestServerStartPath, undefined)
      .then((data: IServerFactory.IServerStarted) => {
        this._serverReady(data);
      })
      .catch((error: any) => {
        this._setErrorScreen(
          new JupyterServerError('requestServerStartPath failed', {
            cause: error
          })
        );
      });

    let pathSelected = () => {
      asyncRemoteRenderer.removeRemoteListener(
        IServerFactory.pathSelectedEvent,
        pathSelected
      );
      this.setState({
        renderSplash: this._renderSplash,
        renderState: this._renderEmpty
      });
    };
    asyncRemoteRenderer.onRemoteEvent(
      IServerFactory.pathSelectedEvent,
      pathSelected
    );
  }

  private _changeEnvironment() {
    asyncRemoteRenderer
      .runRemoteMethod(IAppRemoteInterface.showPythonPathSelector, void 0)
      .catch((error: any) => {
        this._setErrorScreen(
          new JupyterLabDesktopError('Environment change failed', {
            cause: error
          })
        );
      });
  }

  private _saveState() {
    this._serverState
      .save(Application.SERVER_STATE_ID, {
        remotes: this.state.remotes
      })
      .catch((error: any) => {
        this._setErrorScreen(
          new JupyterLabDesktopError('Saving application state failed', {
            cause: error
          })
        );
      });
  }

  private _setupLab() {
    return main().then(extensions => {
      const lab = new ElectronJupyterLab({
        shell: new LabShell(),
        mimeExtensions: extensions.mime,
        disabled: extensions.disabled,
        deferred: extensions.deferred,
        platform: this.props.options.platform,
        uiState: this.props.options.uiState
      });
      this._ignorePlugins.push(...extensions.ignored);

      try {
        lab.registerPluginModules(extensions.jupyterlab);
      } catch (e) {
        log.error(e);
      }
      return lab;
    });
  }

  private _connectionAdded(server: JupyterServer.IServer) {
    PageConfig.setOption('baseUrl', server.url);
    PageConfig.setOption('token', server.token);
    PageConfig.setOption('appUrl', 'lab');

    this._setupLab()
      .then(lab => {
        this._lab = lab;
        this._lab
          .start({ ignorePlugins: this._ignorePlugins })
          .catch((error: any) => {
            this._setErrorScreen(
              new JupyterLabError('Start failed', { cause: error })
            );
          });

        let rServer: Application.IRemoteServer = {
          ...server,
          id: this._nextRemoteId++
        };
        this.setState((prevState: ServerManager.IState) => {
          server.id = this._nextRemoteId++;
          let remotes = this.state.remotes.concat(rServer);
          this._saveState();
          return {
            renderState: this._renderEmpty,
            remotes: remotes
          };
        });
      })
      .catch((error: any) => {
        this._setErrorScreen(
          new JupyterLabError('Set up after establishing connection failed', {
            cause: error
          })
        );
      });
  }

  private _renderServerManager(): JSX.Element {
    return (
      <div className="jpe-content">
        <ServerManager serverAdded={this._connectionAdded} />;
      </div>
    );
  }

  private _renderSplash(): JSX.Element {
    return (
      <div className="jpe-content">
        <SplashScreen
          ref={this._splash}
          uiState={this.props.options.uiState}
          finished={() => {
            this.setState({ renderSplash: this._renderEmpty });
          }}
        />
      </div>
    );
  }

  private _renderErrorScreen(error: Error): JSX.Element {
    return (
      <div className="jpe-content">
        <ServerError
          changeEnvironment={this._changeEnvironment}
          error={error}
        />
      </div>
    );
  }

  private _renderEmpty(): JSX.Element {
    return null;
  }

  private _setErrorScreen(error: Error): void {
    this.setState({ renderState: () => this._renderErrorScreen(error) });
  }

  private _preventDefaults(): void {
    document.ondragover = (event: DragEvent) => {
      event.preventDefault();
    };
    document.ondragleave = (event: DragEvent) => {
      event.preventDefault();
    };
    document.ondragend = (event: DragEvent) => {
      event.preventDefault();
    };
    document.ondrop = (event: DragEvent) => {
      event.preventDefault();
    };
  }

  private _registerFileHandler(): void {
    document.ondrop = (event: DragEvent) => {
      event.preventDefault();
      let files = event.dataTransfer.files;
      for (let i = 0; i < files.length; i++) {
        this._openFile(files[i].path).catch(console.error);
      }
    };

    asyncRemoteRenderer.onRemoteEvent(
      ISessions.openFileEvent,
      this._openFile.bind(this)
    );
  }

  private async _openFile(path: string) {
    await this._labDirUpdate;
    if (this._labDir) {
      let relPath = path.replace(this._labDir, '');
      let winConvert = relPath.split('\\').join('/');
      relPath = winConvert.replace('/', '');
      this._lab.commands
        .execute('docmanager:open', { path: relPath })
        .catch((error: any) => {
          // not switching to error screen here, as we most likely got through the init procedure correctly
          showErrorMessage(
            'Could not open requested file',
            JSON.stringify(error)
          ).catch(console.error);
        });
    } else {
      console.warn('labDir not set up, cannot open requested file: ' + path);
    }
  }

  private _setLabDir(): Promise<void> {
    return asyncRemoteRenderer
      .runRemoteMethod(IAppRemoteInterface.getCurrentRootPath, undefined)
      .then((path: string) => {
        this._labDir = path;
      })
      .catch((error: any) => {
        this._setErrorScreen(
          new JupyterLabDesktopError('getCurrentRootPath failed', {
            cause: error
          })
        );
      });
  }

  private _labDirUpdate: Promise<void>;

  private _labDir: string;

  private _lab: ElectronJupyterLab;

  private _ignorePlugins: string[] = []; //['jupyter.extensions.server-manager'];

  private _server: JupyterServer.IServer = null;

  private _nextRemoteId: number = 1;

  private _serverState: StateDB;

  // private _labReady: Promise<void>;

  private _splash: React.RefObject<SplashScreen>;
}

export namespace Application {
  /**
   * Namspace for server manager state stored in StateDB
   */
  export const STATE_NAMESPACE = 'JupyterApplication-state';

  /**
   * ID for ServerManager server data in StateDB
   */
  export const SERVER_STATE_ID = 'servers';

  export interface IProps {
    options: JupyterLabSession.IInfo;
  }

  export interface IState {
    renderState: () => any;
    renderSplash: () => any;
    remotes: IRemoteServer[];
  }

  export interface IRemoteServer extends JupyterServer.IServer {
    id: number;
  }

  export interface IRemoteServerState extends JSONObject {
    remotes: IRemoteServer[];
  }
}
