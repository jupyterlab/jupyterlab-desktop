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