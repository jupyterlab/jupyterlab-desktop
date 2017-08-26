// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    IService
} from './main';

import {
    mainConnect, IMainConnect
} from '../ipc2/main';

let service: IService = {
    requirements: [],
    provides: 'IMainConnect',
    activate: (): IMainConnect => {
        return mainConnect;
    },
    autostart: true
}
export default service;