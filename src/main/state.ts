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
class UserState {

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
    private writeInProgress: Promise<any>;

    constructor(private filename: 'string') {
        this.dataFile = this.path + '/' + this.filename;
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
    private doWrite(data: any, err_cb?: (err: UserState.StateIOError) => void): void {
        this.writeInProgress = new Promise((res, rej) => {
            fs.writeFile(this.dataFile, JSON.stringify(data), (err) => {
                if (err && err_cb) {
                    err_cb({
                        type: 'write',
                        filename: this.dataFile,
                        err: err
                    });
                }
                res({});
            });
        });
    }

    /**
     * Convert a javascript object to JSON, and write to a file.
     * 
     * @param data javascript object to write.
     * @param err_cb callback called in case of error.
     */
    write(data: any, err_cb?: (err: UserState.StateIOError) => void): void {
        this.checkWriteInProgress(() => {
            this.doWrite(data, err_cb);
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
    read(): Promise<any> {
        return new Promise((res, rej) => {
            this.checkWriteInProgress(() => {
                fs.readFile(this.dataFile, (err, data) => {
                    if (err) {
                        rej({
                            type: 'read',
                            filename: this.dataFile,
                            err: err
                        });
                    }

                    let pData: any;
                    try {
                        pData = JSON.parse(data.toString())
                    } catch(err) {
                        rej({
                            type: 'read',
                            filename: this.dataFile,
                            err: err
                        });
                    }
                    res(pData);
                });
        
            });
        });
    }
}