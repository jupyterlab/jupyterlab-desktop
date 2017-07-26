// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  JupyterLab, JupyterLabPlugin,
} from '@jupyterlab/application';

import {
  ICommandPalette, IMainMenu
} from '@jupyterlab/apputils';

import {
    Menu
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

/**
 * The main extension.
 */
const mainPlugin: JupyterLabPlugin<void> = {
  id: 'jupyter.extensions.main',
  requires: [ICommandPalette, IMainMenu],
  activate: (app: JupyterLab, palette: ICommandPalette, menu: IMainMenu) => {
    addCommands(app, palette);

    // Add the edit menu
    const { commands } = app;
    const editMenu = new Menu({ commands });
    editMenu.title.label = 'Edit';
    [
      {args: {role: 'undo'}},
      {args: {role: 'redo'}},
      {args: {type: 'separator'}},
      {args: {role: 'cut'}},
      {args: {role: 'copy'}},
      {args: {role: 'paste'}},
      {args: {role: 'pasteandmatchstyle'}},
      {args: {role: 'delete'}},
      {args: {role: 'selectall'}}
    ].forEach((item: Menu.IItemOptions) => {
      editMenu.addItem(item);
    })

    menu.addMenu(editMenu, {rank: 5});

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
 * Export the plugins as default.
 */
plugins[0] = mainPlugin;
export default plugins;
