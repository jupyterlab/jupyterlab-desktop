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
 * Require electron from window object. This prevents webpack from trying
 * to resolve the window object. window.require is defined in the electron
 * environment.
 */
let ipc = (window as any).require('electron').ipcRenderer;

/**
 * Interface for native menu item configuration.
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

    /**
     * Convert phosphorJS menu configuration to a native electron
     * menu configuration.
     * 
     * @param menu The phosphorJS menu object
     * 
     * @return Array of electron menu items representing menu item
     *         drop down contents 
     */
    private buildNativeMenu(menu: Menu): NativeMenuItem[] {
        let items = menu.items;
        let nItems = new Array<NativeMenuItem>(items.length);
        ArrayExt.fill(nItems, {item: null, type: null, label: null, submenu: null});
        for (let i = 0; i < nItems.length; i++) {
            if (items[i].type == 'command')
                nItems[i].type = 'normal';
            else
                nItems[i].type = (items[i].type as 'normal' | 'submenu' | 'separator');
            nItems[i].label = items[i].label;
            
            if (items[i].submenu !== null)
                nItems[i].submenu = this.buildNativeMenu(items[i].submenu);
        }
        return nItems;
    }

    /**
     * Add PhosphorJS menu to native menu bar.
     * 
     * @param menu PhosphorJS menu to add to menu bar
     * @param options Menu options
     */
    addMenu(menu: Menu, options: IMainMenu.IAddOptions = {}): void {
        if (ArrayExt.firstIndexOf(this.menus, menu) > -1) {
            return;
        }

        let rank = 'rank' in options ? options.rank : 100;

        /* Append the menu to the native menu */
        ipc.send(JupyterMenuChannels.MENU_ADD, {
            id: String(rank),
            label: menu.title.label,
            submenu: this.buildNativeMenu(menu)
        });
    }
}