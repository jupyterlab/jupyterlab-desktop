import { app, BrowserWindow, dialog, Menu, MenuItem, shell } from 'electron';

// Update paths to prevent Snap saving persistent data to version specific paths.
// (Must be called before any other initialization)
updatePathsForSnap();

import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';
import {
  bundledEnvironmentIsInstalled,
  EnvironmentInstallStatus,
  getBundledPythonEnvPath,
  getBundledPythonPath,
  getUnreadableConfigFiles,
  installBundledEnvironment,
  isDevMode,
  jlabCLICommandIsSetup,
  resetConfigFile,
  setupJlabCommandWithUserRights,
  versionWithoutSuffix,
  waitForDuration,
  waitForFunction
} from './utils';

import log, { LevelOption } from 'electron-log';
import { JupyterApplication } from './app';
import { ICLIArguments } from './tokens';
import { SessionConfig } from './config/sessionconfig';
import { SettingType, userSettings } from './config/settings';
import { parseCLIArgs } from './cli';
import { getPythonEnvsDirectory, runCommandInEnvironment } from './env';
import { ThemedWindow } from './dialog/themedwindow';
import { appData } from './config/appdata';

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

/**
 * Update app home, appData, userData and logs paths to prevent
 * Snap to save Python environments and logs in version specific locations
 */
function updatePathsForSnap() {
  const isSnap = (): boolean => {
    return process.platform === 'linux' && process.env.SNAP !== undefined;
  };

  if (!isSnap()) {
    return;
  }

  const userHome = process.env.HOME;
  process.env.XDG_CONFIG_HOME = `${userHome}/.config`;
  // Jupyter uses this path (.local/share)
  process.env.XDG_DATA_HOME = `${userHome}/.local/share`;
  const appDataDir = process.env.XDG_CONFIG_HOME;
  const userDataDir = `${appDataDir}/${app.getName()}`;

  app.setPath('home', userHome);
  app.setPath('appData', appDataDir);
  app.setPath('userData', userDataDir);
  app.setAppLogsPath(`${userDataDir}/logs`);
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

let argv: ICLIArguments;

function redirectConsoleToLog() {
  console.log = log.log;
  console.error = log.error;
  console.warn = log.warn;
  console.info = log.info;
  console.debug = log.debug;

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
}

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
      log.error('Failed to open files', error);
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

  if (jlabCLICommandIsSetup()) {
    return;
  }

  setupJlabCommandWithUserRights();
}

function createPythonEnvsDirectory() {
  const envsDir = getPythonEnvsDirectory();

  try {
    fs.mkdirSync(envsDir, { recursive: true });
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

app.on('ready', async () => {
  try {
    await processArgs();
  } catch (error) {
    log.error(error);
    app.quit();
  }

  try {
    await handleMultipleAppInstances();
    await updateBundledPythonEnvInstallation();
    redirectConsoleToLog();
    setApplicationMenu();
    setupJLabCommand();
    createPythonEnvsDirectory();
    argv.cwd = process.cwd();
    jupyterApp = new JupyterApplication((argv as unknown) as ICLIArguments);
    reportUnreadableConfig();
  } catch (error) {
    log.error(error);
    app.quit();
  }
});

/**
 * Say so when config could not be read. Falling back to defaults is not a
 * neutral act: which interpreter runs, which conda channels packages come
 * from, and whether updates install by themselves all revert with it, so this
 * is worth interrupting for rather than leaving in a log nobody opens.
 */
function reportUnreadableConfig(): void {
  const files = getUnreadableConfigFiles();
  if (files.length === 0) {
    return;
  }

  const fileList = files.join('\n');
  const them = files.length === 1 ? 'it' : 'them';
  const detail =
    `Nothing has been moved or deleted, and settings will not be saved over ` +
    `${them} while this session runs.\n\n${fileList}\n\n` +
    `Repair the JSON and restart to pick the values back up, or use Reset to ` +
    `Defaults below, which moves ${them} aside with a .corrupt suffix and ` +
    `saves normally from then on.`;

  // Waits for a window and hands it over as the parent. Electron's dialog docs
  // note that on macOS a message box with no parent "runs synchronously due to
  // platform limitations", so showing this before the first window blocks the
  // whole startup until somebody clicks: an app launched at login or over a
  // remote session never comes up, and the e2e harness cannot get past it.
  firstWindow()
    .then(parent =>
      dialog.showMessageBox(parent, {
        type: 'warning',
        title: 'Configuration could not be read',
        message:
          files.length === 1
            ? 'A configuration file could not be read, so this session started with defaults.'
            : 'Some configuration files could not be read, so this session started with defaults.',
        detail,
        buttons: ['Show in Folder', 'Reset to Defaults', 'Continue'],
        defaultId: 2,
        cancelId: 2
      })
    )
    .then(({ response }) => {
      if (response === 0) {
        revealConfigFiles(files);
      } else if (response === 1) {
        reportFailedResets(files.filter(file => !resetConfigFile(file)));
      }
    })
    .catch(error =>
      log.error('Could not show the unreadable configuration notice', error)
    );
}

/**
 * The parent a message box needs so that showing it does not block startup.
 * Bounded, and destroyed windows are skipped: the notice is worth losing to
 * the log, and a parent that has gone away leaves the box without one, which
 * is the case that hangs.
 */
async function firstWindow(): Promise<BrowserWindow> {
  await waitForFunction(() => liveWindows().length > 0, 30000);
  // the focused one first: several windows are up by now, and attaching to a
  // transient one means the sheet closes with it before anybody reads it
  const focused = BrowserWindow.getFocusedWindow();
  const parent = focused && !focused.isDestroyed() ? focused : liveWindows()[0];
  if (!parent) {
    throw new Error('every window closed before the notice could be shown');
  }
  return parent;
}

function liveWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter(win => !win.isDestroyed());
}

function revealConfigFiles(files: readonly string[]): void {
  try {
    // one window per folder, since two config files can share a directory
    new Map(
      files.map(filePath => [path.dirname(filePath), filePath])
    ).forEach(filePath => shell.showItemInFolder(filePath));
  } catch (error) {
    log.error('Could not reveal the configuration files', error);
  }
}

function reportFailedResets(stuck: string[]): void {
  if (stuck.length === 0) {
    return;
  }

  firstWindow()
    .then(parent =>
      dialog.showMessageBox(parent, {
        type: 'error',
        title: 'Configuration could not be moved aside',
        message:
          stuck.length === 1
            ? 'The file is still in place, so this session keeps its defaults.'
            : 'The files are still in place, so this session keeps its defaults.',
        detail: `${stuck.join('\n')}\n\nSee the log for the reason.`
      })
    )
    .catch(error => log.error('Could not show the failed reset notice', error));
}

function processArgs(): Promise<void> {
  return new Promise<void>(resolve => {
    parseCLIArgs(process.argv.slice(isDevMode() ? 2 : 1)).then(value => {
      argv = value;
      if (
        ['--help', '--version', 'env', 'config', 'appdata', 'logs'].find(arg =>
          process.argv?.includes(arg)
        )
      ) {
        app.quit();
        return;
      }
      resolve();
    });
  });
}

/**
 * When a second instance of the application is executed, this passes the arguments
 * to first instance. Files that are opened with the application on Linux and Windows
 * will by default instantiate a new instance of the app with the file name as the args.
 * This instead opens the files in the first instance of the
 * application.
 */
function handleMultipleAppInstances(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
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
      reject('Handling request in the main instance.');
    }
  });
}

async function needToUpdateBundledPythonEnvInstallation(): Promise<boolean> {
  // update on restart requested
  if (appData.updateBundledEnvOnRestart) {
    return true;
  }

  // update if auto update is
  if (
    !(
      userSettings.getValue(SettingType.updateBundledEnvAutomatically) &&
      bundledEnvironmentIsInstalled()
    )
  ) {
    return false;
  }

  const appDataEnvironments = [
    ...appData.discoveredPythonEnvs,
    ...appData.userSetPythonEnvs
  ];
  const bundledPythonPath = getBundledPythonPath();
  const bundledEnvInAppData = appDataEnvironments.find(
    env => bundledPythonPath === env.path
  );

  const appVersion = app.getVersion();

  try {
    // if the version in appData is latest, then assume it is latest
    if (bundledEnvInAppData) {
      const jlabVersionInAppData = bundledEnvInAppData.versions['jupyterlab'];

      if (
        semver.compare(
          versionWithoutSuffix(jlabVersionInAppData),
          versionWithoutSuffix(appVersion)
        ) >= 0
      ) {
        return false;
      }
    }

    // if not latest in appData check the active jupyterlab version
    // in case appData is outdated
    let outputVersion = '';
    if (
      await runCommandInEnvironment(
        getBundledPythonEnvPath(),
        `python -c "import jupyterlab; print(jupyterlab.__version__)"`,
        {
          stdout: msg => {
            outputVersion += msg;
          }
        }
      )
    ) {
      if (
        semver.compare(
          versionWithoutSuffix(outputVersion.trim()),
          versionWithoutSuffix(appVersion)
        ) === -1
      ) {
        return true;
      }
    }
  } catch (error) {
    log.error('Failed to check for env update need.', error);
  }

  return false;
}

async function updateBundledPythonEnvInstallation() {
  if (!(await needToUpdateBundledPythonEnvInstallation())) {
    return;
  }

  const statusDialog = new ThemedWindow({
    isDarkTheme: true,
    title: 'Updating bundled environment installation',
    width: 400,
    height: 150,
    closable: false
  });

  const setStatusMessage = (message: string) => {
    statusDialog.loadDialogContent(message);
    waitForDuration(100);
  };

  setStatusMessage('Reinstalling environment.');

  const installPath = getBundledPythonEnvPath();
  await installBundledEnvironment(installPath, {
    onInstallStatus: (status, message) => {
      log.info(`Bundled env install status: ${status}, message ${message}`);
      switch (status) {
        case EnvironmentInstallStatus.RemovingExistingInstallation:
          setStatusMessage('Removing existing installation...');
          break;
        case EnvironmentInstallStatus.Started:
          setStatusMessage('Installing new version...');
          break;
        case EnvironmentInstallStatus.Success:
          {
            appData.updateBundledEnvOnRestart = false;
            setStatusMessage('Finished updating.');
            setTimeout(() => {
              statusDialog.close();
            }, 2000);
          }
          break;
        case EnvironmentInstallStatus.Failure:
          setStatusMessage('Failed to update! See logs for more details.');
          setTimeout(() => {
            statusDialog.close();
          }, 3000);
          break;
      }
    },
    get forceOverwrite() {
      return true;
    }
  }).catch(reason => {
    log.error('Failed to update the bundled environment!', reason);
  });
}
