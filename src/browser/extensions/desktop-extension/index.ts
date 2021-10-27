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

import {
    ILabShell,
    JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
    toArray
} from '@lumino/algorithm';

import {
    ElectronJupyterLab
} from '../electron-extension';

import {
    asyncRemoteRenderer
} from '../../../asyncremote';

import { IAppRemoteInterface } from '../../../main/app';

async function waitForOriginUpdate(): Promise<void> {
    return new Promise((resolve) => {
        const interval = setInterval(() => {
            if (window.location.origin.startsWith('http://localhost:')) {
                clearInterval(interval);
                resolve();
            }
        }, 250);
    });
}

const desktopExtension: JupyterFrontEndPlugin<void> = {
    id: 'jupyterlab-desktop.extensions.desktop',
    requires: [ICommandPalette, IMainMenu, ILabShell],
    activate: (app: ElectronJupyterLab, palette: ICommandPalette, menu: IMainMenu, labShell: ILabShell) => {
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

        const recreateLaunchers = () => {
            const mainWidgets = toArray(labShell.widgets('main'));
            const launchers = mainWidgets.filter(
                widget => widget.id.startsWith('launcher-')
            );
            launchers.forEach((launcher) => {
                launcher.close();
            });

            if (launchers.length > 0 && mainWidgets.length > launchers.length) {
                app.commands.execute('launcher:create');
            }
        };

        /*
            TODO: This is a temporary workaround to get kernel icons load properly.
            Changes introduced with https://github.com/jupyterlab/jupyterlab/pull/11175
            are causing kernel icons in Launcher panel to fail to load at initial launch time.
            Initially electron browser window's origin is file://, and later on the origin changes to
            localhost:port (JupyterLab Desktop server host) and then kernel icons can be loaded.
            This workaround reloads Launcher panel once the origin updates.
        */
        waitForOriginUpdate().then(() => {
            recreateLaunchers();
        });
    },
    autoStart: true
};


export default desktopExtension;
