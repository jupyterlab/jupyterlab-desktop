// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ArrayExt
} from '@phosphor/algorithm';

import {
    Menu, MenuBar
} from '@phosphor/widgets';

import {
  JupyterLab
} from '@jupyterlab/application';

import {
    IMainMenu
} from '@jupyterlab/apputils';

let remote = (window as any).require('electron').remote;

let NMenu = remote.Menu;
let NMenuItem = remote.MenuItem;

export
class NativeMenu extends MenuBar implements IMainMenu {

    /**
     * The native menu object. This is a remote object in the main process.
     */
    private nMenu: Electron.Menu;

    /**
     * The next open index in the menu array
     */
    private index: number = 0;

    constructor(private app: JupyterLab) {
        super();
        this.nMenu = new NMenu();
        NMenu.setApplicationMenu(this.nMenu);
    }

    private handleClick(menuItem: Electron.MenuItem): void {
        console.log('Click Received');
    }

    addMenu(menu: Menu, options: IMainMenu.IAddOptions = {}): void {
        if (ArrayExt.firstIndexOf(this.menus, menu) > -1) {
            return;
        }

        let nItems: Electron.MenuItemConstructorOptions[] = menu.items.map((item: Menu.IItemOptions) => {
            let nItem: Electron.MenuItemConstructorOptions = new Object();
            // HACK. Submenus should be new menu objects.
            if (item.type == 'command' || item.type == 'submenu')
                nItem.type = 'normal';
            nItem.label = this.app.commands.label(item.command);
            nItem.click = this.handleClick;
            return nItem;
        });

        /* Append the menu to the native menu */
        this.nMenu.append(new NMenuItem({
            label: menu.title.label,
            submenu: nItems
        }));

        /* Append the menu to local list */
        this.insertMenu(this.index++, menu);
    }
}