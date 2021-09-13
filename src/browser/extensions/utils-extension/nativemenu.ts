// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    ArrayExt
} from '@lumino/algorithm';

import {
    Menu
} from '@lumino/widgets';

import {
    IDisposable
} from '@lumino/disposable';

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
    IMainMenu, FileMenu, EditMenu, ViewMenu, HelpMenu, KernelMenu, RunMenu, SettingsMenu, TabsMenu
} from '@jupyterlab/mainmenu';


/**
 * The main menu class. Interacts with the electron main process
 * to setup native menu bar.
 */
export
class NativeMenu implements IMainMenu {

    constructor(private app: JupyterLab) {
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

        let commands = app.commands;

        this.editMenu = new NativeEditMenu({ commands });
        this.fileMenu = new NativeFileMenu({ commands });
        this.helpMenu = new NativeHelpMenu({ commands });
        this.kernelMenu = new NativeKernelMenu({ commands });
        this.runMenu = new NativeRunMenu({ commands });
        this.settingsMenu = new NativeSettingsMenu({ commands });
        this.viewMenu = new NativeViewMenu({ commands });
        this.tabsMenu = new NativeTabsMenu({ commands });

        this.addMenu(this.fileMenu.menu, { rank: 0 });
        this.addMenu(this.editMenu.menu, { rank: 1 });
        this.addMenu(this.viewMenu.menu, { rank: 2 });
        this.addMenu(this.runMenu.menu, { rank: 3 });
        this.addMenu(this.kernelMenu.menu, { rank: 4 });
        this.addMenu(this.tabsMenu.menu, { rank: 500 });
        this.addMenu(this.settingsMenu.menu, { rank: 999 });
        this.addMenu(this.helpMenu.menu, { rank: 1000 });

        asyncRemoteRenderer.runRemoteMethod(INativeMenu.finalizeMenubar, undefined);
    }

    /**
     * Add PhosphorJS menu to native menu bar.
     *
     * @param menu PhosphorJS menu to add to menu bar
     * @param options Menu options
     */
    addMenu(menu: Menu, options: IMainMenu.IAddOptions = {}): Promise<void> {
        if (ArrayExt.findFirstIndex(this._items, (item, idx) => item.menu === menu) > -1) {
            return;
        }

        let rank = 'rank' in options ? options.rank : 100;
        let rankItem = { menu, rank };
        let index = ArrayExt.upperBound(this._items, rankItem, Private.itemCmp);

        // Upon disposal, remove the menu and its rank reference.
        menu.disposed.connect(this._onMenuDisposed, this);

        let menuItem: INativeMenu.IMenuItemOptions = {
            rank: rank,
            label: menu.title.label,
            submenu: buildNativeMenu(menu),
        };

        ArrayExt.insert(this._items, index, rankItem);
        /* Add the menu to the native menu */
        return asyncRemoteRenderer.runRemoteMethod(INativeMenu.addMenu, menuItem);
    }

    /**
     * Dispose of the resources held by the menu bar.
     */
    dispose(): void {
        this.editMenu.dispose();
        this.fileMenu.dispose();
        this.helpMenu.dispose();
        this.kernelMenu.dispose();
        this.runMenu.dispose();
        this.settingsMenu.dispose();
        this.viewMenu.dispose();
        this.tabsMenu.dispose();
    }

    /**
     * Handle the disposal of a menu.
     */
    private _onMenuDisposed(menu: Menu): void {
        let index = ArrayExt.findFirstIndex(this._items, item => item.menu === menu);
        if (index !== -1) {
            ArrayExt.removeAt(this._items, index);
        }
    }

    private _items: Private.IRankItem[] = [];

    /**
     * The application "Edit" menu.
     */
    readonly editMenu: NativeEditMenu;

    /**
     * The application "File" menu.
     */
    readonly fileMenu: NativeFileMenu;

    /**
     * The application "Help" menu.
     */
    readonly helpMenu: NativeHelpMenu;

    /**
     * The application "Kernel" menu.
     */
    readonly kernelMenu: NativeKernelMenu;

    /**
     * The application "Run" menu.
     */
    readonly runMenu: NativeRunMenu;

    /**
     * The application "Settings" menu.
     */
    readonly settingsMenu: NativeSettingsMenu;

    /**
     * The application "View" menu.
     */
    readonly viewMenu: NativeViewMenu;

    /**
     * The application "Tabs" menu.
     */
    readonly tabsMenu: NativeTabsMenu;
}

class NativeEditMenu extends EditMenu {
    constructor(options: Menu.IOptions) {
        super(options);
    }

    addGroup(items: Menu.IItemOptions[], rank?: number): IDisposable {
        const added = super.addGroup(items, rank);

        let menuItem: INativeMenu.IMenuItemOptions = {
            label: this.menu.title.label,
            submenu: buildNativeMenu(this.menu)
        };

        asyncRemoteRenderer.runRemoteMethod(INativeMenu.updateMenu, menuItem);

        return added;
    }
}

class NativeFileMenu extends FileMenu {
    constructor(options: Menu.IOptions) {
        super(options);
    }

    addGroup(items: Menu.IItemOptions[], rank?: number): IDisposable {
        const res = super.addGroup(items, rank);

        let menuItem: INativeMenu.IMenuItemOptions = {
            label: this.menu.title.label,
            submenu: buildNativeMenu(this.menu)
        };

        asyncRemoteRenderer.runRemoteMethod(INativeMenu.updateMenu, menuItem);

        return res;
    }
}

class NativeHelpMenu extends HelpMenu {
    constructor(options: Menu.IOptions) {
        super(options);
    }

    addGroup(items: Menu.IItemOptions[], rank?: number): IDisposable {
        const added = super.addGroup(items, rank);

        let menuItem: INativeMenu.IMenuItemOptions = {
            label: this.menu.title.label,
            submenu: buildNativeMenu(this.menu)
        };

        asyncRemoteRenderer.runRemoteMethod(INativeMenu.updateMenu, menuItem);

        return added;
    }
}

class NativeKernelMenu extends KernelMenu {
    constructor(options: Menu.IOptions) {
        super(options);
    }

    addGroup(items: Menu.IItemOptions[], rank?: number): IDisposable {
        const added = super.addGroup(items, rank);

        let menuItem: INativeMenu.IMenuItemOptions = {
            label: this.menu.title.label,
            submenu: buildNativeMenu(this.menu)
        };

        asyncRemoteRenderer.runRemoteMethod(INativeMenu.updateMenu, menuItem);

        return added;
    }
}

class NativeRunMenu extends RunMenu {
    constructor(options: Menu.IOptions) {
        super(options);
    }

    addGroup(items: Menu.IItemOptions[], rank?: number): IDisposable {
        const res = super.addGroup(items, rank);

        let menuItem: INativeMenu.IMenuItemOptions = {
            label: this.menu.title.label,
            submenu: buildNativeMenu(this.menu)
        };

        asyncRemoteRenderer.runRemoteMethod(INativeMenu.updateMenu, menuItem);

        return res;
    }
}

class NativeSettingsMenu extends SettingsMenu {
    constructor(options: Menu.IOptions) {
        super(options);
    }

    addGroup(items: Menu.IItemOptions[], rank?: number): IDisposable {
        const res = super.addGroup(items, rank);

        let menuItem: INativeMenu.IMenuItemOptions = {
            label: this.menu.title.label,
            submenu: buildNativeMenu(this.menu)
        };

        asyncRemoteRenderer.runRemoteMethod(INativeMenu.updateMenu, menuItem);

        return res;
    }
}

class NativeViewMenu extends ViewMenu {
    constructor(options: Menu.IOptions) {
        super(options);
    }

    addGroup(items: Menu.IItemOptions[], rank?: number): IDisposable {
        const res = super.addGroup(items, rank);

        let menuItem: INativeMenu.IMenuItemOptions = {
            label: this.menu.title.label,
            submenu: buildNativeMenu(this.menu)
        };

        asyncRemoteRenderer.runRemoteMethod(INativeMenu.updateMenu, menuItem);
        
        return res;
    }
}

class NativeTabsMenu extends TabsMenu {
    constructor(options: Menu.IOptions) {
        super(options);
    }

    addGroup(items: Menu.IItemOptions[], rank?: number): IDisposable {
        const res = super.addGroup(items, rank);

        let menuItem: INativeMenu.IMenuItemOptions = {
            label: this.menu.title.label,
            submenu: buildNativeMenu(this.menu)
        };

        asyncRemoteRenderer.runRemoteMethod(INativeMenu.updateMenu, menuItem);

        return res;
    }
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
function buildNativeMenu(menu: Menu): INativeMenu.IMenuItemOptions[] {
    let items = menu.items;
    let nItems = new Array<INativeMenu.IMenuItemOptions>(items.length);
    for (let i = 0; i < items.length; i++) {
        nItems[i] = { command: null, type: null, label: null, submenu: null, accelerator: null };

        if (items[i].type === 'command') {
            nItems[i].type = 'normal';
        } else {
            nItems[i].type = (items[i].type as 'normal' | 'submenu' | 'separator');
        }
        nItems[i].label = items[i].label;
        nItems[i].command = items[i].command;
        nItems[i].args = items[i].args;

        // Dynmaic values will need to wait for a better native menu system
        // nItems[i].checked = items[i].isToggled;
        // nItems[i].enabled = !items[i].isEnabled;

        if (items[i].submenu !== null) {
            nItems[i].submenu = buildNativeMenu(items[i].submenu);
        }
    }

    return dedupSeparatorsMenu(nItems);
}

function dedupSeparatorsMenu(arr: INativeMenu.IMenuItemOptions[]): INativeMenu.IMenuItemOptions[] {
    // Setting to true initially so that leading separators will be removed
    let lastWasSeparator = true;
    let filterItems = arr.filter((menuItem, idx, arr) => {
        if (lastWasSeparator) {
            if (menuItem.type === 'separator') {
                return false;
            } else {
                lastWasSeparator = false;
                return true;
            }
        } else {
            if (menuItem.type === 'separator') {
                lastWasSeparator = true;
            }

            return true;
        }
    });

    // If the last item was a separator, remove it
    if (lastWasSeparator) {
        filterItems.pop();
    }

    return filterItems;
}

/**
 * A namespace for private data.
 */
namespace Private {
    /**
     * An object which holds a menu and its sort rank.
     */
    export
    interface IRankItem {
        /**
         * The menu for the item.
         */
        menu: Menu;

        /**
         * The sort rank of the menu.
         */
        rank: number;
    }

    /**
     * A comparator function for menu rank items.
     */
    export
    function itemCmp(first: IRankItem, second: IRankItem): number {
        return first.rank - second.rank;
    }
}
