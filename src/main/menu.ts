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
    JupyterMenuChannels
} from '../ipc';

type ItemOptions = Electron.MenuItemConstructorOptions;

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
        Menu.setApplicationMenu(this.menu);
    }

    /**
     * Set the click event handler for all items in menu item tree
     * 
     * @param menu A menu being added to the menu bar. 
     */
    private setClickEvents(menu: ItemOptions): void {
        if (menu.submenu === undefined) {
            menu.click = this.handleClick;
            return;
        }

        (<ItemOptions[]>menu.submenu).forEach((m: ItemOptions) => {
            this.setClickEvents(m);
        });
    }

    /**
     * Register listeners on main menu events
     */
    private registerListeners(): void {
        /* Register MENU_ADD event */
        ipcMain.on(JupyterMenuChannels.MENU_ADD, (event: any, menu: ItemOptions) => {
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
    private addMenu(event: any, menu: ItemOptions) {
        this.setClickEvents(menu);
        
        /* Set position in the native menu bar */
        let index = ArrayExt.upperBound(<ItemOptions[]>this.menu.items, menu, 
                    (f: ItemOptions, s: ItemOptions) => {
                        return Number(f.id) - Number(s.id)
                    });
        
        this.menu.insert(index, new MenuItem(menu));
        Menu.setApplicationMenu(this.menu);
    }

    /**
     * Click event handler. Passes the event on the render process 
     */
    private handleClick(menu: Electron.MenuItem, window: Electron.BrowserWindow): void {
        window.webContents.send(JupyterMenuChannels.CLICK_EVENT, menu as ItemOptions);
    }
}
