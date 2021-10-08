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
    JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
    ElectronJupyterLab
} from '../electron-extension';

import {
    asyncRemoteRenderer
} from '../../../asyncremote';

import { IAppRemoteInterface } from '../../../main/app';

const desktopExtension: JupyterFrontEndPlugin<void> = {
    id: 'jupyter.extensions.server-manager',
    requires: [ICommandPalette, IMainMenu],
    activate: (app: ElectronJupyterLab, palette: ICommandPalette, menu: IMainMenu) => {
        app.commands.addCommand('check-for-updates', {
            label: 'Check for Updates…',
            execute: () => {
                asyncRemoteRenderer.runRemoteMethod(IAppRemoteInterface.checkForUpdates, void(0));
            }
        });
    
        menu.helpMenu.addGroup([{ command: 'check-for-updates' }], 20);
    },
    autoStart: true
};


export default desktopExtension;
