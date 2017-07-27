// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as React from 'react';

import {
    JupyterLabWindow
} from 'jupyterlab_app/src/main/window';

export namespace TitleBar {
    export
    interface Props {
        clicked: (type: 'close' | 'minimize' | 'maximize') => void;
        uiState: JupyterLabWindow.UIState;
    }

}

export
function TitleBar(props: TitleBar.Props) {

    let modClass = 'jpe-mod-' + props.uiState;

    return (
        <div className={'jpe-TitleBar-body ' + modClass}>
            <div className={'jpe-TitleBar-button-container ' + modClass}>
                <div className={'jpe-TitleBar-button jpe-TitleBar-close ' + modClass} onClick={() => {props.clicked('close')}} />
                <div className={'jpe-TitleBar-button jpe-TitleBar-min ' + modClass} onClick={() => {props.clicked('minimize')}} />
                <div className={'jpe-TitleBar-button jpe-TitleBar-max ' + modClass} onClick={() => {props.clicked('maximize')}} />
            </div>
        </div>
    );
}