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
    Widget
} from '@lumino/widgets';

import {
    ElectronJupyterLab
} from '../electron-extension';

import {
    asyncRemoteRenderer
} from '../../../asyncremote';

import { IAppRemoteInterface } from '../../../main/app';


class StatusBarItem extends Widget {
    static createNode(): HTMLElement {
        let node = document.createElement('div');
        let content = document.createElement('div');
        let button = document.createElement('button');
        button.textContent = 'Python Environment';
        button.onclick = () => {
            asyncRemoteRenderer.runRemoteMethod(IAppRemoteInterface.showPythonPathSelector, void(0));
        };
        content.appendChild(button);
        node.appendChild(content);
        return node;
    }
  
    constructor(name: string) {
        super({ node: StatusBarItem.createNode() });
        this.setFlag(Widget.Flag.DisallowLayout);
        this.addClass('content');
        this.addClass(name.toLowerCase());
        this.title.label = name;
        this.title.closable = true;
        this.title.caption = `Long description for: ${name}`;
    }
  
    get button(): HTMLButtonElement {
        return this.node.getElementsByTagName('button')[0] as HTMLButtonElement;
    }
  
    protected onActivateRequest(msg: any): void {
        if (this.isAttached) {
            this.button.focus();
        }
    }
  }

const desktopExtension: JupyterFrontEndPlugin<void> = {
    id: 'jupyterlab-desktop.extensions.desktop',
    requires: [ICommandPalette, IMainMenu, IStatusBar],
    activate: (app: ElectronJupyterLab, palette: ICommandPalette, menu: IMainMenu, statusBar: IStatusBar) => {
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

        const statusItem = new StatusBarItem('Python');

        statusBar.registerStatusItem('jupyterlab-desktop-environment', {
            item: statusItem,
            align: 'left'
        });

        asyncRemoteRenderer.runRemoteMethod(IAppRemoteInterface.getCurrentPythonPath, void(0)).then((path) => {
            statusItem.button.textContent = path === '' ? 'Python' : path;
        });

        asyncRemoteRenderer.onRemoteEvent(IAppRemoteInterface.pythonPathChangedEvent, (newPath) => {
            statusItem.button.textContent = newPath;
        });
    },
    autoStart: true
};


export default desktopExtension;
