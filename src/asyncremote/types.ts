// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

export
namespace AsyncRemote {

    export
    interface IMethod<T, U> {

        id: string;

        _argType?: T;

        _retType?: U;
    }

    export
    interface IEvent<U> {

        id: string;

        _dataType?: U;
    }
}
