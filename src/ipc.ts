/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------
|
| Data structures and channel descriptions used for communication between the
| main and render processes
*/

import {
    JSONObject
} from '@phosphor/coreutils';

import {
    MenuItemConstructorOptions
} from './main/menu';

import {
    JupyterLabSession
} from './main/sessions';

export
namespace JupyterApplicationIPC {

    /**
     * Request launching a new window with the 'Add Server'
     * form.
     * 
     * @param none
     * 
     * RESPONSE: NONE
     */
    export
    const REQUEST_ADD_SERVER = 'add-server';

    /**
     * Request launching a new window connected to a server.
     * 
     * @param JupyterApplicationIPC.IOpenConnection Ther server to connect to.
     * 
     * RESPONSE: NONE
     */
    export
    const REQUEST_OPEN_CONNECTION = 'new-connection';

    export
    const POST_ZOOM_EVENT = 'zoom-event';

    export
    const LAB_READY = 'lab-ready';

    export 
    const OPEN_FILES = 'open-files';
    
    export
    const REQUEST_LAB_HOME_DIR = 'get-lab-dir';

    export
    const LAB_HOME_DIR = 'lab-dir';

    export
    interface IOpenConnection {
        type: 'local' | 'remote';
        remoteServerId?: number;
    }
}

export
namespace JupyterWindowIPC {

    /**
     * Send updated window state to the main process. Keeps the
     * main process up-to-date on changes to the window. Most importantly,
     * this is how the render process notifies the main process of a server
     * change/selection.
     * 
     * @param JupyterWindowIPC.IWindowState The updated window options.
     * 
     * RESPONSE: NONE
     */
    export
    const REQUEST_STATE_UPDATE = 'window-state-update';

    export
    const POST_MAXIMIZE_EVENT = 'window-maximize';
    
    export
    const POST_MINIMIZE_EVENT = 'window-minimize';
    
    export
    const POST_UNMAXIMIZE_EVENT = 'window-unmaximize';
    
    export
    const POST_RESTORE_EVENT = 'window-restore';

    export
    interface IWindowState extends JSONObject {
        serverState: JupyterLabSession.ServerState;
        remoteServerId?: number; 
        uiState: JupyterLabSession.UIState;
        platform: NodeJS.Platform;
    }
}

export
namespace JupyterServerIPC {
    
    /**
     * Request a that a local server is started.
     * 
     * @param none
     * 
     * RESPONSE: RESPOND_SERVER_STARTED 
     */
    export
    const REQUEST_SERVER_START = 'request-server-start';
    
    export
    const REQUEST_SERVER_START_PATH = 'request-server-start-path';

    export
    const POST_PATH_SELECTED = 'poast-path-selected';
    
    /**
     * Response to REQUEST_SERVER_START. Sent when the 
     * server is spawned and is running.
     * 
     * @return JupyterServerIPC.ServerStarted which contains
     *         the description of the statrted server and the Id
     *         required to kill the server.
     * 
     * REQUEST: REQUEST_SERVER_START
     */
    export
    const RESPOND_SERVER_STARTED = 'server-started';

    export
    const RESPOND_SERVER_AUTHENTICATED = 'remote-server-authenitcated';
    
    /**
     * Request that a server spwaned by the main process
     * is killed.
     * 
     * @param JupyterServerIPC.RequestServerStop that specifies
     *        the factoryId of the spawned server.
     * 
     * RESPONSE: NONE
     */
    export
    const REQUEST_SERVER_STOP = 'request-server-stop';

    export
    interface IServerStarted {
        readonly factoryId: number;
        url: string;
        token: string;
        err?: any;
    }

    export
    interface IRequestServerStop {
        factoryId: number;
    }
}


export
namespace JupyterMenuIPC {

    /**
     * Request that an item is added to the native menu bar.
     * 
     * @param JupyterMenuIPC.JupyterMenuItemOptions Describes
     *        the menu to add to the menu bar.
     * 
     * RESPONSE: NONE
     */
    export
    const REQUEST_MENU_ADD = 'menu-add';

    /**
     * Post a click event to a window.
     * 
     * @param JupyterMenuIPC.JupyterMenuItemOptions The menu item
     *        that was clicked.
     */
    export
    const POST_CLICK_EVENT = 'menu-click';

    /**
     * Jupyter main menu item description. Conforms to the menu description
     * required by electron.
     */
    export
    interface JupyterMenuItemOptions extends MenuItemConstructorOptions {

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