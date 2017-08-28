// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

export
namespace AsyncRemote {
    export
    interface IMethodExec<T, U> extends IMethod<T, U> {

        execute(arg: T): Promise<U>;
    }

    export
    interface IMethod<T, U> {
        
        id: string;

        _argType?: T;

        _retType?: U;
    }
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
