/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import {
    JSONObject
} from '@phosphor/coreutils';

export
namespace JupyterApplicationIPC {

    export
    namespace Channels {
        
        /**
         * IPC channel for querying platform from renderer
         */
        export
        const GET_PLATFORM = 'get-platform';

        /**
         * IPC channel for sending platform information
         */
        export
        const SEND_PLATFORM = 'send-platform';
        
        export
        const ADD_SERVER = 'add-server';

        export
        const OPEN_CONNECTION = 'new-connection';
    }
}

export
namespace JupyterWindowIPC {

    export
    namespace Channels {
        export
        const STATE_UPDATE = 'window-state-update';
    }

    export
    namespace Data {

        export
        interface WindowOptions extends JSONObject{
            state: 'new' | 'local' | 'remote';
            x?: number;
            y?: number;
            width?: number;
            height?: number;
            serverId?: number;
        }
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
        interface RequestServerStart {
            id: number;
            name: string;
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