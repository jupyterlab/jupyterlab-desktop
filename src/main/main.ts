import { app, Menu, MenuItem } from 'electron';
import log, { LevelOption } from 'electron-log';
import yargs from 'yargs/yargs';
import * as fs from 'fs';
import { getAppDir, isDevMode, waitForFunction } from './utils';
import { execSync } from 'child_process';
import { JupyterApplication } from './app';
import { ICLIArguments } from './tokens';
import { SessionConfig } from './config/sessionconfig';
import { SettingType, userSettings } from './config/settings';

let jupyterApp: JupyterApplication;
let fileToOpenInMainInstance = '';

async function appReady(): Promise<boolean> {
  // wait for electron app ready
  await app.whenReady();
  // wait for jupyterApp created
  await waitForFunction((): boolean => {
    return !!jupyterApp;
  });

  return true;
}

/**
 *  * On Mac OSX the PATH env variable a packaged app gets does not
 * contain all the information that is usually set in .bashrc, .bash_profile, etc.
 * This package fixes the PATH variable
 */
require('fix-path')();

function parseArgs(argv: string[]) {
  return yargs(argv)
    .usage('jlab [options] folder/file paths')
    .example('jlab', 'Launch in default working directory')
    .example('jlab .', 'Launch in current directory')
    .example(
      'jlab /data/nb/test.ipynb',
      'Launch in /data/nb and open test.ipynb'
    )
    .example('jlab /data/nb', 'Launch in /data/nb')
    .example(
      'jlab --working-dir /data/nb test.ipynb sub/test2.ipynb',
      'Launch in /data/nb and open /data/nb/test.ipynb and /data/nb/sub/test2.ipynb'
    )
    .option('python-path', {
      describe: 'Python path',
      type: 'string'
    })
    .option('working-dir', {
      describe: 'Working directory',
      type: 'string'
    })
    .option('log-level', {
      describe: 'Log level',
      choices: ['error', 'warn', 'info', 'verbose', 'debug'],
      default: 'warn'
    })
    .help('h')
    .alias({
      h: 'help'
    })
    .parseSync();
}

function getLogLevel(): LevelOption {
  if (isDevMode()) {
    return 'debug';
  }

  const cliLogLevelSet = process.argv?.indexOf('--log-level') > -1;
  if (cliLogLevelSet) {
    return argv.logLevel as LevelOption;
  }

  return userSettings.getValue(SettingType.logLevel);
}

const argv = parseArgs(process.argv.slice(isDevMode() ? 2 : 1));
const logLevel = getLogLevel();

if (isDevMode()) {
  log.transports.console.level = logLevel;
  log.transports.file.level = false;

  log.info('In development mode');
  log.info(`Logging to console at '${log.transports.console.level}' level`);
} else {
  log.transports.file.level = logLevel;
  log.transports.console.level = false;

  log.info('In production mode');
  log.info(
    `Logging to file (${log.transports.file.getFile().path}) at '${
      log.transports.file.level
    }' level`
  );
}

console.log = log.log;
console.error = log.error;
console.warn = log.warn;
console.info = log.info;
console.debug = log.debug;

const thisYear = new Date().getFullYear();

app.setAboutPanelOptions({
  applicationName: 'JupyterLab Desktop',
  applicationVersion: app.getVersion(),
  version: app.getVersion(),
  website: 'https://jupyter.org/about.html',
  copyright: `© 2015-${thisYear}  Project Jupyter Contributors`
});

// when a file is double clicked or dropped on the app icon on OS,
// this method is called
app.on('open-file', (event: Electron.Event, filePath: string) => {
  event.preventDefault();

  // open-file will be called early at launch, so there is chance to pass to main instance
  fileToOpenInMainInstance = filePath;

  appReady().then(() => {
    let fileOrFolders: string[] = [];

    try {
      if (process.platform === 'win32') {
        fileOrFolders = process.argv.slice(1); // TODO: this looks incorrect
      } else {
        fileOrFolders = [filePath];
      }
    } catch (error) {
      console.error('Failed to open files', error);
    }

    if (fileOrFolders.length > 0) {
      jupyterApp.handleOpenFilesOrFolders(fileOrFolders);
    }
  });
});

function setupJLabCommand() {
  if (process.platform !== 'darwin') {
    return;
  }

  const symlinkPath = '/usr/local/bin/jlab';
  const targetPath = `${getAppDir()}/app/jlab`;

  if (!fs.existsSync(targetPath)) {
    return;
  }

  try {
    if (!fs.existsSync(symlinkPath)) {
      const cmd = `ln -s ${targetPath} ${symlinkPath}`;
      execSync(cmd, { shell: '/bin/bash' });
      fs.chmodSync(symlinkPath, 0o755);
    }

    // after a DMG install, mode resets
    fs.chmodSync(targetPath, 0o755);
  } catch (error) {
    log.error(error);
  }
}

function setApplicationMenu() {
  if (process.platform !== 'darwin') {
    return;
  }

  // hide Help menu
  const menu = Menu.getApplicationMenu();
  let viewMenu: MenuItem | undefined;
  menu?.items.forEach(item => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (item.role === 'help') {
      item.visible = false;
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (item.role === 'viewmenu') {
      viewMenu = item;
    }
  });
  // hide Reload and Force Reload menu items
  viewMenu?.submenu?.items.forEach(item => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (item.role === 'reload' || item.role === 'forcereload') {
      item.visible = false;
      item.enabled = false;
    }
  });
  Menu.setApplicationMenu(menu);
}

/**
 * Load all services when the electron app is
 * ready.
 */
app.on('ready', () => {
  handleMultipleAppInstances()
    .then(() => {
      setApplicationMenu();
      setupJLabCommand();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      argv.cwd = process.cwd();
      jupyterApp = new JupyterApplication((argv as unknown) as ICLIArguments);
    })
    .catch(e => {
      log.error(e);
      app.quit();
    });
});

/**
 * When a second instance of the application is executed, this passes the arguments
 * to first instance. Files that are opened with the application on Linux and Windows
 * will by default instantiate a new instance of the app with the file name as the args.
 * This instead opens the files in the first instance of the
 * application.
 */
function handleMultipleAppInstances(): Promise<void> {
  let promise = new Promise<void>((resolve, reject) => {
    // only the first instance will get the lock
    // pass cliArgs to main instance since argv provided by second-instance
    // event is out of order
    const gotLock = app.requestSingleInstanceLock({
      cliArgs: argv,
      fileToOpenInMainInstance
    });
    if (gotLock) {
      app.on('second-instance', (event, argv, cwd, additionalData: any) => {
        // second instance created by double clicking a file
        if (additionalData?.fileToOpenInMainInstance) {
          jupyterApp.handleOpenFilesOrFolders([
            additionalData.fileToOpenInMainInstance
          ]);
        } else if (additionalData?.cliArgs) {
          // second instance created using CLI
          const cliArgs = additionalData.cliArgs;
          cliArgs.cwd = cwd;
          const sessionConfig = SessionConfig.createFromArgs(
            (cliArgs as unknown) as ICLIArguments
          );
          jupyterApp.openSession(sessionConfig);
        }
      });
      resolve();
    } else {
      // is second instance
      app.quit();
      reject();
    }
  });
  return promise;
}
