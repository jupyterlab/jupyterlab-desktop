/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import {
    ICommandPalette, IThemeManager, ISplashScreen
} from '@jupyterlab/apputils';

import {
    IMainMenu, MainMenu
} from '@jupyterlab/mainmenu';

import {
    ISessions
} from '../../../main/sessions';

import {
    JSONObject
} from '@lumino/coreutils';

import {
    Application
} from '../../app';

import {
    StateDB, DataConnector
} from '@jupyterlab/statedb';

import {
    ISettingRegistry, SettingRegistry
} from '@jupyterlab/settingregistry';

import {
    nullTranslator
} from '@jupyterlab/translation';

import {
    Menu, Widget
} from '@lumino/widgets';

import {
    IRouter, JupyterFrontEndPlugin, JupyterLab
} from '@jupyterlab/application';

import {
    ElectronJupyterLab
} from '../electron-extension';

import {
    NativeMenu
} from './nativemenu';

import {
    ThemeManager
} from '@jupyterlab/apputils';

import {
    asyncRemoteRenderer
} from '../../../asyncremote';

import {
    IElectronDataConnector
} from '../../../main/utils';

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import plugins from '@jupyterlab/apputils-extension';
import log from 'electron-log';

import {
    createEditMenu, createFileMenu, createKernelMenu, createRunMenu, /*createSettingsMenu, */ createTabsMenu, createViewMenu,
    CommandIDs as MainMenuExtensionCommandIDs
} from '@jupyterlab/mainmenu-extension';

let mainMenuExtension = import('@jupyterlab/mainmenu-extension');

namespace CommandIDs {
    export
    const activateServerManager = 'electron-jupyterlab:activate-server-manager';

    export
    const connectToServer = 'electron-jupyterlab:connect-to-server';
}

interface IServerManagerMenuArgs extends JSONObject {
    name: string;
    type: 'local' | 'remote';
    remoteServerId?: number;
}

const serverManagerPlugin: JupyterFrontEndPlugin<void> = {
    id: 'jupyter.extensions.server-manager',
    requires: [ICommandPalette, IMainMenu],
    activate: (app: ElectronJupyterLab, palette: ICommandPalette, menu: IMainMenu) => {
        let serverState = new StateDB(/*{ namespace: Application.STATE_NAMESPACE }*/);
        // Insert a local server
        let servers: IServerManagerMenuArgs[] = [{ name: 'Local', type: 'local' }];

        serverState.fetch(Application.SERVER_STATE_ID)
            .then((data: Application.IRemoteServerState | null) => {
                if (!data) {
                    createServerManager(app, palette, menu, servers);
                } else {
                    servers.concat(data.remotes.map((remote) => {
                        return {
                            type: 'remote',
                            name: remote.name,
                            id: remote.id
                        } as IServerManagerMenuArgs;
                    }));
                    createServerManager(app, palette, menu, servers);
                }
            })
            .catch((e) => {
                log.log(e);
                createServerManager(app, palette, menu, servers);
            });

        return null;
    },
    autoStart: true
};

function createServerManager(app: ElectronJupyterLab, palette: ICommandPalette,
                             menu: IMainMenu, servers: IServerManagerMenuArgs[]) {
    app.commands.addCommand(CommandIDs.activateServerManager, {
        label: 'Add Server',
        execute: () => {
            asyncRemoteRenderer.runRemoteMethod(ISessions.createSession, {
                state: 'new'
            });
        }
    });
    app.commands.addCommand(CommandIDs.connectToServer, {
        label: (args) => args.name as string,
        execute: (args: IServerManagerMenuArgs) => {
            asyncRemoteRenderer.runRemoteMethod(ISessions.createSession, {
                state: args.type,
                remoteServerId: args.remoteServerId
            });
        }
    });

    const { commands } = app;
    const serverMenu = new Menu({ commands });
    serverMenu.title.label = 'Servers';

    for (let s of servers) {
        serverMenu.addItem({ command: CommandIDs.connectToServer, args: s });
        palette.addItem({ command: CommandIDs.connectToServer, args: s, category: 'Servers' });
    }

    serverMenu.addItem({ type: 'separator' });
    serverMenu.addItem({ command: CommandIDs.activateServerManager });
    menu.addMenu(serverMenu, { rank: 25 });

    palette.addItem({ command: CommandIDs.activateServerManager, category: 'Servers' });
}

function buildTitleBar(app: ElectronJupyterLab): Widget {
    let titleBar = new Widget();
    ReactDOM.render(
        // <TitleBar uiState={app.info.uiState} />,
        <div />,
        titleBar.node
    );
    return titleBar;
}

function buildPhosphorMenu(app: ElectronJupyterLab): IMainMenu {
    let menu = new MainMenu(app.commands);
    let titleBar = buildTitleBar(app);

    menu.id = 'jpe-MainMenu-widget';
    titleBar.id = 'jpe-TitleBar-widget';

    titleBar.addClass('jpe-mod-' + app.info.uiState);

    let logo = new Widget();
    logo.addClass('jp-MainAreaPortraitIcon');
    logo.addClass('jpe-JupyterIcon');
    logo.id = 'jp-MainLogo';

    app.shell.add(logo, 'top');

    app.shell.add(menu, 'top');
    app.shell.add(titleBar, 'top');
    return menu;
}

function buildNativeMenu(app: ElectronJupyterLab, palette: ICommandPalette, router: IRouter): IMainMenu {
    let menu = new NativeMenu(app);
    const trans = nullTranslator.load('jupyterlab');

    let titleBar = buildTitleBar(app);
    titleBar.id = 'jpe-TitleBar-widget';
    titleBar.addClass('jpe-mod-' + app.info.uiState);

    app.shell.add(titleBar, 'top');

    createEditMenu(app, menu.editMenu, trans);
    createFileMenu(app, menu.fileMenu, router, trans);
    createKernelMenu(app, menu.kernelMenu, trans);
    createRunMenu(app, menu.runMenu, trans);
    // createSettingsMenu(app, menu.settingsMenu, trans);
    createViewMenu(app, menu.viewMenu, trans);
    createTabsMenu(app, menu.tabsMenu, app.shell, trans);

    palette.addItem({
        command: MainMenuExtensionCommandIDs.shutdownAllKernels,
        category: 'Kernel Operations'
    });

    return menu;
}

/**
 * Override main menu plugin in @jupyterlab/mainmenu-extension
 */
mainMenuExtension.then(ext => {
    /**
     * A service providing an native menu bar.
     */
    // @ts-ignore
    const nativeMainMenuPlugin: JupyterFrontEndPlugin<IMainMenu> = {
        id: '@jupyterlab/mainmenu-extension:plugin',
        requires: [ICommandPalette, IRouter],
        provides: IMainMenu,
        activate: (app: ElectronJupyterLab, palette: ICommandPalette, router: IRouter): IMainMenu | Promise<IMainMenu> => {

            let menu: IMainMenu | Promise<IMainMenu>;
            let uiState = app.info.uiState;
            if (uiState === 'linux' || uiState === 'mac') {
                menu = buildNativeMenu(app, palette, router);
            } else {
                menu = buildPhosphorMenu(app);
            }

            return menu;
        }
    };

    //ext.default = nativeMainMenuPlugin;
}).catch(reason => {
    log.error(`Failed to load @jupyterlab/mainmenu-extension because ${reason}`);
});

class SettingsConnector extends DataConnector<ISettingRegistry.IPlugin, string> {

    constructor() {
        super();
    }

    fetch(id: string): Promise<ISettingRegistry.IPlugin> {
        return asyncRemoteRenderer.runRemoteMethod(IElectronDataConnector.fetch, id);
    }

    remove(): Promise<void> {
        return Promise.reject(new Error('Removing setting resource is not supported.'));
    }

    save(id: string, raw: string): Promise<void> {
        return asyncRemoteRenderer.runRemoteMethod(IElectronDataConnector.save, { id, raw });
    }

}

/**
 * The default setting registry provider.
 */
// @ts-ignore
const settingPlugin: JupyterFrontEndPlugin<ISettingRegistry> = {
    id: '@jupyterlab/apputils-extension:settings',
    activate: (): ISettingRegistry => {
        return new SettingRegistry({ connector: new SettingsConnector() });
    },
    autoStart: true,
    provides: ISettingRegistry
};

/**
 * The native theme manager provider.
 */
// @ts-ignore
const themesPlugin: JupyterFrontEndPlugin<IThemeManager> = {
    id: '@jupyterlab/apputils-extension:themes',
    requires: [ISettingRegistry, ISplashScreen],
    optional: [ICommandPalette, IMainMenu],
    activate: (app: JupyterLab, settingRegistry: ISettingRegistry, splash: ISplashScreen, palette: ICommandPalette | null, mainMenu: IMainMenu | null): IThemeManager => {
        const host = app.shell;
        // const when = app.started;
        const commands = app.commands;

        const manager = new ThemeManager({
            key: themesPlugin.id,
            host, settings: settingRegistry,
            url: app.paths.urls.base + app.paths.urls.themes,
            splash,
            // when
        });

        commands.addCommand('apputils:change-theme', {
            label: args => {
                const theme = args['theme'] as string;
                return args['isPalette'] ? `Use ${theme} Theme` : theme;
            },
            isToggled: args => args['theme'] === manager.theme,
            execute: args => {
                if (args['theme'] === manager.theme) {
                    return;
                }
                manager.setTheme(args['theme'] as string);
            }
        });

        // If we have a main menu, add the theme manager
        // to the settings menu.
        if (mainMenu) {
            const themeMenu = new Menu({ commands });
            themeMenu.title.label = 'JupyterLab Theme';
            // manager.ready.then(() => {
                const command = 'apputils:change-theme';
                const isPalette = false;

                manager.themes.forEach(theme => {
                    themeMenu.addItem({ command, args: { isPalette, theme } });
                });

                mainMenu.settingsMenu.addGroup([{
                    type: 'submenu' as Menu.ItemType, submenu: themeMenu
                }], 0);
            // });
        }

        // If we have a command palette, add theme switching options to it.
        if (palette) {
            // manager.ready.then(() => {
                const category = 'Settings';
                const command = 'apputils:change-theme';
                const isPalette = true;

                manager.themes.forEach(theme => {
                    palette.addItem({ command, args: { isPalette, theme }, category });
                });
            // });
        }

        return manager;
    },
    autoStart: true,
    provides: IThemeManager
};

/**
 * Override Main Menu plugin from apputils-extension
 */
let nPlugins = plugins.map((p: JupyterFrontEndPlugin<any>) => {
    switch (p.id) {
        // case settingPlugin.id:
        //     return settingPlugin;
        // case themesPlugin.id:
        //     return themesPlugin;
        default:
            return p;
    }
});

nPlugins.push(serverManagerPlugin);
export default nPlugins;
