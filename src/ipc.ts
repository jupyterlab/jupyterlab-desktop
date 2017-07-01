/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

export
namespace JupyterMenuChannels {

    /**
     * IPC channel for appending menus to the native menu bar
     */
    export
    let MENU_APPEND = 'menu-append';

    /**
     * IPC channel for recieveing click events
     */
    export
    let CLICK_EVENT = 'menu-click';
}