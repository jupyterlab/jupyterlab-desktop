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

interface NMenuItemOptions extends Electron.MenuItemConstructorOptions {
    args: any;
}

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
    }

    private handleClick(menuItem: any): void {
        console.log(menuItem.args);
        console.log(this.app)
    }

    private translateMenuType(type: Menu.ItemType): "normal" | "submenu" | "separator" {
        if (type == "command")
            return 'normal';
        return type;
    }

    private buildNativeMenu(menu: Menu): NMenuItemOptions[] {
        let nItems = menu.items.map((item: Menu.IItem) => {
            let nItem: NMenuItemOptions = {args: {}};
            
            nItem.type = this.translateMenuType(item.type);
            nItem.click = this.handleClick;
            nItem.label = item.label;
            nItem.args = item.args;
            
            if (item.submenu)
                nItem.submenu = this.buildNativeMenu(item.submenu)

            return nItem
        })
        return nItems;
    }

    addMenu(menu: Menu, options: IMainMenu.IAddOptions = {}): void {
        if (ArrayExt.firstIndexOf(this.menus, menu) > -1) {
            return;
        }

        /* Append the menu to the native menu */
        this.nMenu.append(new NMenuItem({
            label: menu.title.label,
            submenu: this.buildNativeMenu(menu)
        }));
        NMenu.setApplicationMenu(this.nMenu);

        /* Append the menu to local list */
        this.insertMenu(this.index++, menu);
    }
}