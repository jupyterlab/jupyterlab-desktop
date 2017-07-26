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
     * @param JupyterServerIPC.ServerDesc Ther server to connect to.
     * 
     * RESPONSE: NONE
     */
    export
    const REQUEST_OPEN_CONNECTION = 'new-connection';
}

export
namespace JupyterWindowIPC {

    /**
     * Send updated window state to the main process. Keeps the
     * main process up-to-date on changes to the window. Most importantly,
     * this is how the render process notifies the main process of a server
     * change/selection.
     * 
     * @param JupyterWindowIPC.WindowOptions The updated window options.
     * 
     * RESPONSE: NONE
     */
    export
    const REQUEST_STATE_UPDATE = 'window-state-update';

    export
    const REQUEST_WINDOW_CLOSE = 'window-close';

    export
    const REQUEST_WINDOW_MINIMIZE = 'window-minimize';

    export
    const REQUEST_WINDOW_MAXIMIZE = 'window-maximize'

    export
    interface WindowOptions extends JSONObject{
        state: 'new' | 'local' | 'remote';
        platform?: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        serverId?: number;
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

    /**
     * Server connection descriptor.
     */
    export
    interface ServerDesc extends JSONObject {
        /**
         * Server ID. Should be unique to each server.
         */
        id: number;

        /**
         * The tyoe of server
         */
        type: 'remote' | 'local';

        /**
         * Name that appears in the html
         */
        name: string;

        /**
         * Server url
         */
        url?: string;

        token?: string;
    }

    export
    interface ServerStarted {
        factoryId: number;
        server: ServerDesc;
        err?: any;
    }

    export
    interface RequestServerStop {
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