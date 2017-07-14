/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

export
namespace JupyterAppChannels {
    
    /**
     * IPC channel for render process signaling
     */
    export
    let RENDER_PROCESS_READY = 'render-ready';

    /**
     * IPC channel for sending jupyter server data
     */
    export
    let SERVER_DATA = 'server-data';

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

export
namespace JupyterMenuChannels {

    /**
     * IPC channel for appending menus to the native menu bar
     */
    export
    let MENU_ADD = 'menu-add';

    /**
     * IPC channel for receiving click events
     */
    export
    let CLICK_EVENT = 'menu-click';
}