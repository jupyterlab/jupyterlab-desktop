// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    JSONValue
} from '@phosphor/coreutils';

import {
    IApplication, IStatefulService
} from './app';

import {
    AsyncRemote, asyncRemoteMain
} from '../asyncremote';

import {
    IDataConnector, ISettingRegistry, DefaultSchemaValidator
} from '@jupyterlab/coreutils';

import {
    IService
} from './main';

import * as path from 'path';
import * as fs from 'fs';

export
interface ISaveOptions {
    plugin: string;
    rawPluginJSON: string;
}

export
interface IElectronDataConnector extends IDataConnector<ISettingRegistry.IPlugin, string> { }

export
namespace IElectronDataConnector {
    export
        let fetch: AsyncRemote.IMethod<string, ISettingRegistry.IPlugin> = {
            id: 'JupyterLabDataConnector-fetch'
        };

    export
        let save: AsyncRemote.IMethod<ISaveOptions, void> = {
            id: 'JupyterLabDataConnector-save'
        };
}

/**
 * Create a data connector to be used by the render
 * processes. Stores JupyterLab plugin settings that
 * need to be persistent.
 *
 * If settings are not found in the application data
 * directory, default settings are read in from the
 * application bundle.
 */
export
    class JupyterLabDataConnector implements IStatefulService, IElectronDataConnector {

    id: string = 'JupyterLabSettings';

    constructor(app: IApplication) {
        this._plugins = app.registerStatefulService(this)
            .then((settings: Private.IPluginContainer) => {
                if (!settings) {
                    return this._getDefaultSettings();
                }

                return settings;
            })
            .catch(() => {
                return this._getDefaultSettings();
            });

        this._validator = new DefaultSchemaValidator();

        // Create 'fetch' remote method
        asyncRemoteMain.registerRemoteMethod(IElectronDataConnector.fetch, this.fetch.bind(this));

        // Create 'save' remote method
        asyncRemoteMain.registerRemoteMethod(IElectronDataConnector.save,
            (opts: ISaveOptions) => {
                return this.save(opts.plugin, opts.rawPluginJSON);
            });
    }

    /**
     * Fetch settings for a plugin.
     *
     * @param name The plugin name.
     */
    fetch(name: string): Promise<ISettingRegistry.IPlugin> {
        return this._plugins
            .then((plugins) => {
                if (!plugins[name]) {
                    return Promise.reject(new Error('Setting ' + name + ' not available'));
                }

                return Promise.resolve(plugins[name]);
            });
    }

    /**
     * Remove a setting. Not needed in this implementation.
     *
     * @param name The plugin name.
     */
    remove(name: string): Promise<void> {
        return Promise.reject(new Error('Removing setting resources is not supported.'));
    }

    /**
     * Save user settings for a plugin.
     *
     * @param name The name of the plugin
     * @param rawPluginJSON raw JSON string with comments
     */
    save(name: string, rawPluginJSON: string): Promise<void> {
        this._plugins = this._plugins
            .then((plugins: Private.IPluginContainer) => {
                if (!(name in plugins)) {
                    return Promise.reject(new Error('Schema not found for: ' + name));
                }

                let updatedPlugin: ISettingRegistry.IPlugin = {
                    raw: rawPluginJSON,
                    data: {} as ISettingRegistry.ISettingBundle,
                    schema: plugins[name].schema,
                    id: name
                };

                let validationErrors = this._validator.validateData(updatedPlugin);
                if (validationErrors === null) {
                    plugins[name] = updatedPlugin;
                } else {
                    return Promise.reject(validationErrors);
                }

                return Promise.resolve(plugins);
            });

        return this._plugins.then(() => { return; });
    }

    getStateBeforeQuit(): Promise<JSONValue> {
        return this._plugins;
    }

    verifyState(state: Private.IPluginContainer): boolean {
        for (let key in state) {
            if (state[key].schema === undefined || state[key].data === undefined) {
                return false;
            }
        }
        return true;
    }

    /**
     * Get default JupyterLab settings from application
     * bundle.
     */
    private _getDefaultSettings(): Promise<Private.IPluginContainer> {
        let schemasPath = path.join(__dirname, '../../schemas');

        return new Promise<string[]>((res, rej) => {
            // Get files in schema directory
            fs.readdir(schemasPath, (err, files) => {
                if (err) {
                    rej(err);
                    return;
                }
                res(files);
            });
        }).then((files: string[]) => {
            // Parse data in schema files
            return Promise.all(files.map(file => {
                let sectionName = path.basename(file);
                sectionName = sectionName.slice(0, sectionName.length - '.json'.length);
                return new Promise<ISettingRegistry.IPlugin>((res, rej) => {
                    fs.readFile(path.join(schemasPath, file), (err, data: Buffer) => {
                        if (err) {
                            res(null);
                            return;
                        }

                        let plugin: ISettingRegistry.IPlugin = {
                            id: sectionName,
                            schema: JSON.parse(data.toString()),
                            data: {} as ISettingRegistry.ISettingBundle,
                            raw: data.toString()
                        };

                        res(plugin);
                    });
                });
            }));
        }).then((settings: ISettingRegistry.IPlugin[]) => {
            let iSettings: Private.IPluginContainer = {};
            settings.forEach(setting => {
                if (!setting) {
                    return;
                }

                iSettings[setting.id] = setting;
            });
            return iSettings;
        }).catch((e) => {
            console.error(e);
            return Promise.resolve({});
        });
    }

    private _validator: DefaultSchemaValidator;
    private _plugins: Promise<Private.IPluginContainer>;
}

namespace Private {

    export
        interface IPluginContainer {
        [key: string]: ISettingRegistry.IPlugin;
    }
}

let service: IService = {
    requirements: ['IApplication'],
    provides: 'IElectronDataConnector',
    activate: (app: IApplication): IDataConnector<ISettingRegistry.IPlugin, string> => {
        return new JupyterLabDataConnector(app);
    },
    autostart: true
};
export default service;

