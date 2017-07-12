// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    app
} from 'electron';

import * as fs from 'fs';

/**
 * Read and write electron application data asynchronously.
 */
export
class ApplicationState<T> {

    /**
     * The path to the platform-specific user data directory.
     */
    private path: string = app.getPath('userData');

    /**
     * The full data file.
     */
    private dataFile: string;

    /**
     * Promise fulfilled when a write finishes
     */
    private written: Promise<void>;

    private writeInProgress: boolean = false;

    /**
     * User data
     */
    state: T = null;

    constructor(private filename: string, state?: T) {
        this.dataFile = this.path + '/' + this.filename;
        if (state)
            this.state = state;
    }

    /**
     * Check if there is a write currently in progress. If there is,
     * wait until the write promise is fulfilled.
     * 
     * @param cb callback called when writing completes.
     */
    private checkWriteInProgress(cb: () => void): void {
        if (this.writeInProgress) {
            this.written.then((v) => {
                /* Check write state again to ensure another waiting function
                 * didn't start another write.
                 */
                this.checkWriteInProgress(() => {
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
    private doWrite(err_cb?: (err: NodeJS.ErrnoException) => void): void {
        this.writeInProgress = true;
        this.written = new Promise<void>((res, rej) => {
            fs.writeFile(this.dataFile, JSON.stringify(this.state), (err) => {
                if (err && err_cb)
                    err_cb(err);
                this.writeInProgress = false;
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
    write(err_cb?: (err: NodeJS.ErrnoException) => void): void {
        this.checkWriteInProgress(() => {
            this.doWrite(err_cb);
        });
    }

    /**
     * Read json data from a file and parse into
     * the `state` attribute. If the file does not
     * exist, the `state` attribute remains as is.
     * 
     * @param cb callback called when data is avaiable.
     * 
     * @return a promise that is fullfilled when the data is available or when
     *         the file is found to not exist. If reading fails, the promise
     *         is rejected.
     */
    read(): Promise<void> {
        return new Promise<void>((res, rej) => {
            this.checkWriteInProgress(() => {
                fs.readFile(this.dataFile, (err, data) => {
                    if (err) {
                        if (err.code === 'ENOENT') {
                            /* The file doesn't exist, don't update state */
                            res();
                            return;
                        }
                        rej(err);
                        return;
                    }

                    let pData: T;
                    try {
                        pData = JSON.parse(data.toString());
                    } catch(err) {
                        rej(err);
                        return;
                    }
                    this.state = pData;
                    res();
                });
        
            });
        });
    }
}