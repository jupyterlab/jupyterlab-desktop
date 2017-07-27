// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    JupyterWindowIPC as WindowIPC,
} from 'jupyterlab_app/src/ipc';

import {
    JupyterLabWindow
} from 'jupyterlab_app/src/main/window';

import * as React from 'react';

let ipc = (window as any).require('electron').ipcRenderer;


export namespace TitleBar {
    export
    interface Props {
        uiState: JupyterLabWindow.UIState;
    }

}

export
function TitleBar(props: TitleBar.Props) {

    let modClass = 'jpe-mod-' + props.uiState;

    let clicked = (type: string) => {
        if (type == 'close') {
            ipc.send(WindowIPC.REQUEST_WINDOW_CLOSE);
        } else if (type == 'minimize') {
            ipc.send(WindowIPC.REQUEST_WINDOW_MINIMIZE);
        } else {
            ipc.send(WindowIPC.REQUEST_WINDOW_MAXIMIZE);
        }
    }

    return (
        <div className={'jpe-TitleBar-body ' + modClass}>
            <div className={'jpe-TitleBar-button-container ' + modClass}>
                <div className={'jpe-TitleBar-button jpe-TitleBar-close ' + modClass} onClick={() => {clicked('close')}} />
                <div className={'jpe-TitleBar-button jpe-TitleBar-min ' + modClass} onClick={() => {clicked('minimize')}} />
                <div className={'jpe-TitleBar-button jpe-TitleBar-max ' + modClass} onClick={() => {clicked('maximize')}} />
            </div>
        </div>
    );
}