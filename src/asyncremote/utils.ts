// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    AsyncRemote
} from './types';

export
namespace Utils {
    export
    const REQUEST_METHOD_EXECUTE = 'async-remote:request-method-execute';

    export
    const RESPOND_METHOD_EXECUTE = 'async-remote:respond-method-execute';

    export
    const EMIT_EVENT = 'async-remote:emit-event';

    export
    interface IMethodExec<T, U> extends AsyncRemote.IMethod<T, U> {

        execute(arg: T, caller: Electron.WebContents): Promise<U>;
    }

    export
    interface IEventEmit<U> extends AsyncRemote.IEvent<U> {
        data: U;
    }

    export
    interface IMethodExecuteRequest<T> {
        messageId: number;
        methodId: string;
        arg: T;
    }

    export
    interface IMethodExecuteResponse<U> {
        resp: U;
        err?: any;
    }

    export
    function makeResponseChannel(methodId: string, messageId: number): string {
        return methodId + '-' + messageId;
    }
}
