import { app, Menu, MenuItem } from 'electron';
import log, { LevelOption } from 'electron-log';
import * as fs from 'fs';
import * as semver from 'semver';
import {
  bundledEnvironmentIsInstalled,
  EnvironmentInstallStatus,
  getBundledPythonEnvPath,
  getBundledPythonPath,
  installBundledEnvironment,
  isDevMode,
  jlabCLICommandIsSetup,
  setupJlabCommandWithUserRights,
  versionWithoutSuffix,
  waitForDuration,
  waitForFunction
} from './utils';
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
    if (!fs.existsSync(envsDir)) {
      fs.mkdirSync(envsDir, { recursive: true });
    }
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
  } catch (error) {
    log.error(error);
    app.quit();
  }
});

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
