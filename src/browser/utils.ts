// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    JSONObject
} from '@phosphor/coreutils';

/**
 * webpack will resolve electron dependencies we don't want to
 * resolve. This code prevents webpack from doing that.
 */
export
let ipcRenderer = (window as any).require('electron').ipcRenderer;
export
let remote: Electron.Remote = (window as any).require('electron').remote;
export
let webFrame: Electron.WebFrame = (window as any).require('electron').webFrame;

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


export
namespace Browser {

    export
    function getTopPanelSize(): number {
        return 23 / webFrame.getZoomFactor();
    }
}
