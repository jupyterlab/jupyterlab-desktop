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

let ipc = (window as any).require('electron').ipcRenderer;

interface NativeMenuItem extends Electron.MenuItemConstructorOptions {
    item: Menu.IItem;
}

export
class NativeMenu extends MenuBar implements IMainMenu {

    constructor(private app: JupyterLab) {
        super();
        this.registerListeners();
    }

    private registerListeners(): void {
        ipc.on('menu-click', (event: any, opts: NativeMenuItem) => {
            this.app.commands.execute(opts.item.command);
        });
    }

    private translateMenuType(type: Menu.ItemType): "normal" | "submenu" | "separator" {
        if (type == "command")
            return 'normal';
        return type;
    }

    private buildNativeMenu(menu: Menu): NativeMenuItem[] {
        let nItems = menu.items.map((item: Menu.IItem) => {
            let nItem: NativeMenuItem = {item: item};
            
            nItem.type = this.translateMenuType(item.type);
            nItem.label = item.label;
            
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

        let rank = 'rank' in options ? options.rank : 100;

        /* Append the menu to the native menu */
        ipc.send('menu-append', {
            id: String(rank),
            label: menu.title.label,
            submenu: this.buildNativeMenu(menu)
        });
    }
}