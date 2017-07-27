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

type JupyterMenuItemOptions = MenuIPC.JupyterMenuItemOptions;

export
type MenuItemConstructorOptions = Electron.MenuItemConstructorOptions;

/**
 * Native main menu bar class
 */
export
class JupyterMainMenu {

    /**
     * Electron menu object. Stores menu bar contents.
     */
    private menu: Electron.Menu;

    constructor() {
        this.menu = new Menu();
        this.registerListeners();

        if (process.platform === 'darwin') {
            this.menu.append(new MenuItem({
                id: '-1',
                label: 'JupyterLab',
                submenu: null
            }));
        }
        Menu.setApplicationMenu(this.menu);
    }

    /**
     * Set the click event handler for all items in menu item tree
     * 
     * @param menu A menu being added to the menu bar. 
     */
    private setClickEvents(menu: JupyterMenuItemOptions): void {
        if (menu.submenu === null || menu.submenu === undefined) {
            menu.click = this.handleClick;
            return;
        }

        let items = <JupyterMenuItemOptions[]>menu.submenu;
        for (let i = 0, n = items.length; i < n; i++) {
            this.setClickEvents(items[i]);
        }
    }

    /**
     * Register listeners on main menu events
     */
    private registerListeners(): void {
        /* Register MENU_ADD event */
        ipcMain.on(MenuIPC.REQUEST_MENU_ADD, (event: any, menu: JupyterMenuItemOptions) => {
            this.addMenu(event, menu);
        });
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
    private addMenu(event: any, menu: JupyterMenuItemOptions) {
        let items = this.menu.items;
        /* Check if item has already been inserted */
        for (let i = 0, n = items.length; i < n; i++) {
            if (items[i].label == menu.label)
                return;
        }

        this.setClickEvents(menu);

        if (!menu.rank)
            menu.rank = 100;

        /* Set position in the native menu bar */
        let index = ArrayExt.upperBound(<JupyterMenuItemOptions[]>items, menu, 
                    (f: JupyterMenuItemOptions, s: JupyterMenuItemOptions) => {
                        return f.rank - s.rank;
                    });
        
        this.menu.insert(index, new MenuItem(menu));
        Menu.setApplicationMenu(this.menu);
    }

    /**
     * Click event handler. Passes the event on the render process 
     */
    private handleClick(menu: Electron.MenuItem, window: Electron.BrowserWindow): void {
        window.webContents.send(MenuIPC.POST_CLICK_EVENT, menu as JupyterMenuItemOptions);
    }
}
