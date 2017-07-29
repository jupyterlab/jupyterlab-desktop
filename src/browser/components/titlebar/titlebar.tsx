// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    JupyterLabWindow
} from 'jupyterlab_app/src/main/window';

import * as React from 'react';

let remote: Electron.Remote = (window as any).require('electron').remote;


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
            remote.getCurrentWindow().close();
        } else if (type == 'minimize') {
            remote.getCurrentWindow().minimize();
        } else {
            remote.getCurrentWindow().maximize();
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