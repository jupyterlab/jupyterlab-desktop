// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    app
} from 'electron';

import {
    JSONObject
} from '@phosphor/coreutils';

import {
    IStateDB, IStateItem
} from '@jupyterlab/coreutils';

import * as fs from 'fs';

/**
 * Read and write electron application data asynchronously.
 */
export
class ElectronStateDB implements IStateDB {

    /**
     * The path to the platform-specific user data directory.
     */
    readonly path: string = app.getPath('userData');

    /**
     * The name specific to the StateDb instance.
     */
    readonly namespace: string;

    /**
     * Unused field in ElectronStateDB
     */
    readonly maxLength: number;

    /**
     * The path to the data file.
     */
    private dataFile: string;

    private cache: JSONObject = null;

    /**
     * Promise fulfilled when a write finishes
     */
    private written: Promise<void>;

    private writeInProgress: boolean = false;


    constructor(options: ElectronStateDB.IOptions) {
        this.namespace = options.namespace;
        this.dataFile = this.path + '/' + this.namespace;
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
    

    private _save(): Promise<void> {
        return new Promise<void>((res, rej) => {
            /* Signal write in progress */
            this.writeInProgress = true;
            this.written = new Promise<void>((res, rej) => {
                fs.writeFile(this.dataFile, JSON.stringify(this.cache), (err) => {
                    this.writeInProgress = false;
                    if (err)
                        rej(err);
                    else
                        res();
                });
            });

        });
    }

    /**
     * Convert a javascript object to JSON, and write to a file. 
     * Creates promise that is fulfilled when writing is complete.
     * Waits until all currently executing writes are complete.
     * 
     * @param data javascript object to write.
     * @param err_cb callback called in case of error.
     */
    save(id: string, value: JSONObject): Promise<void> {
        return new Promise<void>((res, rej) => {
            this.updateCache()
                .then(() => {
                    this.cache[id] = value;
                    res(this._save());
                })
                .catch(() => {
                    rej();
                })
        });
    }

    private updateCache(): Promise<void> {
        return new Promise<void>((res, rej) => {
            this.checkWriteInProgress(() => {
                if (this.cache)
                    res();

                this.cache = {};
                fs.readFile(this.dataFile, (err, data) => {
                    if (err) {
                        if (err.code === 'ENOENT') {
                            /* The file doesn't exist, don't update state */
                            res(null);
                            return;
                        }
                        rej(err);
                        return;
                    }

                    let pData: JSONObject;
                    try {
                        pData = JSON.parse(data.toString());
                    } catch(err) {
                        rej(err);
                        return;
                    }
                
                    this.cache = pData;
                    res();
                });
        
            });
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
    fetch(id: string): Promise<JSONObject | null> {
        return new Promise<JSONObject | null>((res, rej) => {
            this.updateCache()
                .then(() => {
                    if (this.cache[id] === undefined)
                        res(null);
                    else
                        res(this.cache[id] as JSONObject);
                    return;
                })
                .catch(() => {
                    res(null);
                });
            
        });
    }

    fetchNamespace(namespace: string): Promise<IStateItem[]> {
        return new Promise<IStateItem[]>((res, rej) => {
            const prefix = `${this.namespace}:${namespace}:`;
            const regex = new RegExp(`^${this.namespace}\:`);
            let items: IStateItem[] = [];

            this.updateCache()
                .then(() => {
                    for (let key in this.cache) {
                        if (key.indexOf(prefix) === 0) {
                            try {
                                items.push({
                                    id: key.replace(regex, ''),
                                    value: JSON.parse(window.localStorage.getItem(key))
                                });
                            } catch (error) {
                                console.warn(error);
                            }
                        }
                    }
                    res(items);
                })
                .catch(() => {
                    res(null);
                });
            
        });
    }

    remove(id: string): Promise<void> {
        return new Promise<void>((res, rej) => {
            this.updateCache()
                .then(() => {
                    if (this.cache[id] === undefined) {
                        res(null);
                    } else {
                        delete this.cache[id];
                        res(this._save());
                    }
                    return;
                })
                .catch(() => {
                    res(null);
                });
            
        });
    }
}

export
namespace ElectronStateDB {
  /**
   * The instantiation options for a state database.
   */
  export
  interface IOptions {
    /**
     * The namespace prefix for all state database entries.
     */
    namespace: string;
  }
}