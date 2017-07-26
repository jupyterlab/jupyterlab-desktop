/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import {
  ICommandPalette, IMainMenu
} from '@jupyterlab/apputils';

import {
    JupyterApplicationIPC as AppIPC,
    JupyterServerIPC as ServerIPC,
    JupyterWindowIPC as WindowIPC
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
  JupyterLab, 
  JupyterLabPlugin
} from '@jupyterlab/application';

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
  activate: (app: JupyterLab, palette: ICommandPalette, menu: IMainMenu) => {
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

function createServerManager(app: JupyterLab, palette: ICommandPalette,
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

/**
 * A service providing an native menu bar.
 */
const nativeMainMenuPlugin: JupyterLabPlugin<IMainMenu> = {
  id: 'jupyter.services.main-menu',
  provides: IMainMenu,
  activate: (app: JupyterLab): IMainMenu => {
    let menu = new NativeMenu(app);
    menu.id = 'jp-MainMenu';
    return menu;
  }
};

/**
 * A service providing an native menu bar.
 */
const titleBarPlugin: JupyterLabPlugin<void> = {
  id: 'jupyter.services.title-bar',
  activate: (app: JupyterLab): void => {
    let titleBar = new Widget();
    titleBar.id = 'jpe-TitleBar-widget';
    ReactDOM.render(
        <TitleBar clicked={(type: string) => {
            if (type == 'close') {
                ipc.send(WindowIPC.REQUEST_WINDOW_CLOSE);
            } else if (type == 'minimize') {
                ipc.send(WindowIPC.REQUEST_WINDOW_MINIMIZE);
            } else {
                ipc.send(WindowIPC.REQUEST_WINDOW_MAXIMIZE);
            }
        }}/>, titleBar.node
    );
    app.shell.addToTopArea(titleBar);
  },
  autoStart: true
};

/**
 * Override Main Menu plugin from apputils-extension
 */
plugin[0] = nativeMainMenuPlugin;
plugin.push(titleBarPlugin);
plugin.push(serverManagerPlugin);
export default plugin;
