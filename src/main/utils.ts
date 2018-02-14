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
    IDataConnector, ISettingRegistry
} from '@jupyterlab/coreutils';

import {
    IService
} from './main';

import * as path from 'path';
import * as fs from 'fs';

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

    id: string = 'JupyterLabSettings';

    constructor(app: IApplication) {
        this._settings = app.registerStatefulService(this)
            .then((settings: Private.IPluginData) => {
                if (!settings) {
                    return this._getDefaultSettings();
                }
                return settings;
            })
            .catch(() => {
                return this._getDefaultSettings();
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
            .then((data: any) => {
                if (!data[id]) {
                    return Promise.reject(new Error('Setting ' + id + ' not available'));
                }

                return Promise.resolve({
                    id: id,
                    ...data[id]
                });
            }).catch((reason) => {
                return Promise.reject(new Error(`Private data store failed to load.`));
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
            .then((data: Private.IPluginData) => {
                if (!user[id]) {
                    return Promise.reject(new Error('Schema not found for: ' + id));
                }
                data[id].data = user as ISettingRegistry.ISettingBundle;
                data[id].raw = raw;
                return Promise.resolve(data);
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
    private _getDefaultSettings(): Promise<Private.IPluginData> {
        let schemasPath = path.join(__dirname, '../../schemas/');

        let getSettingProviders = new Promise<string[]>((resolve, reject) => {
            fs.readdir(schemasPath, (err, files) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(files);
                }
            });
        });

        let buildPluginProvider: Promise<{ provider: string, name: string }[]> = getSettingProviders.then(providers => {
            return Promise.all(providers.map(provider => {
                return new Promise<{ provider: string, name: string }[]>((resolve, reject) => {
                    fs.readdir(path.join(schemasPath, provider), (err, plugins) => {
                        if (err) {
                            reject(err);
                        } else {
                            let allPlugins = plugins.map(plugin => {
                                return {
                                    provider: provider,
                                    name: plugin
                                };
                            });
                            resolve(allPlugins);
                        }
                    });
                });
            })).then(nestedPlugins => {
                return Array.prototype.concat.apply([], nestedPlugins);
            });
        });

        let buildPluginContents: Promise<{ provider: string, name: string, contentPath: string }[]> = buildPluginProvider.then(plugins => {
            return Promise.all(plugins.map(plugin => {
                return new Promise<{ provider: string, name: string, contentPath: string }[]>((resolve, reject) => {
                    fs.readdir(path.join(schemasPath, plugin.provider, plugin.name), (err, settingFiles) => {
                        if (err) {
                            reject(err);
                        } else {
                            let allPlugins = settingFiles.map(settingFile => {
                                return {
                                    provider: plugin.provider,
                                    name: plugin.name,
                                    contentPath: settingFile
                                };
                            });

                            resolve(allPlugins);
                        }
                    });
                });
            })).then(nestPlugins => Array.prototype.concat.apply([], nestPlugins));
        });

        let buildRegistryPlugins: Promise<ISettingRegistry.IPlugin[]> = buildPluginContents.then(plugins => {
            return Promise.all(plugins.map(plugin => {
                let contentPath = path.join(schemasPath, plugin.provider, plugin.name, plugin.contentPath);
                let sectionName = plugin.provider + '/' + plugin.name + ':' + path.basename(plugin.contentPath, '.json');
                return new Promise<ISettingRegistry.IPlugin>((resolve, reject) => {
                    fs.readFile(contentPath, (err, data: Buffer) => {
                        if (err) {
                            reject(err);
                        } else {
                            let rawSchema = data.toString();

                            resolve({
                                id: sectionName,
                                schema: JSON.parse(rawSchema),
                                data: {} as ISettingRegistry.ISettingBundle,
                                raw: '{}',
                            });
                        }
                    });
                });
            }));
        });

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
            console.error(e);
            return Promise.resolve({});
        });
    }

    private _settings: Promise<Private.IPluginData>;
}

namespace Private {

    export
    interface IPluginData {
        [id: string]: ISettingRegistry.IPlugin;
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

