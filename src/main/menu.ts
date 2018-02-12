/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import {
    Menu, MenuItem
} from 'electron';

import {
    ArrayExt
} from '@phosphor/algorithm';

import {
    IApplication
} from './app';

import {
    IService
} from './main';

import {
    ISessions
} from './sessions';

import {
    AsyncRemote, asyncRemoteMain
} from '../asyncremote';

import {
    IRegistry
} from './registry';

import { JupyterServer } from 'src/main/server';

export
    interface INativeMenu {

    addMenu: (menu: INativeMenu.IMenuItemOptions) => Promise<void>;
}

export
namespace INativeMenu {

    export
        let addMenu: AsyncRemote.IMethod<IMenuItemOptions, void> = {
            id: 'JupyterMainMenu-addmenu'
        };

    export
        let clickEvent: AsyncRemote.IEvent<IMenuItemOptions> = {
            id: 'JupyterMainMenu-click'
        };

    export
        let launchNewEnvironment: AsyncRemote.IMethod<IMenuItemOptions, void> = {
            id: 'JupyterEnvironments-launch'
        };

    /**
     * Jupyter main menu item description. Conforms to the menu description
     * required by electron.
     */
    export
        interface IMenuItemOptions extends Electron.MenuItemConstructorOptions {

        /**
         * Rank of the menu item. Lower ranks float to the front of the menu.
         * Default value is 100.
         */
        rank?: number;

        /**
         * The command to run when the item is clicked. Sent to the
         * render process via IPC.
         */
        command?: string;

        /**
         * Optional arguments to the command
         */
        args?: any;
    }
}

/**
 * Native main menu bar class
 */
class JupyterMainMenu implements INativeMenu {

    constructor(app: IApplication, sessions: ISessions, registry: IRegistry) {
        // this._jupyterApp = app;
        this._sessions = sessions;
        this._registry = registry;
        this._menu = new Menu();

        if (process.platform === 'darwin') {
            /* Add macOS 'JupyterLab' app menu with standard menu items */
            let appMenu = {
                id: '-1',
                label: 'JupyterLab',
                submenu: [
                    {
                        label: 'About JupyterLab',
                        command: 'help:about',
                    },
                    { type: 'separator' },
                    { role: 'services', submenu: [] },
                    { type: 'separator' },
                    { role: 'hide' },
                    { role: 'hideothers' },
                    { role: 'unhide' },
                    { type: 'separator' },
                    { role: 'quit' },
                ]
            } as INativeMenu.IMenuItemOptions;
            this._setClickEvents(appMenu);
            this._menu.append(new MenuItem(appMenu));
        }
        Menu.setApplicationMenu(this._menu);

        // Register 'menuAdd' remote method
        asyncRemoteMain.registerRemoteMethod(INativeMenu.addMenu, this.addMenu.bind(this));

        // Register 'launchNewEnvironment' remote method
        asyncRemoteMain.registerRemoteMethod(INativeMenu.launchNewEnvironment, this.launchNewEnv.bind(this));
    }

    /**
     * Set the click event handler for all items in menu item tree
     *
     * @param menu A menu being added to the menu bar.
     */
    private _setClickEvents(menu: INativeMenu.IMenuItemOptions): void {
        let boundClick = this.handleClick.bind(this);
        if (menu.submenu === null || menu.submenu === undefined) {
            menu.click = boundClick;
            return;
        }

        let items = (menu.submenu as INativeMenu.IMenuItemOptions[]);
        for (let i = 0, n = items.length; i < n; i++) {
            this._setClickEvents(items[i]);
        }
    }

    /**
     * Add a menu to the menubar.
     * Sets up click handlers on submenu tree items.
     * Chooses menubar position of menu based on the 'id' field string.
     * Lower numbers in the 'id' field float up in the menubar
     *
     * @param menu The menu item configuration
     */
    addMenu(menu: INativeMenu.IMenuItemOptions): Promise<void> {
        return new Promise((reject, resolve) => {
            let items = this._menu.items;
            /* Check if item has already been inserted */
            for (let i = 0, n = items.length; i < n; i++) {
                if (items[i].label === menu.label) {
                    resolve();
                    return;
                }
            }

            if (process.platform === 'darwin') {
                if (menu.label === 'Help') {
                    /* Tag the Help menu so that macOS adds the standard search box */
                    menu.role = 'help';
                    /* Remove the Help > About menu item, which belongs in the JupyterLab menu on macOS */
                    let submenu = (menu.submenu as INativeMenu.IMenuItemOptions[]);
                    menu.submenu = submenu.filter(item => item.command !== 'help:about');
                }
            }

            if (menu.label === 'File') {
                this._generateRegistryMenu(this._registry).then(registrySubMenu => {
                    (menu.submenu as INativeMenu.IMenuItemOptions[]).splice(1, 0, registrySubMenu);

                    return menu;
                }).then(updatedMenu => {
                    this._setClickEvents(updatedMenu);

                    if (!updatedMenu.rank) {
                        updatedMenu.rank = 100;
                    }

                    /* Set position in the native menu bar */
                    let index = ArrayExt.upperBound((items as INativeMenu.IMenuItemOptions[]), updatedMenu,
                        (f: INativeMenu.IMenuItemOptions, s: INativeMenu.IMenuItemOptions) => {
                            return f.rank - s.rank;
                        });

                    this._menu.insert(index, new MenuItem(updatedMenu));
                    Menu.setApplicationMenu(this._menu);

                    resolve();
                });
            } else {
                this._setClickEvents(menu);

                if (!menu.rank) {
                    menu.rank = 100;
                }

                /* Set position in the native menu bar */
                let index = ArrayExt.upperBound((items as INativeMenu.IMenuItemOptions[]), menu,
                    (f: INativeMenu.IMenuItemOptions, s: INativeMenu.IMenuItemOptions) => {
                        return f.rank - s.rank;
                    });

                this._menu.insert(index, new MenuItem(menu));
                Menu.setApplicationMenu(this._menu);
                resolve();
            }
        });
    }

    launchNewEnv(menu: INativeMenu.IMenuItemOptions): Promise<void> {
        return new Promise((resolve, reject) => {
            this._registry.getEnvironmentByPath(menu.args).then(environment => {
                return this._sessions.createSession({ state: 'local', serverOpts: { environment } as JupyterServer.IOptions });
            }).catch(reject);
        });
    }

    /**
     * Click event handler. Passes the event on the render process
     */
    private handleClick(menu: Electron.MenuItem, window: Electron.BrowserWindow): void {
        // Application window is in focus
        if (window) {
            asyncRemoteMain.emitRemoteEvent(INativeMenu.clickEvent,
                menu as INativeMenu.IMenuItemOptions, window.webContents);
        } else {
            if (menu.label === 'Add Server') {
                this._sessions.createSession({ state: 'remote' });
            } else if (menu.label === 'Local') {
                this._sessions.createSession({ state: 'local' });
            }

        }
    }

    private _generateRegistryMenu(registry: IRegistry): Promise<INativeMenu.IMenuItemOptions> {
        return registry.getEnvironmentList().then(envList => {
            let registryMenu: INativeMenu.IMenuItemOptions = {
                label: 'New Environment',
                type: 'submenu',
                accelerator: null,
                submenu: envList.map<INativeMenu.IMenuItemOptions>(env => {
                    return { label: env.name, type: 'normal', accelerator: null, command: INativeMenu.launchNewEnvironment.id, args: env.path };
                }),
                args: {},
                command: ''
            };
            return registryMenu;
        });
    }

    /**
     * Electron menu object. Stores menu bar contents.
     */
    private _menu: Electron.Menu;

    // private _jupyterApp: IApplication;

    private _sessions: ISessions;

    private _registry: IRegistry;
}

let service: IService = {
    requirements: ['IApplication', 'ISessions', 'IRegistry'],
    provides: 'INativeMenu',
    activate: (app: IApplication, sessions: ISessions, registry: IRegistry): INativeMenu => {
        return new JupyterMainMenu(app, sessions, registry);
    },
    autostart: true
};
export default service;
