/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import {
    JupyterServer as ServerDesc
} from './main/app';

export
namespace JupyterApplicationIPC {

    export
    namespace Channels {
        export
        const START_SERVER_MANAGER_WINDOW = 'start-server-manager-window';
        
        /**
         * IPC channel for querying platform from renderer
         */
        export
        let GET_PLATFORM = 'get-platform';

        /**
         * IPC channel for sending platform information
         */
        export
        let SEND_PLATFORM = 'send-platform';
    }
}

export
namespace JupyterServerIPC {
    
    export
    namespace Channels {
        /**
         * IPC channel for render process signaling
         */
        export
        const REQUEST_SERVER_START = 'request-server-start';
        
        /**
         * IPC channel for render process signaling
         */
        export
        const REQUEST_SERVER_STOP = 'request-server-stop';

        /**
         * IPC channel for sending jupyter server data
         */
        export
        const SERVER_STARTED = 'server-started';
    }

    export
    namespace Data {
        /**
         * Interface for Jupyter Server data
         */
        export
        interface JupyterServer {
            id: number;
            server: ServerDesc.ServerDesc;
        }
    }
}


export
namespace JupyterMenuChannels {

    /**
     * IPC channel for appending menus to the native menu bar
     */
    export
    const MENU_ADD = 'menu-add';

    /**
     * IPC channel for receiving click events
     */
    export
    const CLICK_EVENT = 'menu-click';
}