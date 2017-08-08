// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as React from 'react';

export
namespace ServerError {
    export
    interface Props {
        launchFromPath: () => void;
    }
}

export
function ServerError(props: ServerError.Props) {
    return (
        <div className='jpe-ServerError-body'>
            <div className='jpe-ServerError-content' >
                <h1>Something Went Wrong!</h1>
                <p>Looks like the Jupyter Server isn't installed. Take a look at jupyter.org for help with installation.</p>
                <button onClick={props.launchFromPath}>Choose a Path</button>
            </div>
        </div>
    );
}
