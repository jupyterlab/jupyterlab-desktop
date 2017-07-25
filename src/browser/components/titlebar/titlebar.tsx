// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as React from 'react';

export namespace TitleBar {
    export
    interface Props {
        clicked: (type: 'close' | 'minimize' | 'maximize') => void;
    }

}

export
class TitleBar extends React.Component<TitleBar.Props, undefined> {

    constructor(props: TitleBar.Props) {
        super(props);
    }

    private onClick(event: any) {
        console.log(event);
    }

    render() {
        return (
            <div className="jpe-TitleBar-body">
                <div className='jpe-TitleBar-button jpe-TitleBar-close' onClick={this.onClick} />
                <div className='jpe-TitleBar-button jpe-TitleBar-min' onClick={this.onClick} />
                <div className='jpe-TitleBar-button jpe-TitleBar-max' onClick={this.onClick} />
            </div>
        );
    }
}