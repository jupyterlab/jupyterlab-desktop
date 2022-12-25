// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

declare let __webpack_public_path__: string;

// needs to be loaded first as it contains the core federated extensions
import { main } from './extensions';
import { PageConfig } from '@jupyterlab/coreutils';
import { IServerFactory } from '../main/server';
import { ElectronJupyterLab } from './extensions/electron-extension';
import * as React from 'react';
import { LabShell } from '@jupyterlab/application';

export class Application extends React.Component<
  Application.IProps,
  Application.IState
> {
  constructor(props: Application.IProps) {
    super(props);
    this._preventDefaults();
    this._renderEmpty = this._renderEmpty.bind(this);

    this.state = {
      renderState: this._renderEmpty
    };

    window.electronAPI.getServerInfo().then(data => {
      this._serverReady(data);
    });
  }

  render(): JSX.Element | null {
    let content = this.state.renderState();

    return <div className="jpe-body">{content}</div>;
  }

  private _serverReady(data: IServerFactory.IServerStarted): void {
    if (data.error) {
      console.error(data.error);
      return;
    }

    const config: any = data.pageConfig;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    __webpack_public_path__ = config.hasOwnProperty('fullStaticUrl')
      ? config['fullStaticUrl'] + '/'
      : data.url;

    for (let key in config) {
      if (config.hasOwnProperty(key)) {
        const value = config[key];
        PageConfig.setOption(
          key,
          typeof value === 'string' ? value : JSON.stringify(value)
        );
      }
    }

    PageConfig.setOption('jupyterlab-desktop-server-type', data.type);
    PageConfig.setOption('jupyterlab-desktop-server-url', data.url);

    this._setupLab().then(lab => {
      this._lab = lab;

      const exposeAppInBrowser =
        (PageConfig.getOption('exposeAppInBrowser') || '').toLowerCase() ===
        'true';

      if (exposeAppInBrowser) {
        window.jupyterapp = lab;
      }

      try {
        this._lab.start({ ignorePlugins: this._ignorePlugins });
      } catch (e) {
        console.log(e);
      }
      this._lab.restored.then(() => {
        window.electronAPI.broadcastLabUIReady();
      });
    });
  }

  private _setupLab() {
    return main().then(extensions => {
      const lab = new ElectronJupyterLab({
        shell: new LabShell(),
        mimeExtensions: extensions.mime,
        disabled: extensions.disabled,
        deferred: extensions.deferred
      });
      this._ignorePlugins.push(...extensions.ignored);

      try {
        lab.registerPluginModules(extensions.jupyterlab);
      } catch (e) {
        console.error(e);
      }
      return lab;
    });
  }

  private _renderEmpty(): JSX.Element {
    return null;
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

  private _lab: ElectronJupyterLab;

  private _ignorePlugins: string[] = []; //['jupyter.extensions.server-manager'];
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

  export interface IProps {}

  export interface IState {
    renderState: () => any;
  }
}
