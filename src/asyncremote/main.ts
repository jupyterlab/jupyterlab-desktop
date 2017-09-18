// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    ipcMain, webContents
} from 'electron';

import {
    Utils
} from './utils';

import {
    AsyncRemote
} from './types';

export
interface IAsyncRemoteMain {

    registerRemoteMethod: <T, U>(method: AsyncRemote.IMethod<T, U>, execute: (arg: T, caller: Electron.WebContents) => Promise<U>) => void;

    emitRemoteEvent: <U>(event: AsyncRemote.IEvent<U>, data: U, ...contents: Electron.WebContents[]) => void;
}

class MainRemote implements IAsyncRemoteMain {

    constructor() {
        ipcMain.on(Utils.REQUEST_METHOD_EXECUTE, this._executeMethod.bind(this));
    }
    
    registerRemoteMethod<T, U>(method: AsyncRemote.IMethod<T, U>, execute: (arg: T, caller: Electron.WebContents) => Promise<U>): void {
        this._methods[method.id] = {
            ...method,
            execute
        }
    }

    emitRemoteEvent<U>(event: AsyncRemote.IEvent<U>, data: U, ...contents: Electron.WebContents[]): void {
        let payload: Utils.IEventEmit<U> =  {
            ...event,
            data
        };
        
        contents = contents ? contents : webContents.getAllWebContents();

        contents.forEach((content: Electron.WebContents) => {
            content.send(Utils.EMIT_EVENT, payload);
        });
    }

    private _executeMethod(evt: Electron.Event, data: Utils.IMethodExecuteRequest<any>): void {
        let responseChannel = Utils.makeResponseChannel(data.methodId, data.messageId);

        // Check that the method exists
        let method = this._methods[data.methodId];
        if (!method) {
            let payload: Utils.IMethodExecuteResponse<any> = {
                resp: null,
                err: new Error('Method ' + data.methodId + 'does not exist.')
            }
            evt.sender.send(responseChannel, payload);
            return;
        }

        method.execute(data.arg, evt.sender)
            .then((resp: any) => {
                let payload: Utils.IMethodExecuteResponse<any> = {
                    resp: resp,
                }
                evt.sender.send(responseChannel, payload);
            }).catch(e => {
                let payload: Utils.IMethodExecuteResponse<any> = {
                    resp: null,
                    err: e
                }
                evt.sender.send(responseChannel, payload);
            });
    }

    private _methods: {[key: string]: Utils.IMethodExec<any, any>} = {};
}

let isRenderer = (process && process.type === 'renderer');
let asyncRemote: IAsyncRemoteMain;
if (!isRenderer) {
    asyncRemote = new MainRemote() as IAsyncRemoteMain;
} else {
    asyncRemote = null;
}
export
let asyncRemoteMain = asyncRemote;