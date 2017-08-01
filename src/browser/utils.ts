// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    JSONObject
} from '@phosphor/coreutils';


export
namespace JupyterServer {

    export
    interface IServer extends JSONObject {
        token: string;
        url: string;
        type: 'local' | 'remote';
        name: string;
    }

    export
    function verifyServer(server: IServer): boolean {
        return !(!server.token || !server.url || !server.type || !server.name);
    }
}

/**
 * Require electron from window object. This prevents webpack from trying
 * to resolve the window object. window.require is defined in the electron
 * environment.
 */
export
let ipcRenderer = (window as any).require('electron').ipcRenderer;