// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  JupyterLab, JupyterLabPlugin,
} from '@jupyterlab/application';

import {
  ICommandPalette
} from '@jupyterlab/apputils';

import {
  JupyterApplicationIPC as AppIPC
} from 'jupyterlab_app/src/ipc';

import {
  ipcRenderer, Browser
} from 'jupyterlab_app/src/browser/utils';

import {
  JupyterLabSession
} from 'jupyterlab_app/src/main/sessions';

import {
  each
} from '@phosphor/algorithm';

import {
  Widget
} from '@phosphor/widgets';

import plugins from '@jupyterlab/application-extension';

/**
 * The command IDs used by the application plugin.
 */
namespace CommandIDs {
  export
  const activateNextTab: string = 'main-jupyterlab:activate-next-tab';

  export
  const activatePreviousTab: string = 'main-jupyterlab:activate-previous-tab';

  export
  const closeAll: string = 'main-jupyterlab:close-all';

  export
  const setMode: string = 'main-jupyterlab:set-mode';

  export
  const toggleMode: string = 'main-jupyterlab:toggle-mode';
};



export
class ElectronJupyterLab extends JupyterLab {

  constructor(options: ElectronJupyterLab.IOptions) {
    super(options);
    
    this._electronInfo = {
      name: options.name || 'JupyterLab',
      namespace: options.namespace || 'jupyterlab',
      version:  options.version || 'unknown',
      devMode: options.devMode || false,
      settingsDir: options.settingsDir || '',
      assetsDir: options.assetsDir || '',
      platform: options.platform,
      uiState: options.uiState || 'windows'
    };

    // Get the top panel widget
    let topPanel: Widget;
    each(this.shell.layout.iter(), (widget: Widget) => {
      if (widget.id == 'jp-top-panel') {
        topPanel = widget;
        return false;
      }
    });
    topPanel.addClass('jpe-mod-' + options.uiState);
    
    if (options.uiState == 'mac') {
      // Resize the top panel based on zoom factor
      topPanel.node.style.minHeight = topPanel.node.style.height = String(Browser.getTopPanelSize()) + 'px';
      // Resize the top panel on zoom events
      ipcRenderer.on(AppIPC.POST_ZOOM_EVENT, () => {
        topPanel.node.style.minHeight = topPanel.node.style.height = String(Browser.getTopPanelSize()) + 'px';
        this.shell.fit();
      });
    }
  }

  get info(): ElectronJupyterLab.IInfo {
    return this._electronInfo;
  }

  private _electronInfo: ElectronJupyterLab.IInfo;
}

export
namespace ElectronJupyterLab {

  export
  interface IOptions extends JupyterLab.IOptions {
    uiState?: JupyterLabSession.UIState;
    platform: NodeJS.Platform;
  }

  export
  interface IInfo extends JupyterLab.IInfo {
    uiState: JupyterLabSession.UIState;
    platform: NodeJS.Platform;
  }
}

/**
 * The main extension.
 */
const mainPlugin: JupyterLabPlugin<void> = {
  id: 'jupyter.extensions.main',
  requires: [ICommandPalette],
  activate: (app: JupyterLab, palette: ICommandPalette) => {
    addCommands(app, palette);
  },
  autoStart: true
};

/**
 * Add the main application commands.
 */
function addCommands(app: JupyterLab, palette: ICommandPalette): void {
  const category = 'Main Area';
  let command = CommandIDs.activateNextTab;
  app.commands.addCommand(command, {
    label: 'Activate Next Tab',
    execute: () => { app.shell.activateNextTab(); }
  });
  palette.addItem({ command, category });

  command = CommandIDs.activatePreviousTab;
  app.commands.addCommand(command, {
    label: 'Activate Previous Tab',
    execute: () => { app.shell.activatePreviousTab(); }
  });
  palette.addItem({ command, category });

  command = CommandIDs.closeAll;
  app.commands.addCommand(command, {
    label: 'Close All Widgets',
    execute: () => { app.shell.closeAll(); }
  });
  palette.addItem({ command, category });

  command = CommandIDs.setMode;
  app.commands.addCommand(command, {
    isVisible: args => {
      const mode = args['mode'] as string;
      return mode === 'single-document' || mode === 'multiple-document';
    },
    execute: args => {
      const mode = args['mode'] as string;
      if (mode === 'single-document' || mode === 'multiple-document') {
        app.shell.mode = mode;
        return;
      }
      throw new Error(`Unsupported application shell mode: ${mode}`);
    }
  });

  command = CommandIDs.toggleMode;
  app.commands.addCommand(command, {
    label: 'Toggle Single-Document Mode',
    execute: () => {
      const args = app.shell.mode === 'multiple-document' ?
        { mode: 'single-document' } : { mode: 'multiple-document' };
      return app.commands.execute(CommandIDs.setMode, args);
    }
  });
  palette.addItem({ command, category });
}


/**
 * Override default jupyterlab plugins
 */
let nPlugins = plugins.map((p: JupyterLabPlugin<any>) => {
    if (p.id == 'jupyter.extensions.main')
        return mainPlugin;
    return p;
});
export default nPlugins;
