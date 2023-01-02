import { app, Menu, MenuItem } from 'electron';
import log, { LevelOption } from 'electron-log';
import yargs from 'yargs/yargs';
import * as fs from 'fs';
import { getAppDir, isDevMode } from './utils';
import { execSync } from 'child_process';
import { ICLIArguments, JupyterApplication } from './app';

/**
 *  * On Mac OSX the PATH env variable a packaged app gets does not
 * contain all the information that is usually set in .bashrc, .bash_profile, etc.
 * This package fixes the PATH variable
 */
require('fix-path')();

const argv = yargs(process.argv.slice(isDevMode() ? 2 : 1))
  .usage('jlab [options] folder/file paths')
  .example('jlab', 'Launch in default working directory')
  .example('jlab .', 'Launch in current directory')
  .example('jlab /data/nb/test.ipynb', 'Launch in /data/nb and open test.ipynb')
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
    default: 'debug'
  })
  .help('h')
  .alias({
    h: 'help'
  })
  .parseSync();

if (isDevMode()) {
  log.transports.console.level = argv.logLevel as LevelOption;
  log.transports.file.level = false;

  log.info('In development mode');
  log.info(`Logging to console at '${log.transports.console.level}' level`);
} else {
  log.transports.file.level = argv.logLevel as LevelOption;
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

/**
 * A user-defined service.
 *
 * Services make up the core functionality of the
 * application. Each service is instantiated
 * once and then becomes available to every other service.
 */
export interface IService {
  /**
   * The required services.
   */
  requirements: string[];

  /**
   * The service name that is required by other services.
   */
  provides: string;

  /**
   * A function to create the service object.
   */
  activate: (...x: any[]) => any;

  /**
   * Whether the service should be instantiated immediately,
   * or lazy loaded.
   */
  autostart?: boolean;
}

const thisYear = new Date().getFullYear();

app.setAboutPanelOptions({
  applicationName: 'JupyterLab Desktop',
  applicationVersion: app.getVersion(),
  version: app.getVersion(),
  website: 'https://jupyter.org/about.html',
  copyright: `© 2015-${thisYear}  Project Jupyter Contributors`
});

// when a file is double clicked this method is called,
// whether the app was open previously or not
app.on('open-file', (event: Electron.Event, _path: string) => {
  const appJustLaunched = app.isReady();

  app.whenReady().then(() => {
    console.log(`open-file ready ${_path}`);

    if (appJustLaunched) {
      // create new sesssion
    } else {
      // find a session, or prompt to create new session
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

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
let jupyterApp;

/**
 * Load all services when the electron app is
 * ready.
 */
app.on('ready', () => {
  setApplicationMenu();

  handOverArguments()
    .then(() => {
      setupJLabCommand();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
function handOverArguments(): Promise<void> {
  let promise = new Promise<void>((resolve, reject) => {
    app.requestSingleInstanceLock();
    // TODO; double check this logic
    app.on('second-instance', (event, argv, cwd) => {
      // Skip JupyterLab Executable
      for (let i = 1; i < argv.length; i++) {
        app.emit('open-file', null, argv[i]);
      }
      reject();
    });
    resolve();
  });
  return promise;
}
