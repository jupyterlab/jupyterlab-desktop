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
    INativeMenu
} from '../../../main/menu';

import {
    asyncRemoteRenderer
} from '../../../asyncremote';

import {
    IMainMenu
} from '@jupyterlab/apputils';


/**
 * The main menu class. Interacts with the electron main process
 * to setup native menu bar.
 */
export
class NativeMenu extends MenuBar implements IMainMenu {

    constructor(private app: JupyterLab) {
        super();

        // Register click event listener
        asyncRemoteRenderer.onRemoteEvent(INativeMenu.clickEvent, (opts) => {
            if (opts.command === INativeMenu.launchNewEnvironment.id) {
                asyncRemoteRenderer.runRemoteMethod(INativeMenu.launchNewEnvironment, opts);
            } else if (this.app.commands.hasCommand(opts.command)) {
                return this.app.commands.execute(opts.command, opts.args);
            } else {
                return Promise.reject(new Error(`Command (${opts.command}) not found`));
            }
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
    private buildNativeMenu(menu: Menu): INativeMenu.IMenuItemOptions[] {
        let items = menu.items;
        let nItems = new Array<INativeMenu.IMenuItemOptions>(items.length);
        for (let i = 0; i < items.length; i++) {
            nItems[i] = {command: null, type: null, label: null, submenu: null, accelerator: null};

            if (items[i].type === 'command') {
                nItems[i].type = 'normal';
            } else {
                nItems[i].type = (items[i].type as 'normal' | 'submenu' | 'separator');
            }
            nItems[i].label = items[i].label;
            nItems[i].command = items[i].command;
            nItems[i].args = items[i].args;

            if (items[i].submenu !== null) {
                nItems[i].submenu = this.buildNativeMenu(items[i].submenu);
            }
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
        let menuItem: INativeMenu.IMenuItemOptions = {
            rank: rank,
            label: menu.title.label,
            submenu: this.buildNativeMenu(menu)
        };

        /* Add the menu to the native menu */
        asyncRemoteRenderer.runRemoteMethod(INativeMenu.addMenu, menuItem);
    }
}
