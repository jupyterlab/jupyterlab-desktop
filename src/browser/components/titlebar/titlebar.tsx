// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    JupyterLabWindow
} from 'jupyterlab_app/src/main/window';

import {
    remote, Browser, ipcRenderer
} from 'jupyterlab_app/src/browser/utils';

import {
    JupyterApplicationIPC as AppIPC
} from 'jupyterlab_app/src/ipc';

import * as React from 'react';

export namespace TitleBar {
    export
    interface Props {
        uiState: JupyterLabWindow.UIState;
    }
    
    export
    interface State {
        titleBarSize: number;
    }
}

export
class TitleBar extends React.Component<TitleBar.Props, TitleBar.State> {
    
    constructor (props: TitleBar.Props) {
        super(props);
        this.state = {titleBarSize: Browser.getTopPanelSize()};

        this._handleZoom = this._handleZoom.bind(this);

        ipcRenderer.on(AppIPC.POST_ZOOM_EVENT, this._handleZoom);
    }

    componentWillUnmount() {
        ipcRenderer.removeListener(AppIPC.POST_ZOOM_EVENT, this._handleZoom);
    }

    render () {
        let modClass = 'jpe-mod-' + this.props.uiState;

        let clicked = (type: string) => {
            if (type == 'close') {
                remote.getCurrentWindow().close();
            } else if (type == 'minimize') {
                remote.getCurrentWindow().minimize();
            } else {
                remote.getCurrentWindow().maximize();
            }
        }
        
        // Don't render titlebar buttons on linux or mac
        let content: JSX.Element;
        if (this.props.uiState == 'linux' || this.props.uiState == 'mac') {
            content = null;
        } else {
            content = (
                <div className={'jpe-TitleBar-button-container ' + modClass}>
                    <div className={'jpe-TitleBar-button jpe-TitleBar-close ' + modClass} onClick={() => {clicked('close')}} />
                    <div className={'jpe-TitleBar-button jpe-TitleBar-max ' + modClass} onClick={() => {clicked('minimize')}} />
                    <div className={'jpe-TitleBar-button jpe-TitleBar-min ' + modClass} onClick={() => {clicked('maximize')}} />
                </div>
            );
        }
        
        let style: any = {height: null, minHeight: null};
        if (this.props.uiState == 'mac') {
            style.minHeight = style.height = this.state.titleBarSize;
        }

        return (
            <div className={'jpe-TitleBar-body ' + modClass} style={style}>
                {content}
            </div>
        );
    }

    private _handleZoom() {
        this.setState({titleBarSize: Browser.getTopPanelSize()});
    }
}