// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

export
interface IExposedMethodPrivate<T, U> extends IExposedMethod<T, U> {

    execute(arg: T): Promise<U>;
}

export
interface IExposedMethod<T, U> {
    
    id: string;

    check?: (arg: T) => U;
}

export
namespace Utils {
    export
    const IPC_REQUEST_EXECUTE = 'ipc-request-execute';
    
    export
    const IPC_RESPOND_EXECUTE = 'ipc-respond-execute';

    export
    interface IExecuteRequest<T> {
        messageId: number;
        methodId: string;
        arg: T;
    }

    export
    interface IExecuteResponse<U> {
        resp: U;
        err?: any;
    }

    export
    function makeResponseChannel(methodId: string, messageId: number): string {
        return methodId + '-' + messageId;
    }
}
