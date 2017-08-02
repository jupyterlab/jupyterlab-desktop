/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import {
    Menu, MenuItem, ipcMain
} from 'electron';

import {
    ArrayExt
} from '@phosphor/algorithm';

import {
    JupyterMenuIPC as MenuIPC
} from 'jupyterlab_app/src/ipc';

import {
    JupyterApplication
} from './app';

import {
    JupyterLabWindow
} from './window';

type JupyterMenuItemOptions = MenuIPC.JupyterMenuItemOptions;

export
type MenuItemConstructorOptions = Electron.MenuItemConstructorOptions;

/**
 * Native main menu bar class
 */
export
class JupyterMainMenu {

    constructor(options: JupyterMainMenu.IOptions) {
        this._menu = new Menu();
        this._jupyterApp = options.jupyterApp;
        
        /* Register MENU_ADD event */
        ipcMain.on(MenuIPC.REQUEST_MENU_ADD, (event: any, menu: JupyterMenuItemOptions) => {
            this._addMenu(event, menu);
        });

        if (process.platform === 'darwin') {
            this._menu.append(new MenuItem({
                id: '-1',
                label: 'JupyterLab',
                submenu: null
            }));
        }
        Menu.setApplicationMenu(this._menu);
    }

    /**
     * Set the click event handler for all items in menu item tree
     * 
     * @param menu A menu being added to the menu bar. 
     */
    private _setClickEvents(menu: JupyterMenuItemOptions): void {
        let boundClick = this.handleClick.bind(this);
        if (menu.submenu === null || menu.submenu === undefined) {
            menu.click = boundClick;
            return;
        }

        let items = <JupyterMenuItemOptions[]>menu.submenu;
        for (let i = 0, n = items.length; i < n; i++) {
            this._setClickEvents(items[i]);
        }
    }

    /**
     * Add a menu to the menubar.
     * Sets up click handlers on submenu tree items.
     * Chooses menubar position of menu based on the 'id' field string.
     * Lower numbers in the 'id' field float up in the menubar
     * 
     * @param event The ipc event object 
     * @param menu The menu item configuration
     */
    private _addMenu(event: any, menu: JupyterMenuItemOptions) {
        let items = this._menu.items;
        /* Check if item has already been inserted */
        for (let i = 0, n = items.length; i < n; i++) {
            if (items[i].label == menu.label)
                return;
        }

        this._setClickEvents(menu);

        if (!menu.rank)
            menu.rank = 100;

        /* Set position in the native menu bar */
        let index = ArrayExt.upperBound(<JupyterMenuItemOptions[]>items, menu, 
                    (f: JupyterMenuItemOptions, s: JupyterMenuItemOptions) => {
                        return f.rank - s.rank;
                    });
        
        this._menu.insert(index, new MenuItem(menu));
        Menu.setApplicationMenu(this._menu);
    }

    /**
     * Click event handler. Passes the event on the render process 
     */
    private handleClick(menu: Electron.MenuItem, window: Electron.BrowserWindow): void {
        let windows: JupyterLabWindow[] = null;
        // Application window is in focus
        if (window){
             window.webContents.send(MenuIPC.POST_CLICK_EVENT, menu as JupyterMenuItemOptions);
        }
        // No focused window
        else if ((windows = this._jupyterApp.windows).length > 0){
            if (menu.label === 'Add Server' || menu.label === 'Local'){
                windows[0].browserWindow.webContents.send(MenuIPC.POST_CLICK_EVENT, menu as JupyterMenuItemOptions);
            }
        }
        // No application windows available
        else {
            if (menu.label === 'Add Server'){
                this._jupyterApp.addServer();
            }
            else if (menu.label === 'Local'){
                this._jupyterApp.newLocalServer();
            }

        }
    }

    /**
     * Electron menu object. Stores menu bar contents.
     */
    private _menu: Electron.Menu;

    private _jupyterApp: JupyterApplication;
}

export
namespace JupyterMainMenu {
    export
    interface IOptions {
        jupyterApp: JupyterApplication;
    }
}