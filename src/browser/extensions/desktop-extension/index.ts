/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import {
    ICommandPalette
} from '@jupyterlab/apputils';

import {
    IMainMenu
} from '@jupyterlab/mainmenu';

import { IStatusBar } from '@jupyterlab/statusbar';

import {
    JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
    ElectronJupyterLab
} from '../electron-extension';

import {
    asyncRemoteRenderer
} from '../../../asyncremote';

import { IAppRemoteInterface } from '../../../main/app';
import { IPythonEnvironment } from 'src/main/tokens';
import { EnvironmentStatus } from './envStatus';
import { ISessions } from "../../../main/sessions";


const desktopExtension: JupyterFrontEndPlugin<void> = {
    id: 'jupyterlab-desktop.extensions.desktop',
    requires: [ICommandPalette, IMainMenu, IStatusBar],
    activate: (app: ElectronJupyterLab, palette: ICommandPalette, menu: IMainMenu, statusBar: IStatusBar) => {

        asyncRemoteRenderer.onRemoteEvent(ISessions.navigatedToHash, (hash: string) => {
            console.debug(`Navigate to hash received, navigating to: ${hash}`)
            window.location.hash = hash;
        });

        app.commands.addCommand('check-for-updates', {
            label: 'Check for Updates…',
            execute: () => {
                asyncRemoteRenderer.runRemoteMethod(IAppRemoteInterface.checkForUpdates, void(0));
            }
        });

        app.commands.addCommand('open-dev-tools', {
            label: 'Open Developer Tools',
            execute: () => {
                asyncRemoteRenderer.runRemoteMethod(IAppRemoteInterface.openDevTools, void(0));
            }
        });

        menu.helpMenu.addGroup([
            { command: 'open-dev-tools' },
            { command: 'check-for-updates' }
        ], 20);

        const changeEnvironment = async () => {
            asyncRemoteRenderer.runRemoteMethod(IAppRemoteInterface.showPythonPathSelector, void(0));
        };
      
        const statusItem = new EnvironmentStatus({ name: 'env', description: '', onClick: changeEnvironment });

        statusBar.registerStatusItem('jupyterlab-desktop-py-env-status', {
            item: statusItem,
            align: 'left'
        });

        const updateStatusItem = (env: IPythonEnvironment) => {
            statusItem.model.name = env.name;
            let packages = [];
            for (const name in env.versions) {
                packages.push(`${name}: ${env.versions[name]}`);
            }
            statusItem.model.description = `${env.name}\n${env.path}\n${packages.join(', ')}`;
        };

        asyncRemoteRenderer.runRemoteMethod(IAppRemoteInterface.getCurrentPythonEnvironment, void(0)).then((env) => {
            updateStatusItem(env);
        });
    },
    autoStart: true
};


export default desktopExtension;
