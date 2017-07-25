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
function TitleBar(props: TitleBar.Props) {
    return (
        <div className="jpe-TitleBar-body">
            <div className='jpe-TitleBar-button jpe-TitleBar-close' onClick={() => {props.clicked('close')}} />
            <div className='jpe-TitleBar-button jpe-TitleBar-min' onClick={() => {props.clicked('minimize')}} />
            <div className='jpe-TitleBar-button jpe-TitleBar-max' onClick={() => {props.clicked('maximize')}} />
        </div>
    );
}