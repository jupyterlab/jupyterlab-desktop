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
} from './main'

import {
    ISessions
} from './sessions';

import {
    AsyncRemote, asyncRemoteMain
} from '../asyncremote';

export
interface INativeMenu {

    addMenu: (menu: INativeMenu.IMenuItemOptions) => Promise<void>;
}

export
namespace INativeMenu {

    export
    let addMenu: AsyncRemote.IMethod<IMenuItemOptions, void> = {
        id: 'JupyterMainMenu-addmenu'
    }

    export
    let clickEvent: AsyncRemote.IEvent<IMenuItemOptions> = {
        id: 'JupyterMainMenu-click'
    }

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

    constructor(app: IApplication, sessions: ISessions) {
        this._jupyterApp = app;
        this._sessions = sessions;
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
                    {type: 'separator'},
                    {
                        label: 'Preferences...',
                        role: 'preferences',
                        command: 'settingeditor:open',
                        accelerator: 'CmdOrCtrl+,',
                    },
                    {type: 'separator'},
                    {role: 'services', submenu: []},
                    {type: 'separator'},
                    {role: 'hide'},
                    {role: 'hideothers'},
                    {role: 'unhide'},
                    {type: 'separator'},
                    {role: 'quit'},
                ]
            } as JupyterMenuItemOptions;
            this._setClickEvents(appMenu);
            this._menu.append(new MenuItem(appMenu));
        }
        Menu.setApplicationMenu(this._menu);
        
        // Register 'menuAdd' remote method
        asyncRemoteMain.registerRemoteMethod(INativeMenu.addMenu, this.addMenu.bind(this));
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

        let items = <INativeMenu.IMenuItemOptions[]>menu.submenu;
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
        let items = this._menu.items;
        /* Check if item has already been inserted */
        for (let i = 0, n = items.length; i < n; i++) {
            if (items[i].label == menu.label)
                return Promise.resolve();
        }

        this._setClickEvents(menu);

        if (!menu.rank)
            menu.rank = 100;

        if (process.platform === 'darwin') {
            if (menu.label === 'Help') {
                /* Tag the Help menu so that macOS adds the standard search box */
                menu.role = 'help';
                /* Remove the Help > About menu item, which belongs in the JupyterLab menu on macOS */
                let submenu = (<JupyterMenuItemOptions[]>menu.submenu);
                menu.submenu = submenu.filter(item => item.command !== 'help:about');
            }
            if (menu.label === 'File') {
                /* Remove the File > Settings menu item, which belongs in the JupyterLab menu on macOS */
                let submenu = (<JupyterMenuItemOptions[]>menu.submenu);
                submenu = submenu.filter(item => item.command !== 'settingeditor:open');
                /* If the last thing in the menu is now a separator, remove it */
                if ('type' in submenu[submenu.length-1] && submenu[submenu.length-1].type === 'separator')
                    submenu.pop();
                menu.submenu = submenu;
            }
        }

        /* Set position in the native menu bar */
        let index = ArrayExt.upperBound(<INativeMenu.IMenuItemOptions[]>items, menu, 
                    (f: INativeMenu.IMenuItemOptions, s: INativeMenu.IMenuItemOptions) => {
                        return f.rank - s.rank;
                    });
        
        this._menu.insert(index, new MenuItem(menu));
        Menu.setApplicationMenu(this._menu);
        return Promise.resolve();
    }

    /**
     * Click event handler. Passes the event on the render process 
     */
    private handleClick(menu: Electron.MenuItem, window: Electron.BrowserWindow): void {
        // Application window is in focus
        if (window) {
            asyncRemoteMain.emitRemoteEvent(INativeMenu.clickEvent, 
                menu as INativeMenu.IMenuItemOptions, window.webContents);
        }
        // No application windows available
        else {
            if (menu.label === 'Add Server'){
                this._sessions.createSession({state: 'remote'});
            }
            else if (menu.label === 'Local'){
                this._sessions.createSession({state: 'local'});
            }

        }
    }

    /**
     * Electron menu object. Stores menu bar contents.
     */
    private _menu: Electron.Menu;

    private _jupyterApp: IApplication;

    private _sessions: ISessions;
}

let service: IService = {
    requirements: ['IApplication', 'ISessions'],
    provides: 'INativeMenu',
    activate: (app: IApplication, sessions: ISessions): INativeMenu => {
        return new JupyterMainMenu(app, sessions);
    },
    autostart: true
}
export default service;