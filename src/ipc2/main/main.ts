// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    ipcMain
} from 'electron';

import {
    IExposedMethodPrivate, Utils
} from 'jupyterlab_app/src/ipc2/ipc';

export
interface IMainConnect {

    registerExposedMethod: <T, U>(method: IExposedMethodPrivate<T, U>) => void;
}

class MainConnect implements IMainConnect {

    constructor() {
        ipcMain.on(Utils.IPC_REQUEST_EXECUTE, this._executeMethod.bind(this));
    }
    
    registerExposedMethod<T, U>(method: IExposedMethodPrivate<T, U>): void {
        this._methods[method.id] = method;
    }

    private _executeMethod(evt: Electron.Event, data: Utils.IExecuteRequest<any>): void {
        let responseChannel = Utils.makeResponseChannel(data.methodId, data.messageId);

        // Check that the method exists
        let method = this._methods[data.methodId];
        if (!method) {
            let payload: Utils.IExecuteResponse<any> = {
                resp: null,
                err: new Error('Method ' + data.methodId + 'does not exist.')
            }
            evt.sender.send(responseChannel, payload);
            return;
        }

        method.execute(data.arg)
            .then((resp: any) => {
                let payload: Utils.IExecuteResponse<any> = {
                    resp: resp,
                }
                evt.sender.send(responseChannel, payload);
            }).catch(e => {
                let payload: Utils.IExecuteResponse<any> = {
                    resp: null,
                    err: e
                }
                evt.sender.send(responseChannel, payload);
            });
    }

    private _methods: {[key: string]: IExposedMethodPrivate<any, any>} = {};
}

export
let mainConnect = new MainConnect() as IMainConnect;