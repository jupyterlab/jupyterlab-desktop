// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    ipcRenderer
} from 'electron';

import {
    Utils
} from './utils';

import {
    AsyncRemote
} from './types';

import {
    EventEmitter
} from 'events';

export
interface IAsyncRemoteRender {

    createRemoteMethod: <T, U>(method: AsyncRemote.IMethod<T, U>) => (arg: T) => Promise<U>;

    runRemoteMethod<T, U>(method: AsyncRemote.IMethod<T, U>, arg: T): Promise<U>;

    onRemoteEvent<U>(event: AsyncRemote.IEvent<U>, cb: (data: U) => void): void;

    removeRemoteListener<U>(event: AsyncRemote.IEvent<U>, listener: (data: U) => void): void;
}

class RenderRemote implements IAsyncRemoteRender {

    constructor() {
        // Add listener for events
        ipcRenderer.on(Utils.EMIT_EVENT, (event: Electron.Event, data: Utils.IEventEmit<any>) => {
            this._eventEmitter.emit(data.id, data.data);
        });
    }

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
            let handler = (evt: Electron.Event, data: Utils.IMethodExecuteResponse<U>) => {
                ipcRenderer.removeListener(responseChannel, handler);

                if (data.err) {
                    rej(data.err);
                    return;
                }
                res(data.resp);
            };
            ipcRenderer.on(responseChannel, handler);

            // Send request
            let payload: Utils.IMethodExecuteRequest<T>  = {
                messageId: messageId,
                methodId: method.id,
                arg: arg
            };
            ipcRenderer.send(Utils.REQUEST_METHOD_EXECUTE, payload);
        });
    }

    onRemoteEvent<U>(event: AsyncRemote.IEvent<U>, cb: (data: U) => void): void {
        this._eventEmitter.on(event.id, cb);
    }

    removeRemoteListener<U>(event: AsyncRemote.IEvent<U>, cb: (data: U) => void): void {
        this._eventEmitter.removeListener(event.id, cb);
    }

    private _messageCounter: number = 0;

    private _eventEmitter = new EventEmitter();
}

let isRenderer = (process && process.type === 'renderer');
let asyncRemote: IAsyncRemoteRender;
if (isRenderer) {
    asyncRemote = new RenderRemote() as IAsyncRemoteRender;
} else {
    asyncRemote = null;
}
export
let asyncRemoteRenderer = asyncRemote;
