/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import {
  ICommandPalette, IMainMenu
} from '@jupyterlab/apputils';

import {
    ElectronJupyterLab
} from '../electron-extension';

import {
    JupyterApplicationIPC as AppIPC
} from '../../ipc';

import {
  Menu
} from '@phosphor/widgets';

import {
  JupyterLab, 
  JupyterLabPlugin
} from '@jupyterlab/application';

import {
    NativeMenu
} from './nativemenu'

import plugin from '@jupyterlab/apputils-extension';

/**
 * Use window.require to prevent webpack
 * from trying to resolve the electron library
 */
let ipcRenderer = (window as any).require('electron').ipcRenderer;

namespace CommandIDs {
    export
    const activateServerManager = 'electron-jupyterlab:activate-server-manager';
}

const serverManagerPlugin: JupyterLabPlugin<void> = {
  id: 'jupyter.extensions.servermanager',
  requires: [ICommandPalette, IMainMenu],
  activate: (app: ElectronJupyterLab, palette: ICommandPalette, menu: IMainMenu) => {
    app.commands.addCommand(CommandIDs.activateServerManager, {
        label: 'Connect to Server',
        execute: () => {ipcRenderer.send(AppIPC.Channels.START_SERVER_MANAGER_WINDOW, 'start')}
    });
    palette.addItem({command: CommandIDs.activateServerManager, category: 'Main Area'});
    menu.addMenu(createMenu(app), {rank: 25});

    return null;
  },
  autoStart: true
}

/**
 * Creates a menu for the server manager.
 */
function createMenu(app: ElectronJupyterLab): Menu {
  const { commands } = app;
  const menu = new Menu({ commands });

  menu.title.label = 'Servers';
  menu.addItem({ command: CommandIDs.activateServerManager });
//   menu.addItem({ type: 'separator' });
//   menu.addItem({ command: 'settingeditor:open' });

  return menu;
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
 * Override Main Menu plugin from apputils-extension
 */
plugin[0] = nativeMainMenuPlugin;
plugin.push(serverManagerPlugin);
export default plugin;
