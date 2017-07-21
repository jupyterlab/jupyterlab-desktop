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
     * The path to the platform-specific application data directory.
     */
    readonly path: string = app.getPath('userData');

    /**
     * The namespace prefix for all state database entries.
     *
     * #### Notes
     * This value should be set at instantiation and will only be used internally
     * by a state database. That means, for example, that an app could have
     * multiple, mutually exclusive state databases.
     */
    readonly namespace: string;

    /**
     * Field required by IStateDB. Not used in this
     * implementation.
     */
    readonly maxLength: number;

    /**
     * The full path to the state data file.
     */
    private dataFile: string;

    private cache: JSONObject = null;

    /**
     * Promise fulfilled when a write finishes. Used with
     * the writeInProgress boolean to prevent reading/writing
     * race conditions.
     */
    private written: Promise<void>;

    /**
     * Boolean storing write status of stateDB. Used
     * to prevent writing/reading race conditions.
     */
    private writeInProgress: boolean = false;

    /**
     * Create a new state database.
     * 
     * @param options - The istantiation options for the database
     */
    constructor(options: ElectronStateDB.IOptions) {
        this.namespace = options.namespace;
        this.dataFile = this.path + '/' + this.namespace;
    }

    /**
     * Check if there is a write currently in progress. If there is,
     * wait until the write promise is fulfilled.
     * 
     * @param cb - callback called when writing completes.
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
     * Internal save function. Does not check the
     * current write state. That should be implemented by
     * the calling function.
     * 
     * @return A promise that is fulfilled when data is written.
     */
    private _save(): Promise<void> {
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
        return this.written;
    }

    /**
     * Update the internal copy of the database. Waits
     * for any writes to complete before updating the cache.
     * The database file is only read if the cache is null since
     * the cache will always be up-to-date otherwise. This is
     * because all calls to 'write' and 'remove' update the
     * internal cache.
     * 
     * @return A promise fulfilled when the cache is updated.
     */
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
     * Save a value in the database.
     *
     * @param id - The identifier for the data being saved.
     *
     * @param value - The data being saved.
     *
     * @returns A promise that is rejected if saving fails and succeeds otherwise.
     *
     * #### Notes
     * The `id` values of stored items in the state database are formatted:
     * `'namespace:identifier'`, which is the same convention that command
     * identifiers in JupyterLab use as well. While this is not a technical
     * requirement for `fetch()`, `remove()`, and `save()`, it *is* necessary for
     * using the `fetchNamespace()` method.
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


    /**
     * Retrieve a saved bundle from the database.
     *
     * @param id - The identifier used to retrieve a data bundle.
     *
     * @returns A promise that bears a data payload if available.
     *
     * #### Notes
     * The `id` values of stored items in the state database are formatted:
     * `'namespace:identifier'`, which is the same convention that command
     * identifiers in JupyterLab use as well. While this is not a technical
     * requirement for `fetch()`, `remove()`, and `save()`, it *is* necessary for
     * using the `fetchNamespace()` method.
     *
     * The promise returned by this method may be rejected if an error occurs in
     * retrieving the data. Non-existence of an `id` will succeed with `null`.
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

    /**
     * Retrieve all the saved bundles for a namespace.
     *
     * @param namespace - The namespace to retrieve.
     *
     * @returns A promise that bears a collection data payloads for a namespace.
     *
     * #### Notes
     * Namespaces are entirely conventional entities. The `id` values of stored
     * items in the state database are formatted: `'namespace:identifier'`, which
     * is the same convention that command identifiers in JupyterLab use as well.
     *
     * If there are any errors in retrieving the data, they will be logged to the
     * console in order to optimistically return any extant data without failing.
     * This promise will always succeed.
     */
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
    
    /**
     * Remove a value from the database.
     *
     * @param id - The identifier for the data being removed.
     *
     * @returns A promise that is rejected if remove fails and succeeds otherwise.
     */
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