// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    JSONObject
} from '@phosphor/coreutils';

import {
    IExposedMethod, 
} from 'jupyterlab_app/src/ipc2/ipc';

import {
    ISettingRegistry
} from '@jupyterlab/coreutils';

export
let fetch: IExposedMethod<string, ISettingRegistry.IPlugin> = {
    id: 'JupyterLabDataConnector-fetch'
}

export
let save: IExposedMethod<ISaveOptions, void> = {
    id: 'JupyterLabDataConnector-save'
}

export
interface ISaveOptions {
    id: string;
    user: JSONObject;
}