/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import { IMainMenu } from '@jupyterlab/mainmenu';
import { IStatusBar } from '@jupyterlab/statusbar';
import { JupyterFrontEndPlugin } from '@jupyterlab/application';
import { PageConfig } from '@jupyterlab/coreutils';
import { ElectronJupyterLab } from '../electron-extension';
import { IPythonEnvironment } from 'src/main/tokens';
import { EnvironmentStatus } from './envStatus';

const desktopExtension: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-desktop.extensions.desktop',
  requires: [IMainMenu, IStatusBar],
  activate: (
    app: ElectronJupyterLab,
    menu: IMainMenu,
    statusBar: IStatusBar
  ) => {
    const changeEnvironment = async () => {
      window.electronAPI.showServerConfigDialog();
    };

    const statusItem = new EnvironmentStatus({
      name: 'env',
      description: '',
      onClick: changeEnvironment
    });

    statusBar.registerStatusItem('jupyterlab-desktop-py-env-status', {
      item: statusItem,
      align: 'left'
    });

    const updateStatusItemLocal = (env: IPythonEnvironment) => {
      statusItem.model.name = `Local (${env.name})`;
      let packages = [];
      for (const name in env.versions) {
        packages.push(`${name}: ${env.versions[name]}`);
      }
      statusItem.model.description = `Local server\n${env.name}\n${
        env.path
      }\n${packages.join(', ')}`;
    };

    const updateStatusItemRemote = (url: string) => {
      statusItem.model.name = 'Remote';
      statusItem.model.description = `Remote server\n${url}`;
    };

    // patch for index.html? shown as app window title
    app.shell.layoutModified.connect(() => {
      setTimeout(() => {
        if (document.title.startsWith('index.html?')) {
          document.title = 'JupyterLab';
        }
      }, 100);
    });

    const serverType = PageConfig.getOption('jupyterlab-desktop-server-type');
    if (serverType === 'local') {
      window.electronAPI.getCurrentPythonEnvironment().then(env => {
        updateStatusItemLocal(env);
      });
    } else {
      const serverUrl = PageConfig.getOption('jupyterlab-desktop-server-url');
      updateStatusItemRemote(serverUrl);
    }
  },
  autoStart: true
};

export default desktopExtension;
