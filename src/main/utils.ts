// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    JSONValue
} from '@lumino/coreutils';

import {
    IApplication, IStatefulService
} from './app';

import {
    AsyncRemote, asyncRemoteMain
} from '../asyncremote';

import {
    ISettingRegistry
} from '@jupyterlab/settingregistry';

import {
    IDataConnector
} from '@jupyterlab/statedb';

import {
    IService
} from './main';

import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log';

export
interface IAppConfiguration {
    jlabPort: number;
    token: string;
};

export
const appConfig: IAppConfiguration = {
    jlabPort: 8888,
    token: 'jlab-token'
};

export
interface ISaveOptions {
    id: string;
    raw: string;
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
 * If settings are not found in the apllication data
 * directory, default settings are read in from the
 * application bundle.
 */
export
class JupyterLabDataConnector implements IStatefulService, IElectronDataConnector {

    SCHEMAS_PATH: string = path.join(__dirname, '../../schemas/');
    id: string = 'JupyterLabSettings';

    constructor(app: IApplication) {
        this._availableSchemas = this._getAllDefaultSchemas();

        this._settings = app.registerStatefulService(this)
            .then((settings: Private.IPluginData) => {
                if (!settings) {
                    return this._availableSchemas.then(schemas => this._getDefaultSettings(schemas));
                }
                return settings;
            })
            .catch(() => {
                return this._availableSchemas.then(schemas => this._getDefaultSettings(schemas));
            });

        // Create 'fetch' remote method
        asyncRemoteMain.registerRemoteMethod(IElectronDataConnector.fetch, this.fetch.bind(this));

        // Create 'save' remote method
        asyncRemoteMain.registerRemoteMethod(IElectronDataConnector.save,
            (opts: ISaveOptions) => {
                return this.save(opts.id, opts.raw);
            });
    }

    /**
     * Fetch settings for a plugin.
     *
     * @param id The plugin id.
     */
    fetch(id: string): Promise<ISettingRegistry.IPlugin> {
        return this._settings
            .then(data => {
                if (!data[id]) {
                    return this._availableSchemas.then(schemas => {
                        if (id in schemas) {
                            return this._loadSingleDefault(schemas[id], id).then(pluginDefault => {
                                data[id] = pluginDefault;

                                return pluginDefault;
                            });
                        } else {
                            return Promise.reject(new Error('Setting ' + id + ' not available'));
                        }
                    });
                } else {
                    return Promise.resolve({
                        id: id,
                        ...data[id]
                    });
                }
            }).catch((reason) => {
                return Promise.reject(new Error(`Private data store failed to load.`));
            });
    }

    list(query?: string): Promise<{
        ids: string[];
        values: ISettingRegistry.IPlugin[];
    }> {
        return Promise.resolve({
            ids: [],
            values: []
        });
    }

    /**
     * Remove a setting. Not needed in this implementation.
     *
     * @param id The plugin id.
     */
    remove(id: string): Promise<void> {
        return Promise.reject(new Error('Removing setting resources is note supported.'));
    }

    /**
     * Save user settings for a plugin.
     *
     * @param id
     * @param user
     */
    save(id: string, raw: string): Promise<void> {
        const user = JSON.parse(raw);
        let saving = this._settings
            .then(data => {
                if (!user[id]) {
                    return this._availableSchemas.then(schemas => {
                        if (id in schemas) {
                            return this._loadSingleDefault(schemas[id], id).then(pluginDefault => {
                                pluginDefault.data = user as ISettingRegistry.ISettingBundle;
                                pluginDefault.raw = raw;
                                data[id] = pluginDefault;

                                return data;
                            });
                        } else {
                            return Promise.reject(new Error('Setting ' + id + ' not available'));
                        }
                    });
                } else {
                    data[id].data = user as ISettingRegistry.ISettingBundle;
                    data[id].raw = raw;
                    return Promise.resolve(data);
                }
            });

        this._settings = saving;
        return saving.then(() => { return; });
    }

    getStateBeforeQuit(): Promise<JSONValue> {
        return this._settings;
    }

    verifyState(state: Private.IPluginData): boolean {
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
    private _getDefaultSettings(schemaPaths: Private.ISchemaPathContainer): Promise<Private.IPluginData> {
        let buildRegistryPlugins: Promise<ISettingRegistry.IPlugin[]> = Promise.all(Object.keys(schemaPaths).map(schemaID => {
            let schemaPath = schemaPaths[schemaID];
            return this._loadSingleDefault(schemaPath, schemaID);
        }));

        return buildRegistryPlugins.then((settings: ISettingRegistry.IPlugin[]) => {
            let iSettings: Private.IPluginData = {};
            settings.forEach(setting => {
                if (!setting) {
                    return;
                }
                iSettings[setting.id] = setting;
            });
            return iSettings;
        }).catch((e) => {
            log.error(e);
            return Promise.resolve({});
        });
    }

    private _loadSingleDefault(schemaPath: string, schemaID: string): Promise<ISettingRegistry.IPlugin> {
        return new Promise<ISettingRegistry.IPlugin>((resolve, reject) => {
            fs.readFile(schemaPath, (err, data: Buffer) => {
                if (err) {
                    reject(err);
                } else {
                    let rawSchema = data.toString();

                    resolve({
                        id: schemaID,
                        schema: JSON.parse(rawSchema),
                        data: {} as ISettingRegistry.ISettingBundle,
                        raw: '{}',
                        version: ''
                    });
                }
            });
        });
    }

    private _getAllDefaultSchemas(): Promise<Private.ISchemaPathContainer> {
        let getSettingProviders = this._readDirectoryFilenames(this.SCHEMAS_PATH);

        let buildPluginProvider: Promise<{ provider: string, name: string }[]> = getSettingProviders.then(providers => {
            return Promise.all(providers.map(provider => {
                return this._readDirectoryFilenames(path.join(this.SCHEMAS_PATH, provider)).then(plugins => {
                    return plugins.map(plugin => {
                        return {
                            provider: provider,
                            name: plugin
                        };
                    });
                });
            })).then(nestedPlugins => {
                return Array.prototype.concat.apply([], nestedPlugins);
            });
        });

        return buildPluginProvider.then(plugins => {
            return Promise.all(plugins.map(plugin => {
                return this._readDirectoryFilenames(path.join(this.SCHEMAS_PATH, plugin.provider, plugin.name)).then(settingFiles => {
                    let allPlugins = settingFiles.map(settingFile => {
                        let schemaPath = path.join(this.SCHEMAS_PATH, plugin.provider, plugin.name, settingFile);
                        let id = plugin.provider + '/' + plugin.name + ':' + path.basename(settingFile, '.json');
                        return {
                            path: schemaPath, id
                        };
                    });

                    return allPlugins;
                });
            })).then(nestPlugins => {
                let flattenedPlugins: { path: string, id: string }[] = Array.prototype.concat.apply([], nestPlugins);
                let schemaContainer = {} as Private.ISchemaPathContainer;

                flattenedPlugins.forEach(plugin => {
                    schemaContainer[plugin.id] = plugin.path;
                });

                return schemaContainer;
            });
        });
    }

    private _readDirectoryFilenames(directoryPath: string): Promise<string[]> {
        return new Promise((resolve, reject) => {
            fs.readdir(directoryPath, (err, filenames) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(filenames);
                }
            });
        });
    }

    private _availableSchemas: Promise<Private.ISchemaPathContainer>;
    private _settings: Promise<Private.IPluginData>;
}

namespace Private {

    export
    interface IPluginData {
        [id: string]: ISettingRegistry.IPlugin;
    }

    export
    interface ISchemaPathContainer {
        [id: string]: string;
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

