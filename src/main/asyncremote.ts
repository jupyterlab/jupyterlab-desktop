// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    IService
} from './main';

import {
    asyncRemoteMain, IAsyncRemoteMain
} from '../asyncremote';

let service: IService = {
    requirements: [],
    provides: 'IMainConnect',
    activate: (): IAsyncRemoteMain => {
        return asyncRemoteMain;
    },
    autostart: true
}
export default service;