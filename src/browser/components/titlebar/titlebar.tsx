// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    Browser
} from '../../utils';

import {
    remote
} from 'electron';

import {
    asyncRemoteRenderer
} from '../../../asyncremote';

import {
    IShortcutManager
} from '../../../main/shortcuts';

import {
    ISessions
} from '../../../main/sessions';

import * as React from 'react';

export namespace TitleBar {
    export
    interface Props {
        uiState: string;
    }

    export
    interface State {
        titleBarSize: number;
        maxButtonState: MaxButtonState;
    }

    export
    type MaxButtonState = 'restore' | 'max';
}

export
class TitleBar extends React.Component<TitleBar.Props, TitleBar.State> {

    constructor(props: TitleBar.Props) {
        super(props);

        let maxButtonState = 'max';
        if (remote.getCurrentWindow().isMaximized()) {
            maxButtonState = 'restore';
        }

        this.state = {
            titleBarSize: Browser.getTopPanelSize(),
            maxButtonState: maxButtonState as TitleBar.MaxButtonState
        };

        this._handleZoom = this._handleZoom.bind(this);
        this._handleEnterFullScreen = this._handleEnterFullScreen.bind(this);
        this._handleLeaveFullScreen = this._handleLeaveFullScreen.bind(this);

        asyncRemoteRenderer.onRemoteEvent(IShortcutManager.zoomEvent, this._handleZoom);
        asyncRemoteRenderer.onRemoteEvent(ISessions.enterFullScreenEvent, this._handleEnterFullScreen);
        asyncRemoteRenderer.onRemoteEvent(ISessions.leaveFullScreenEvent, this._handleLeaveFullScreen);
    }

    componentWillUnmount() {
        asyncRemoteRenderer.removeRemoteListener(IShortcutManager.zoomEvent, this._handleZoom);
        asyncRemoteRenderer.removeRemoteListener(ISessions.enterFullScreenEvent, this._handleEnterFullScreen);
        asyncRemoteRenderer.removeRemoteListener(ISessions.leaveFullScreenEvent, this._handleLeaveFullScreen);
    }

    render() {
        let modClass = 'jpe-mod-' + this.props.uiState;

        let style: any = { height: null, minHeight: null };
        if (this.props.uiState === 'mac') {
            style.minHeight = style.height = this.state.titleBarSize;
        }

        // Don't return title bar content on linux and max
        if (this.props.uiState === 'linux' || this.props.uiState === 'mac') {
            return (
                <div className={'jpe-TitleBar-body ' + modClass} style={style} />
            );
        }

        let clicked = (type: string) => {
            let window = remote.getCurrentWindow();
            if (type === 'close') {
                window.close();
            } else if (type === 'minimize') {
                window.minimize();
            } else {
                if (this.state.maxButtonState === 'restore') {
                    window.unmaximize();
                } else {
                    window.maximize();
                }
            }
        };

        return (
            <div className={'jpe-TitleBar-body ' + modClass} style={style}>
                <div className={'jpe-TitleBar-button-container ' + modClass}>
                    <div className={'jpe-TitleBar-button jpe-TitleBar-close ' + modClass} onClick={() => { clicked('close'); }} />
                    <div className={'jpe-TitleBar-button jpe-TitleBar-' + this.state.maxButtonState + ' ' + modClass} onClick={() => { clicked('maximize'); }} />
                    <div className={'jpe-TitleBar-button jpe-TitleBar-min ' + modClass} onClick={() => { clicked('minimize'); }} />
                </div>
            </div>
        );
    }

    private _handleZoom() {
        this.setState({ titleBarSize: Browser.getTopPanelSize() });
    }

    private _handleEnterFullScreen() {
        this.setState({ maxButtonState: 'restore' });
    }

    private _handleLeaveFullScreen() {
        this.setState({ maxButtonState: 'max' });
    }
}
