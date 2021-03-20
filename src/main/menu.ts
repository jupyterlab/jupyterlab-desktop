/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import {
    Menu as ElectronMenu
} from 'electron';

import {
    ArrayExt
} from '@lumino/algorithm';

import {
    Menu as PhosphorMenu
} from '@lumino/widgets';

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
import log from 'electron-log';

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

    export
    let updateMenu: AsyncRemote.IMethod<IMenuItemOptions, void> = {
        id: 'JupyterMainMenu-updatemenu'
    };

    export
    let finalizeMenubar: AsyncRemote.IMethod<IMenuItemOptions, void> = {
        id: 'JupyterMainMenu-finalizemenubar'
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

    export
    interface IUpdateMenuItemOptions {
        rank?: number;
        label: string;
        updateItems: PhosphorMenu.IItemOptions[];
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
        this._menuConstructors = [];

        // Register 'menuAdd' remote method
        asyncRemoteMain.registerRemoteMethod(INativeMenu.addMenu, this.addMenu.bind(this));

        // Register 'launchNewEnvironment' remote method
        asyncRemoteMain.registerRemoteMethod(INativeMenu.launchNewEnvironment, this.launchNewEnv.bind(this));

        // Register 'updateMenu' remote method
        asyncRemoteMain.registerRemoteMethod(INativeMenu.updateMenu, this.updateMenu.bind(this));

        // register 'finalizeMenubar' remote method
        asyncRemoteMain.registerRemoteMethod(INativeMenu.finalizeMenubar, this.finalizeMenubar.bind(this));
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
        return new Promise((resolve, reject) => {
            let items = this._menuConstructors;
            /* Check if item has already been inserted */
            for (let i = 0, n = items.length; i < n; i++) {
                if (items[i].label === menu.label) {
                    resolve();
                    return;
                }
            }

            /* Set position in the native menu bar */
            let index = ArrayExt.upperBound((items as INativeMenu.IMenuItemOptions[]), menu,
                (f: INativeMenu.IMenuItemOptions, s: INativeMenu.IMenuItemOptions) => {
                    return f.rank - s.rank;
                });

            ArrayExt.insert(this._menuConstructors, index, menu);
            resolve();
        });
    }

    launchNewEnv(menu: INativeMenu.IMenuItemOptions): Promise<void> {
        return new Promise((resolve, reject) => {
            this._registry.getEnvironmentByPath(menu.args).then(environment => {
                return this._sessions.createSession({ state: 'local', serverOpts: { environment } as JupyterServer.IOptions });
            }).catch(reject);
        });
    }

    updateMenu(menu: INativeMenu.IMenuItemOptions): Promise<void> {
        let updateMenu = new Promise<number>((resolve, reject) => {
            let updateIndex = ArrayExt.findFirstIndex(this._menuConstructors, (template, idx) => {
                return template.label === menu.label;
            });

            if (updateIndex !== -1) {
                this._menuConstructors[updateIndex].submenu = menu.submenu;
                resolve(updateIndex);
            } else {
                reject(new Error(`Menu to update (id: ${menu.label}) not found!`));
            }
        });

        let buildMenu = updateMenu.then(updateIndex => {
            return new Promise<void>((reject, resolve) => {
                this._buildMenu(updateIndex, this._menuConstructors[updateIndex]).then(resolve).catch(reject);
            });
        });

        return buildMenu;
    }

    finalizeMenubar(): Promise<void> {
        this._applicationMenu = new Promise<ElectronMenu>((resolve, reject) => {
            if (process.platform === 'darwin' && this._menuConstructors[0].label !== 'JupyterLab') {
                /* Add macOS 'JupyterLab' app menu with standard menu items */
                let appMenu = {
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
                this._menuConstructors.unshift(appMenu);
            }

            let applicationMenu = ElectronMenu.buildFromTemplate(this._menuConstructors);

            ElectronMenu.setApplicationMenu(applicationMenu);

            resolve(applicationMenu);
        });

        return this._applicationMenu.then(() => {
            return Promise.resolve();
        }).catch(reason => {
            return Promise.reject(reason);
        });
    }

    private _buildMenu(updateIndex: number, menuConstructor: INativeMenu.IMenuItemOptions): Promise<void> {
        return new Promise((resolveMenu, rejectMenu) => {

            let updatedMenuItems = new Promise<INativeMenu.IMenuItemOptions>((resolveItem, rejectItem) => {
                if (process.platform === 'darwin' && menuConstructor.label === 'Help') {
                    /* Tag the Help menu so that macOS adds the standard search box */
                    menuConstructor.role = 'help';
                    /* Remove the Help > About menu item, which belongs in the JupyterLab menu on macOS */
                    let submenu = (menuConstructor.submenu as INativeMenu.IMenuItemOptions[]);
                    menuConstructor.submenu = submenu.filter(item => item.command !== 'help:about');

                    resolveItem(menuConstructor);
                } else if (menuConstructor.label === 'File') {
                    this._generateRegistryMenu(this._registry).then(registrySubMenu => {
                        (menuConstructor.submenu as INativeMenu.IMenuItemOptions[]).splice(1, 0, registrySubMenu);

                        return menuConstructor;
                    }).then(resolveItem).catch(reason => {
                        log.log(`Rejecting item: ${reason}`);
                        rejectItem(reason);
                    });
                } else {
                    resolveItem(menuConstructor);
                }

            });

            updatedMenuItems.then(menuItem => {
                this._setClickEvents(menuItem);

                return this._applicationMenu.then(appMenu => {
                    try {
                        let menuIdxToUpdate = ArrayExt.findFirstIndex(this._menuConstructors, (value, idx) => {
                            return value.label === menuItem.label;
                        });

                        this._menuConstructors[menuIdxToUpdate] = menuItem;
                        let applicationMenu = ElectronMenu.buildFromTemplate(this._menuConstructors);

                        ElectronMenu.setApplicationMenu(applicationMenu);
                        this._applicationMenu = Promise.resolve(applicationMenu);
                    } catch (e) {
                        log.log(`Failed to build MenuItem: ${e}`);
                        rejectMenu(new Error(`Failed to build MenuItem: ${e}`));
                    }
                }).then(resolveMenu).catch(rejectMenu);
            }).catch(reason => {
                log.log(`Rejecting menu: ${reason}`);
                rejectMenu(reason);
            });
        });
    }

    /**
     * Click event handler. Passes the event on the render process
     */
    private handleClick(menu: Electron.MenuItem, window: Electron.BrowserWindow): void {
        // Application window is in focus
        if (window) {
            asyncRemoteMain.emitRemoteEvent(INativeMenu.clickEvent,
                menu as unknown as INativeMenu.IMenuItemOptions, window.webContents);
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
     * Object that describes the content of the menubar. Will be used to finally
     * construct the actual menu.
     */
    private _menuConstructors: INativeMenu.IMenuItemOptions[];

    /**
     * Application menubar. Once instantiated with top level menus, those will never change.
     */
    private _applicationMenu: Promise<ElectronMenu>;

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
