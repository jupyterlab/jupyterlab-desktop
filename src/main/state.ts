// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    app
} from 'electron';

import * as fs from 'fs';

export
namespace UserState {
    export
    interface StateIOError {

        type: 'read' | 'write';
        filename: string;
        err: any;
    }
}

/**
 * Read and write user data asynchronously.
 */
export
class UserState<T> {

    /**
     * The path to the platform-specific user data directory.
     */
    private path: string = app.getPath('userData');

    /**
     * The full data file.
     */
    private dataFile: string;

    /**
     * Promise to ensure writing is complete before reading/writing
     * is iniitated.
     */
    private writeInProgress: Promise<void>;

    /**
     * User data
     */
    state: T;

    constructor(private filename: string, state: T) {
        this.dataFile = this.path + '/' + this.filename;
        this.state = state;
    }

    /**
     * Check if there is a write in progress.
     * 
     * @param cb callback called when writing completes.
     */
    private checkWriteInProgress(cb: () => void): void {
        if (this.writeInProgress) {
            this.writeInProgress.then((v) => {
                this.checkWriteInProgress(() => {
                    this.writeInProgress = null;
                    cb();
                });
            })
            return;
        }
        cb();
    }

    /**
     * Write data to the file. Creates promise that is fulfilled when
     * writing is complete.
     * 
     * @param data Javascript object to write to the file as JSON data
     * @param err_cb 
     */
    private doWrite(err_cb?: (err: UserState.StateIOError) => void): void {
        this.writeInProgress = new Promise<void>((res, rej) => {
            fs.writeFile(this.dataFile, JSON.stringify(this.state), (err) => {
                if (err && err_cb) {
                    err_cb({
                        type: 'write',
                        filename: this.dataFile,
                        err: err
                    });
                }
                res();
            });
        });
    }

    /**
     * Convert a javascript object to JSON, and write to a file.
     * 
     * @param data javascript object to write.
     * @param err_cb callback called in case of error.
     */
    write(err_cb?: (err: UserState.StateIOError) => void): void {
        this.checkWriteInProgress(() => {
            this.doWrite(err_cb);
        });
    }

    /**
     * Read json data from a file and parse into
     * a javascript object.
     * 
     * @param cb callback called when data is avaiable.
     * 
     * @return a promise that is fullfilled when the data is available
     */
    read(): Promise<void> {
        return new Promise<void>((res, rej) => {
            this.checkWriteInProgress(() => {
                fs.readFile(this.dataFile, (err, data) => {
                    if (err) {
                        /* Check if file just doesn't exist */
                        if (err.code === 'ENOENT') {
                            res();
                            return;
                        }

                        rej({
                            type: 'read',
                            filename: this.dataFile,
                            err: err
                        });
                        return;
                    }

                    let pData: T;
                    try {
                        pData = JSON.parse(data.toString())
                    } catch(err) {
                        rej({
                            type: 'read',
                            filename: this.dataFile,
                            err: err
                        });
                        return;
                    }
                    this.state = pData;
                    res();
                });
        
            });
        });
    }
}