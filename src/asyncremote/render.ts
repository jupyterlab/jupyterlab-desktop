// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

let ipcRenderer: Electron.IpcRenderer = require('electron').ipcRenderer;

import {
    AsyncRemote, Utils
} from './ipc';

export
interface IAsyncRemoteRender {

    createRemoteMethod: <T, U>(method: AsyncRemote.IMethod<T, U>) => (arg: T) => Promise<U>;

    runRemoteMethod<T, U>(method: AsyncRemote.IMethod<T, U>, arg: T): Promise<U>;
}

class RenderRemote implements IAsyncRemoteRender {

    createRemoteMethod<T, U>(method: AsyncRemote.IMethod<T, U>): (arg: T) => Promise<U> {
        let func = (arg: T) => {
            this.runRemoteMethod(method, arg);
        };

        return func.bind(this);
    }

    runRemoteMethod<T, U>(method: AsyncRemote.IMethod<T, U>, arg: T): Promise<U> {
        let messageId = this._messageCounter++;
        let responseChannel = Utils.makeResponseChannel(method.id, messageId);

        return new Promise<U>((res, rej) => {
            // Create response handler
            let handler = (evt: Electron.Event, data: Utils.IExecuteResponse<U>) => {
                ipcRenderer.removeListener(responseChannel, handler);

                if (data.err) {
                    rej(data.err);
                    return;
                }
                res(data.resp);
            }
            ipcRenderer.on(responseChannel, handler);

            // Send request
            let payload: Utils.IExecuteRequest<T>  = {
                messageId: messageId,
                methodId: method.id,
                arg: arg
            };
            ipcRenderer.send(Utils.IPC_REQUEST_EXECUTE, payload);
        })
    }

    private _messageCounter: number = 0;
}

export
let asyncRemoteRender = new RenderRemote() as IAsyncRemoteRender;