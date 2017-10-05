import {
    spawn
} from 'child_process';

import {
    IService
} from './main';

import {
    join
} from 'path';

import {
    app
} from 'electron';

import {
    ArrayExt
} from '@phosphor/algorithm';

import * as fs from 'fs';

export
interface IRegistry {

    getDefaultEnvironment: () => Promise<Registry.IEnvironment>;

    setDefaultEnvironment: (path: string) => Promise<void>;

    getEnvironments: () => Promise<Registry.IEnvironment[]>;
}

export
class Registry implements IRegistry {

    constructor() {

        // Check for conda in the user's PATH
        let condaEnvs = this._findConda()
            .then(() => {
                // If conda wasn't found, we look in some common locations
                if (this._envs.length === 0) {
                    return this._checkCommonCondaLocations();
                }
                return Promise.resolve();
            });

        // Check for standard python in user's PATH
        let genericEnvs = this._findJupyter();

        // Build the registry asynchronously.
        this._registryBuilt = Promise.all([condaEnvs, genericEnvs])
            .then(() => {
                this._cleanEnvs();
                this._setDefault();
                return Promise.resolve();
            }).catch((e) => {
                console.error(e);
                this._envs = [];
                return Promise.resolve();
            });
    }

    getDefaultEnvironment(): Promise<Registry.IEnvironment> {
        return this._registryBuilt.then(() => {
            if (this._default) {
                return Promise.resolve(this._default);
            }
            return Promise.reject(new Error('No paths found'));
        });
    }

    setDefaultEnvironment(path?: string): Promise<void> {
        return this._registryBuilt.then(() => {
            this._setDefault(path);
            if (this._default) {
                return Promise.resolve();
            }
            return Promise.reject(new Error('Path ' + path + 'not found'));
        });
    }

    getEnvironments(): Promise<Registry.IEnvironment[]> {
        return this._registryBuilt.then(() => {
            return Promise.resolve(this._envs);
        });
    }

    private _setDefault(path?: string) {
        ArrayExt.findFirstIndex(this._envs, (e) => {
            if (!path && e.condaRoot) {
                this._default = e;
                return true;
            }

            if (path && path === e.path) {
                this._default = e;
                return true;
            }
            return false;
        });

        if (!this._default && this._envs.length > 0) {
            this._default = this._envs[0];
        }
    }

    private _cleanEnvs(): void {
        let hashTable: any = {};
        this._envs.forEach(env => {
            if (!hashTable[env.path]) {
                hashTable[env.path] = env;
            } else if (hashTable[env.path].type === 'generic' && env.type === 'conda') {
                hashTable[env.path] = env;
            }
        });

        let cleanEnvs: Registry.IEnvironment[] = [];
        for (let path in hashTable) {
            cleanEnvs.push(hashTable[path]);
        }
        this._envs = cleanEnvs;
    }

    private _checkCommonCondaLocations(): Promise<void> {
        let locs = [
            join(app.getPath('home'), 'anaconda', 'bin'),
            join(app.getPath('home'), 'anaconda3', 'bin'),
        ];

        return new Promise<void>((res, rej) => {
            this._checkPathProgram(locs, 'conda')
                .then((installed: boolean[]) => {
                    // Get paths to all installed condas
                    let paths = installed
                        .map((i, idx) => {return i ? join(locs[idx], 'conda') : null; })
                        .filter(p => {return p !== null; });

                    return Promise.all(paths.map(p => {
                        return this._getCondaEnvs(p);
                    }));
                })
                .then((envs: Registry.IEnvironment[][]) => {
                    this._envs = this._envs.concat(...envs);
                    res();
                })
                .catch((e) => {
                    console.error(e);
                    res();
                });

        });
    }

    private _findJupyter(): Promise<void> {
        return new Promise<void>((res, rej) => {
            let jupyterCheck = spawn('/bin/bash', ['-l']);
            jupyterCheck.stdin.write('exec which -a jupyter\n');

            jupyterCheck.on('exit', () => {
                jupyterCheck.removeAllListeners();

                let raw = (jupyterCheck.stdout.read() as Buffer);
                if (!raw) {
                    res();
                    return;
                }

                let rawPaths = raw.toString().split('\n');
                if (rawPaths.length === 0) {
                    res();
                    return;
                }

                rawPaths = rawPaths.filter((p) => {
                    return p.length !== 0;
                });

                let envs: Registry.IEnvironment[] = rawPaths.map((p: string) => {
                    return {
                        path: p.slice(0, p.length - '/jupyter'.length),
                        default: false,
                        type: 'generic' as Registry.Environment,
                        jupyter: true,
                    };
                });

                this._envs = this._envs.concat(envs);
                res();
            });

        });
    }

    private _findConda(): Promise<void> {
        return new Promise<void>((res, rej) => {
            let condaCheck = spawn('/bin/bash', ['-l']);
            condaCheck.stdin.write('exec which -a conda\n');

            condaCheck.on('exit', () => {
                condaCheck.removeAllListeners();

                let raw = (condaCheck.stdout.read() as Buffer);
                if (!raw) {
                    res();
                    return;
                }

                let condaPaths = raw.toString().split('\n');
                if (condaPaths.length === 0) {
                    res();
                    return;
                }

                condaPaths = condaPaths.filter((p) => {
                    return p.length !== 0;
                });

                Promise.all(condaPaths.map(condaPath => {
                    return this._getCondaEnvs(condaPath);
                }))
                .then((envs: Registry.IEnvironment[][]) => {
                    this._envs = this._envs.concat(...envs);
                    res();
                })
                .catch((e) => {
                    console.error(e);
                    res();
                });
            });
        });
    }

    private _getCondaEnvs(condaPath: string): Promise<Registry.IEnvironment[]> {
        return new Promise<Registry.IEnvironment[]>((res, rej) => {
            // Run conda env list and parse output
            let condaList = spawn(condaPath, ['env', 'list']);
            condaList.on('exit', () => {
                condaList.removeAllListeners();
                let rawEnvs = (condaList.stdout.read() as Buffer).toString().split('\n');
                let envs: Registry.IEnvironment[] = rawEnvs.map((line: string) => {
                    // Check if line has nay useful info
                    if (line[0] === '#') {
                        return null;
                    }

                    let envData = line.split(/ +/g);
                    if (envData.length === 3) {
                        return {
                            path: join(envData[2], 'bin'),
                            jupyter: false,
                            condaRoot: true,
                            type: 'conda' as Registry.Environment,
                            name: envData[0]
                        };
                    } else if (envData.length === 2) {
                        return {
                            path: join(envData[1], 'bin'),
                            jupyter: false,
                            type: 'conda' as Registry.Environment,
                            name: envData[0]
                        };
                    }
                    return null;
                });

                res(envs.filter((val: Registry.IEnvironment) => {
                    return val !== null;
                }));
            });
        }).then((envs: Registry.IEnvironment[]) => {
            // Check which environments have Jupyter installed
            return this._checkEnvProgram(envs, 'jupyter');
        });
    }

    private _checkEnvProgram(envs: Registry.IEnvironment[], program: string): Promise<Registry.IEnvironment[]> {
            let paths = envs.map(e => {return e.path; });
            return this._checkPathProgram(paths, program)
                .then((installed: boolean[]) => {
                    installed.forEach((i: boolean, idx: number) => {
                        envs[idx].jupyter = i;
                    });
                    return Promise.resolve(envs);
                });
    }

    private _checkPathProgram(paths: string[], program: string): Promise<boolean[]> {
        return Promise.all(paths.map(path => {
            return new Promise<boolean>((res, rej) => {
                fs.access(join(path, 'jupyter'), fs.constants.F_OK, (e) => {
                    res(e === undefined || e === null);
                });
            });
        }));
    }

    private _envs: Registry.IEnvironment[] = [];

    private _default: Registry.IEnvironment;

    private _registryBuilt: Promise<void>;
}

export
namespace Registry {

    export
    interface IEnvironment {
        path: string;
        name?: string;
        jupyter: boolean;
        condaRoot?: boolean;
        jupyterVersion?: string;
        type: Environment;
    }

    export
    type Environment = 'conda' | 'generic';
}

let service: IService = {
    requirements: [],
    provides: 'IRegistry',
    activate: (): IRegistry => {
        return new Registry();
    },
    autostart: true
};
export default service;
