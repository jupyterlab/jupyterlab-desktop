import { app, Menu, MenuItem } from 'electron';

const Bottle = require('bottlejs');
import log from 'electron-log';
import * as yargs from 'yargs';
import * as path from 'path';
import * as fs from 'fs';
import { getAppDir, isDevMode } from './utils';
import { execSync } from 'child_process';

// handle opening file or directory with command-line arguments
if (process.argv.length > 1) {
  const openPath = path.resolve(process.argv[1]);

  if (fs.existsSync(openPath)) {
    if (fs.lstatSync(openPath).isDirectory()) {
      process.env.JLAB_DESKTOP_HOME = openPath;
    } else {
      process.env.JLAB_DESKTOP_HOME = path.dirname(openPath);
    }
  }
}

/**
 *  * On Mac OSX the PATH env variable a packaged app gets does not
 * contain all the information that is usually set in .bashrc, .bash_profile, etc.
 * This package fixes the PATH variable
 */
require('fix-path')();

let argv = yargs
  .option('v', {
    alias: 'verbose',
    count: true,
    type: 'boolean',
    describe: 'verbose output to terminal'
  })
  .help().argv;

/**
 * Enabled separate logging for development and packaged environments.
 * Also override console methods so that future addition will route to
 * using this package.
 */
let adjustedVerbose = parseInt((argv.verbose as unknown) as string) - 2;
if (isDevMode()) {
  if (adjustedVerbose === 0) {
    log.transports.console.level = 'info';
  } else if (adjustedVerbose === 1) {
    log.transports.console.level = 'verbose';
  } else if (adjustedVerbose >= 2) {
    log.transports.console.level = 'debug';
  }

  log.transports.file.level = false;

  log.info('In development mode');
  log.info(`Logging to console at '${log.transports.console.level}' level`);
} else {
  if (adjustedVerbose === 0) {
    log.transports.file.level = 'info';
  } else if (adjustedVerbose === 1) {
    log.transports.file.level = 'verbose';
  } else if (adjustedVerbose >= 2) {
    log.transports.file.level = 'debug';
  }

  log.transports.console.level = false;

  log.info('In production mode');
  log.info(
    `Logging to file (${log.transports.file.findLogPath()}) at '${
      log.transports.console.level
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

/**
 * Services required by this application.
 */
const services = [
  './app',
  './sessions',
  './server',
  './shortcuts',
  './utils',
  './registry'
].map((service: string) => {
  return require(service).default;
});

const thisYear = new Date().getFullYear();

app.setAboutPanelOptions({
  applicationName: 'JupyterLab Desktop',
  applicationVersion: app.getVersion(),
  version: app.getVersion(),
  website: 'https://jupyter.org/about.html',
  copyright: `© 2015-${thisYear}  Project Jupyter Contributors`
});

app.on('open-file', (event: Electron.Event, _path: string) => {
  process.env.JLAB_DESKTOP_HOME = path.dirname(_path);
});

function setupJLabCommand() {
  if (process.platform !== 'darwin') {
    return;
  }

  const symlinkPath = '/usr/local/bin/jlab';
  const targetPath = `${getAppDir()}/app/jlab`;

  if (fs.existsSync(symlinkPath) || !fs.existsSync(targetPath)) {
    return;
  }

  try {
    const cmd = `ln -s ${targetPath} ${symlinkPath}`;

    execSync(cmd, { shell: '/bin/bash' });
    fs.chmodSync(symlinkPath, 0o755);
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
  setApplicationMenu();

  handOverArguments()
    .then(() => {
      setupJLabCommand();
      let serviceManager = new Bottle();
      let autostarts: string[] = [];
      services.forEach((s: IService) => {
        serviceManager.factory(s.provides, (container: any) => {
          let args = s.requirements.map((r: string) => {
            return container[r];
          });
          return s.activate(...args);
        });
        if (s.autostart) {
          autostarts.push(s.provides);
        }
      });
      serviceManager.digest(autostarts);
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
