/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import {
    Menu, MenuItem, ipcMain
} from 'electron';

import {
    ArrayExt
} from '@phosphor/algorithm'

type ItemOptions = Electron.MenuItemConstructorOptions;

export
class JupyterMenu {

    private menu: Electron.Menu;

    constructor() {
        this.menu = new Menu();
        this.registerListeners();
        Menu.setApplicationMenu(this.menu);
    }

    private setClickEvents(menu: ItemOptions): void {
        if (menu.submenu === undefined) {
            menu.click = this.handleClick;
            return;
        }

        (<ItemOptions[]>menu.submenu).forEach((m: ItemOptions) => {
            this.setClickEvents(m);
        });
    }

    private registerListeners(): void {
        ipcMain.on('menu-append', (event: any, menu: ItemOptions) => {
            this.setClickEvents(menu);
            
            /* Set position in the native menu bar */
            let index = ArrayExt.upperBound(<ItemOptions[]>this.menu.items, menu, 
                        (f: ItemOptions, s: ItemOptions) => {
                            return Number(f.id) - Number(s.id)
                        });
            
            this.menu.insert(index, new MenuItem(menu));
            Menu.setApplicationMenu(this.menu);
        });
    }

    private handleClick(menu: Electron.MenuItem, window: Electron.BrowserWindow): void {
        window.webContents.send('menu-click', menu as ItemOptions);
    }
}