/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import {
  JupyterLab, 
  JupyterLabPlugin
} from '@jupyterlab/application';

import {
  IMainMenu
} from '@jupyterlab/apputils';

import {
    NativeMenu
} from './nativemenu'

import plugin from '@jupyterlab/apputils-extension';

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
export default plugin;
