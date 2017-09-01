/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import {
    Menu, MenuItem, ipcMain
} from 'electron';

import {
    ArrayExt
} from '@phosphor/algorithm';

import {
    JupyterMenuIPC as MenuIPC
} from '../ipc';

import {
    IApplication
} from './app';

import {
    IService
} from './main'

import {
    ISessions
} from './sessions';

type JupyterMenuItemOptions = MenuIPC.JupyterMenuItemOptions;

export
type MenuItemConstructorOptions = Electron.MenuItemConstructorOptions;

export
interface IMainMenu {}

/**
 * Native main menu bar class
 */
export
class JupyterMainMenu implements IMainMenu {

    constructor(app: IApplication, sessions: ISessions) {
        this._jupyterApp = app;
        this._sessions = sessions;
        this._menu = new Menu();
        
        /* Register MENU_ADD event */
        ipcMain.on(MenuIPC.REQUEST_MENU_ADD, (event: any, menu: JupyterMenuItemOptions) => {
            this._addMenu(event, menu);
        });

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
    }

    /**
     * Set the click event handler for all items in menu item tree
     * 
     * @param menu A menu being added to the menu bar. 
     */
    private _setClickEvents(menu: JupyterMenuItemOptions): void {
        let boundClick = this.handleClick.bind(this);
        if (menu.submenu === null || menu.submenu === undefined) {
            menu.click = boundClick;
            return;
        }

        let items = <JupyterMenuItemOptions[]>menu.submenu;
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
     * @param event The ipc event object 
     * @param menu The menu item configuration
     */
    private _addMenu(event: any, menu: JupyterMenuItemOptions) {
        let items = this._menu.items;
        /* Check if item has already been inserted */
        for (let i = 0, n = items.length; i < n; i++) {
            if (items[i].label == menu.label)
                return;
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
        let index = ArrayExt.upperBound(<JupyterMenuItemOptions[]>items, menu, 
                    (f: JupyterMenuItemOptions, s: JupyterMenuItemOptions) => {
                        return f.rank - s.rank;
                    });
        
        this._menu.insert(index, new MenuItem(menu));
        Menu.setApplicationMenu(this._menu);
    }

    /**
     * Click event handler. Passes the event on the render process 
     */
    private handleClick(menu: Electron.MenuItem, window: Electron.BrowserWindow): void {
        // Application window is in focus
        if (window){
             window.webContents.send(MenuIPC.POST_CLICK_EVENT, menu as JupyterMenuItemOptions);
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
    provides: 'IMainMenu',
    activate: (app: IApplication, sessions: ISessions): IMainMenu => {
        return new JupyterMainMenu(app, sessions);
    },
    autostart: true
}
export default service;