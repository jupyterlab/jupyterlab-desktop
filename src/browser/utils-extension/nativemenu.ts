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
    JupyterMenuChannels
} from '../../ipc';

import {
    IMainMenu
} from '@jupyterlab/apputils';


/**
 * Require electron from window object to prevent
 * webpack from trying to resolve it. window.require
 * is defined in the electron environment.
 */
let ipc = (window as any).require('electron').ipcRenderer;

/**
 * Interface for natvie menu item configuration.
 */
interface NativeMenuItem extends Electron.MenuItemConstructorOptions {
    item: Menu.IItem;
}

/**
 * The main menu class. Interacts with the electron main process
 * to setup native menu bar.
 */
export
class NativeMenu extends MenuBar implements IMainMenu {

    constructor(private app: JupyterLab) {
        super();
        this.registerListeners();
    }

    /**
     * Register listeners for menu events
     */
    private registerListeners(): void {
        /* Register listener on menu bar clicks */
        ipc.on(JupyterMenuChannels.CLICK_EVENT, (event: any, opts: NativeMenuItem) => {
            /* Execute the command associated with the click event */
            this.app.commands.execute(opts.item.command);
        });
    }

    private buildNativeMenu(menu: Menu): NativeMenuItem[] {
        let nItems = menu.items.map((item: Menu.IItem) => {
            let nItem: NativeMenuItem = {item: item};
            
            if (item.type == 'command')
                nItem.type = 'normal';
            else
                nItem.type = item.type;
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
        ipc.send(JupyterMenuChannels.MENU_APPEND, {
            id: String(rank),
            label: menu.title.label,
            submenu: this.buildNativeMenu(menu)
        });
    }
}