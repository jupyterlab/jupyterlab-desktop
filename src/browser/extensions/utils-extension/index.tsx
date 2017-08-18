/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import {
  ICommandPalette, IMainMenu, MainMenu
} from '@jupyterlab/apputils';

import {
    JupyterApplicationIPC as AppIPC,
} from '../../../ipc';

import {
    JSONObject
} from '@phosphor/coreutils';

import {
    Application
} from '../../app';

import {
    StateDB, ISettingRegistry, SettingRegistry, IDataConnector
} from '@jupyterlab/coreutils';

import {
    Menu, Widget
} from '@phosphor/widgets';

import {
    JupyterLabPlugin
} from '@jupyterlab/application';

import {
    ElectronJupyterLab
} from '../electron-extension';

import {
    NativeMenu
} from './nativemenu';

import {
    TitleBar
} from '../../components';

import {
    ipcRenderer
} from '../../utils';

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import plugins from '@jupyterlab/apputils-extension';


namespace CommandIDs {
    export
    const activateServerManager = 'electron-jupyterlab:activate-server-manager';

    export 
    const connectToServer = 'electron-jupyterlab:connect-to-server';
}

interface ServerManagerMenuArgs extends JSONObject, AppIPC.IOpenConnection {
    name: string;
}

const serverManagerPlugin: JupyterLabPlugin<void> = {
    id: 'jupyter.extensions.server-manager',
    requires: [ICommandPalette, IMainMenu],
    activate: (app: ElectronJupyterLab, palette: ICommandPalette, menu: IMainMenu) => {
    let serverState = new StateDB({namespace: Application.STATE_NAMESPACE});
    // Insert a local server
    let servers: ServerManagerMenuArgs[] = [{name: 'Local', type: 'local'}];

    serverState.fetch(Application.SERVER_STATE_ID)
        .then((data: Application.IRemoteServerState | null) => {
            if (!data) {
                createServerManager(app, palette, menu, servers);
            } else {
                servers.concat(data.remotes.map((remote) => {
                    return {
                        type: 'remote',
                        name: remote.name,
                        id: remote.id
                    } as ServerManagerMenuArgs;
                }));
                createServerManager(app, palette, menu, servers);
            }
        })
        .catch((e) => {
            console.log(e);
            createServerManager(app, palette, menu, servers);
        });


    return null;
  },
  autoStart: true
}

function createServerManager(app: ElectronJupyterLab, palette: ICommandPalette,
                            menu: IMainMenu, servers: ServerManagerMenuArgs[]) {
    app.commands.addCommand(CommandIDs.activateServerManager, {
        label: 'Add Server',
        execute: () => {ipcRenderer.send(AppIPC.REQUEST_ADD_SERVER)}
    });
    app.commands.addCommand(CommandIDs.connectToServer, {
        label: (args) => args.name as string,
        execute: (args) => {ipcRenderer.send(AppIPC.REQUEST_OPEN_CONNECTION, args)}
    });

    const { commands } = app;
    const serverMenu = new Menu({ commands });
    serverMenu.title.label = 'Servers';

    for (let s of servers) {
        serverMenu.addItem({command: CommandIDs.connectToServer, args: s});
        palette.addItem({command: CommandIDs.connectToServer, args: s, category: 'Servers'});
    }

    serverMenu.addItem({ type: 'separator' });
    serverMenu.addItem({ command: CommandIDs.activateServerManager });
    menu.addMenu(serverMenu, {rank: 25});

    palette.addItem({command: CommandIDs.activateServerManager, category: 'Servers'});
}

function buildTitleBar(app: ElectronJupyterLab): Widget {
    let titleBar = new Widget();
    ReactDOM.render(
        <TitleBar uiState={app.info.uiState} />,
        titleBar.node
    );
    return titleBar;
}

function buildPhosphorMenu(app: ElectronJupyterLab): IMainMenu {
    let menu = new MainMenu();
    let titleBar = buildTitleBar(app);

    menu.id = 'jpe-MainMenu-widget';
    titleBar.id = 'jpe-TitleBar-widget';

    titleBar.addClass('jpe-mod-' + app.info.uiState);
    
    let logo = new Widget();
    logo.addClass('jp-MainAreaPortraitIcon');
    logo.addClass('jpe-JupyterIcon');
    logo.id = 'jp-MainLogo';

    app.shell.addToTopArea(logo);

    app.shell.addToTopArea(menu);
    app.shell.addToTopArea(titleBar);
    return menu;
}

function buildNativeMenu(app: ElectronJupyterLab): IMainMenu {
    let menu = new NativeMenu(app);
    let titleBar = buildTitleBar(app);
    titleBar.id = 'jpe-TitleBar-widget';
    titleBar.addClass('jpe-mod-' + app.info.uiState);

    app.shell.addToTopArea(titleBar);
    
    return menu;
}

/**
 * A service providing an native menu bar.
 */
const nativeMainMenuPlugin: JupyterLabPlugin<IMainMenu> = {
  id: 'jupyter.services.main-menu',
  provides: IMainMenu,
  activate: (app: ElectronJupyterLab): IMainMenu => {
    // Create the menu
    let menu: IMainMenu;
    let uiState = app.info.uiState;
    if (uiState == 'linux' || uiState == 'mac') {
        menu = buildNativeMenu(app);
    } else {
        menu = buildPhosphorMenu(app);
    }

    return menu;
  }
};

/**
 * Create a data connector to access plugin settings.
 */
function newConnector(): IDataConnector<ISettingRegistry.IPlugin, JSONObject> {
  return {
    /**
     * Retrieve a saved bundle from the data connector.
     */
    fetch(id: string): Promise<ISettingRegistry.IPlugin> {
        return new Promise<ISettingRegistry.IPlugin>((res, rej) => {
            ipcRenderer.on(SettingsIPC.RESPOND_FETCH_SETTING, function handler(evt: Electron.Event, setting: SettingsIPC.ISetting) {
                // Ignore the message if it isn't the correct id
                if (setting.setting.id != id)
                    return;

                ipcRenderer.removeListener(SettingsIPC.RESPOND_FETCH_SETTING, handler);
                if (setting.err) {
                    rej(setting.err);
                    return;
                }
                res(setting.setting);
            });

            ipcRenderer.send(SettingsIPC.REQUEST_FETCH_SETTING, {id});
        });
    },

    /**
     * Remove a value from the data connector.
     */
    remove(): Promise<void> {
      const message = 'Removing setting resources is not supported.';

      return Promise.reject(new Error(message));
    },

    /**
     * Save the user setting data in the data connector.
     */
    save(id: string, user: JSONObject): Promise<void> {
        return new Promise<void>((res, rej) => {
            ipcRenderer.on(SettingsIPC.RESPOND_SAVE_SETTING, function handler(evt: Electron.Event, arg: any) {
                ipcRenderer.removeListener(SettingsIPC.RESPOND_FETCH_SETTING, handler);
                if (arg.err) {
                    rej(arg.err);
                    return;
                }
                res();
            });
            
            ipcRenderer.send(SettingsIPC.REQUEST_SAVE_SETTING, {id, user});
        });
    }
  };
}

/**
 * The default setting registry provider.
 */
const settingPlugin: JupyterLabPlugin<ISettingRegistry> = {
  id: 'jupyter.services.setting-registry',
  activate: (): ISettingRegistry => {
    return new SettingRegistry({ connector: newConnector() });
  },
  autoStart: true,
  provides: ISettingRegistry
};

/**
 * Override Main Menu plugin from apputils-extension
 */
let nPlugins = plugins.map((p: JupyterLabPlugin<any>) => {
    if (p.id == 'jupyter.services.main-menu')
        return nativeMainMenuPlugin;
    else if (p.id == 'jupyter.services.setting-registry')
        return settingPlugin;
    return p;
});
nPlugins.push(serverManagerPlugin);
export default nPlugins;
