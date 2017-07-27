/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import {
  ICommandPalette, IMainMenu, MainMenu
} from '@jupyterlab/apputils';

import {
    JupyterApplicationIPC as AppIPC,
    JupyterServerIPC as ServerIPC,
    JupyterWindowIPC as WindowIPC,
} from 'jupyterlab_app/src/ipc';

import {
    Application
} from 'jupyterlab_app/src/browser/app';

import {
    StateDB
} from '@jupyterlab/coreutils';

import {
    Menu, Widget
} from '@phosphor/widgets';

import {
    JupyterLabPlugin
} from '@jupyterlab/application';

import {
    ElectronJupyterLab
} from 'jupyterlab_app/src/browser/extensions/electron-extension';

import {
    NativeMenu
} from './nativemenu';

import {
    TitleBar
} from 'jupyterlab_app/src/browser/components';

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import plugin from '@jupyterlab/apputils-extension';

let ipc = (window as any).require('electron').ipcRenderer;

/**
 * Use window.require to prevent webpack
 * from trying to resolve the electron library
 */
let ipcRenderer = (window as any).require('electron').ipcRenderer;

namespace CommandIDs {
    export
    const activateServerManager = 'electron-jupyterlab:activate-server-manager';

    export 
    const connectToServer = 'electron-jupyterlab:connect-to-server';
}

const serverManagerPlugin: JupyterLabPlugin<void> = {
  id: 'jupyter.extensions.server-manager',
  requires: [ICommandPalette, IMainMenu],
  activate: (app: ElectronJupyterLab, palette: ICommandPalette, menu: IMainMenu) => {
    let serverState = new StateDB({namespace: Application.STATE_NAMESPACE});
    // Always insert a local server
    let servers: ServerIPC.ServerDesc[] = [{id: null, name: 'Local', type: 'local'}];

    serverState.fetch(Application.SERVER_STATE_ID)
        .then((data: Application.Connections | null) => {
            if (!data)
                createServerManager(app, palette, menu, servers);
            else
                createServerManager(app, palette, menu, servers.concat(data.servers));
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
                            menu: IMainMenu, servers: ServerIPC.ServerDesc[]) {
    
    app.commands.addCommand(CommandIDs.activateServerManager, {
        label: 'Add Server',
        execute: () => {ipcRenderer.send(AppIPC.REQUEST_ADD_SERVER, 'start')}
    });

    const { commands } = app;
    const serverMenu = new Menu({ commands });
    serverMenu.title.label = 'Servers';

    for (let s of servers) {
        serverMenu.addItem({command: CommandIDs.connectToServer, args: s});
        palette.addItem({command: CommandIDs.connectToServer, args: s, category: 'Servers'});
    }
    app.commands.addCommand(CommandIDs.connectToServer, {
        label: (args) => args.name as string,
        execute: (args) => {ipcRenderer.send(AppIPC.REQUEST_OPEN_CONNECTION, args)}
    });

    serverMenu.addItem({ type: 'separator' });
    serverMenu.addItem({ command: CommandIDs.activateServerManager });
    menu.addMenu(serverMenu, {rank: 25});

    palette.addItem({command: CommandIDs.activateServerManager, category: 'Servers'});
}

function buildTitleBar(app: ElectronJupyterLab): Widget {
    let titleBar = new Widget();
    ReactDOM.render(
        <TitleBar uiState={app.info.uiState} clicked={(type: string) => {
            if (type == 'close') {
                ipc.send(WindowIPC.REQUEST_WINDOW_CLOSE);
            } else if (type == 'minimize') {
                ipc.send(WindowIPC.REQUEST_WINDOW_MINIMIZE);
            } else {
                ipc.send(WindowIPC.REQUEST_WINDOW_MAXIMIZE);
            }
        }}/>, titleBar.node
    );
    return titleBar;
}

function buildPhosphorMenu(app: ElectronJupyterLab): IMainMenu {
    let menu = new MainMenu();
    let titleBar = buildTitleBar(app);

    menu.id = 'jpe-MainMenu-widget';
    titleBar.id = 'jpe-TitleBar-widget';

    titleBar.addClass('jpe-mod-' + app.info.uiState);

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
 * Override Main Menu plugin from apputils-extension
 */
plugin[0] = nativeMainMenuPlugin;
plugin.push(serverManagerPlugin);
export default plugin;
