// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    IService
} from 'jupyterlab_app/src/main/main';

import {
    mainConnect, IMainConnect
} from 'jupyterlab_app/src/ipc2/main';

let service: IService = {
    requirements: [],
    provides: 'IMainConnect',
    activate: (): IMainConnect => {
        return mainConnect;
    },
    autostart: true
}
export default service;