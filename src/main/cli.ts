import { execFileSync, spawn } from 'child_process';
import {
  createCommandScriptInEnv,
  createTempFile,
  EnvironmentInstallStatus,
  envPathForPythonPath,
  getBundledEnvInstallerPath,
  getBundledPythonEnvPath,
  getBundledPythonPath,
  getLogFilePath,
  installCondaPackEnvironment,
  isBaseCondaEnv,
  isEnvInstalledByDesktopApp,
  markEnvironmentAsJupyterInstalled,
  pythonPathForEnvPath
} from './utils';
import yargs from 'yargs/yargs';
import * as fs from 'fs';
import * as path from 'path';
import { appData, ApplicationData } from './config/appdata';
import { IEnvironmentType, IPythonEnvironment } from './tokens';
import {
  SettingType,
  UserSettings,
  userSettings,
  WorkspaceSettings
} from './config/settings';
import { Registry } from './registry';
import { app, shell } from 'electron';
import {
  condaEnvPathForCondaExePath,
  getCondaChannels,
  getCondaPath,
  getPythonEnvsDirectory,
  getSystemPythonPath,
  ICommandRunCallbacks,
  runCommandInEnvironment,
  validateCondaPath,
  validatePythonEnvironmentInstallDirectory,
  validateSystemPythonPath
} from './env';

export function parseCLIArgs(argv: string[]) {
  return yargs(argv)
    .scriptName('jlab')
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
    .example(
      'jlab env create',
      'Install bundled Python environment to the default path'
    )
    .example(
      'jlab env create --source bundle --prefix /opt/jlab_server',
      'Install bundled Python environment to /opt/jlab_server'
    )
    .example(
      'jlab env create --prefix /opt/jlab_server',
      'Create new Python environment at /opt/jlab_server'
    )
    .example(
      'jlab env activate',
      'Activate bundled Python environment at the default path'
    )
    .option('python-path', {
      describe: 'Python path',
      type: 'string'
    })
    .option('persist-session-data', {
      describe: 'Persist session data for remote server connections',
      type: 'boolean',
      default: true
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
      h: 'help',
      n: 'name',
      c: 'channel',
      p: 'prefix'
    })
    .command(
      'env <action>',
      'Manage Python environments',
      yargs => {
        yargs
          .positional('action', {
            describe: 'Python environment action',
            type: 'string',
            default: ''
          })
          .option('name', {
            describe: 'Environment name',
            type: 'string',
            default: ''
          })
          .option('prefix', {
            describe: 'Environment location',
            type: 'string',
            default: ''
          })
          .option('source', {
            describe: 'Environment / package source',
            type: 'string',
            default: ''
          })
          .option('source-type', {
            describe: 'Environment / package source type',
            choices: [
              'registry',
              'conda-pack',
              'conda-lock-file',
              'conda-env-file'
            ],
            default: 'registry'
          })
          .option('channel', {
            describe: 'conda package channels',
            type: 'array',
            default: []
          })
          .option('force', {
            describe: 'Force the action',
            type: 'boolean',
            default: false
          })
          .option('add-jupyterlab-package', {
            describe:
              'Auto-add jupyterlab Python package to newly created environments',
            type: 'boolean',
            default: true
          })
          .option('env-type', {
            describe: 'Python environment type',
            choices: ['auto', 'conda', 'venv'],
            default: 'auto'
          });
      },
      async argv => {
        console.log('Note: This is an experimental feature.');

        const action = argv.action;
        switch (action) {
          case 'info':
            await handleEnvInfoCommand(argv);
            break;
          case 'list':
            await handleEnvListCommand(argv);
            break;
          case 'install':
            console.log('Not implemented yet!');
            break;
          case 'activate':
            await handleEnvActivateCommand(argv);
            break;
          case 'create':
            await handleEnvCreateCommand(argv);
            break;
          case 'set-python-envs-path':
            await handleEnvSetPythonEnvsPathCommand(argv);
            break;
          case 'set-conda-path':
            await handleEnvSetCondaPathCommand(argv);
            break;
          case 'set-conda-channels':
            await handleEnvSetCondaChannelsCommand(argv);
            break;
          case 'set-system-python-path':
            await handleEnvSetSystemPythonPathCommand(argv);
            break;
          case 'update-registry':
            await handleEnvUpdateRegistryCommand(argv);
            break;
          default:
            console.log('Invalid input for "env" command.');
            break;
        }
      }
    )
    .command(
      'config <action>',
      'Manage JupyterLab Desktop settings',
      yargs => {
        yargs
          .positional('action', {
            describe: 'Setting action',
            choices: ['list', 'set', 'unset', 'open-file'],
            default: 'list'
          })
          .option('project', {
            describe: 'Set config for project at current working directory',
            type: 'boolean',
            default: false
          })
          .option('project-path', {
            describe: 'Set / list config for project at specified path',
            type: 'string'
          });
      },
      async argv => {
        console.log('Note: This is an experimental feature.');

        const action = argv.action;
        switch (action) {
          case 'list':
            handleConfigListCommand(argv);
            break;
          case 'set':
            handleConfigSetCommand(argv);
            break;
          case 'unset':
            handleConfigUnsetCommand(argv);
            break;
          case 'open-file':
            handleConfigOpenFileCommand(argv);
            break;
          default:
            console.log('Invalid input for "config" command.');
            break;
        }
      }
    )
    .command(
      'appdata <action>',
      'Manage JupyterLab Desktop app data',
      yargs => {
        yargs.positional('action', {
          describe: 'App data action',
          choices: ['list', 'open-file'],
          default: 'list'
        });
      },
      async argv => {
        console.log('Note: This is an experimental feature.');

        const action = argv.action;
        switch (action) {
          case 'list':
            handleAppDataListCommand(argv);
            break;
          case 'open-file':
            handleAppDataOpenFileCommand(argv);
            break;
          default:
            console.log('Invalid input for "appdata" command.');
            break;
        }
      }
    )
    .command(
      'logs <action>',
      'Manage JupyterLab Desktop logs',
      yargs => {
        yargs.positional('action', {
          describe: 'Logs action',
          choices: ['show', 'open-file'],
          default: 'show'
        });
      },
      async argv => {
        console.log('Note: This is an experimental feature.');

        const action = argv.action;
        switch (action) {
          case 'show':
            handleLogsShowCommand(argv);
            break;
          case 'open-file':
            handleLogsOpenFileCommand(argv);
            break;
          default:
            console.log('Invalid input for "logs" command.');
            break;
        }
      }
    )
    .parseAsync();
}

export async function handleEnvInfoCommand(argv: any) {
  const bundledPythonPath = getBundledPythonPath();
  const bundledPythonPathExists =
    fs.existsSync(bundledPythonPath) &&
    (fs.statSync(bundledPythonPath).isFile() ||
      fs.statSync(bundledPythonPath).isSymbolicLink());
  // TODO: move this logic to getJupyterLabPythonPath or similar
  let defaultPythonPath = userSettings.getValue(SettingType.pythonPath);
  if (!defaultPythonPath) {
    defaultPythonPath = getBundledPythonPath();
  }
  if (!fs.existsSync(defaultPythonPath)) {
    defaultPythonPath = appData.pythonPath;
  }
  const defaultPythonPathExists =
    fs.existsSync(defaultPythonPath) &&
    (fs.statSync(defaultPythonPath).isFile() ||
      fs.statSync(defaultPythonPath).isSymbolicLink());
  const condaPath = getCondaPath();
  const condaChannels = userSettings.getValue(SettingType.condaChannels);
  const condaPathExists =
    condaPath && fs.existsSync(condaPath) && fs.statSync(condaPath).isFile();
  const systemPythonPath = getSystemPythonPath();
  const systemPythonPathExists =
    systemPythonPath &&
    fs.existsSync(systemPythonPath) &&
    fs.statSync(systemPythonPath).isFile();
  const envsDir = getPythonEnvsDirectory();
  const envsDirExists =
    envsDir && fs.existsSync(envsDir) && fs.statSync(envsDir).isDirectory();

  const infoLines: string[] = [];
  infoLines.push(
    `Default Python path for JupyterLab Server:\n  "${defaultPythonPath}" [${
      defaultPythonPathExists ? 'exists' : 'not found'
    }]`
  );
  infoLines.push(
    `Bundled Python installation path:\n  "${bundledPythonPath}" [${
      bundledPythonPathExists ? 'exists' : 'not found'
    }]`
  );
  infoLines.push(
    `conda path:\n  "${condaPath}" [${
      condaPathExists ? 'exists' : 'not found'
    }]`
  );
  infoLines.push(`conda channels:\n  "${condaChannels.join(' ')}"`);
  infoLines.push(
    `System Python path:\n  "${systemPythonPath}" [${
      systemPythonPathExists ? 'exists' : 'not found'
    }]`
  );
  infoLines.push(
    `Python environment install directory:\n  "${envsDir}" [${
      envsDirExists ? 'exists' : 'not found'
    }]`
  );

  console.log(infoLines.join('\n'));
}

export async function handleEnvListCommand(argv: any) {
  const listLines: string[] = [];

  const listEnvironments = (envs: IPythonEnvironment[]) => {
    envs.forEach(env => {
      const versions = Object.keys(env.versions).map(
        name => `${name}: ${env.versions[name]}`
      );
      const envPath = envPathForPythonPath(env.path);
      const installedByApp = isEnvInstalledByDesktopApp(envPath);
      listLines.push(
        `  [${env.name}], Python path: ${env.path}${
          installedByApp ? ', installed by JupyterLab Desktop' : ''
        }\n    packages: ${versions.join(', ')}`
      );
    });
  };

  listLines.push('Discovered Python environments:');
  if (appData.discoveredPythonEnvs.length > 0) {
    listEnvironments(appData.discoveredPythonEnvs);
  } else {
    listLines.push('  None');
  }

  listLines.push('\nUser set Python environments:');
  if (appData.userSetPythonEnvs.length > 0) {
    listEnvironments(appData.userSetPythonEnvs);
  } else {
    listLines.push('  None');
  }

  console.log(listLines.join('\n'));
}

export function addUserSetEnvironment(envPath: string, isConda: boolean) {
  const pythonPath = pythonPathForEnvPath(envPath, isConda);

  // this record will get updated with the correct data once app launches
  console.log(
    `Saving the environment at "${envPath}" to application environments list`
  );
  appData.userSetPythonEnvs.push({
    path: pythonPath,
    name: `${isConda ? 'conda' : 'venv'}: ${path.basename(envPath)}`,
    type: IEnvironmentType.Path,
    versions: {},
    defaultKernel: 'python3'
  });
  appData.save();

  // use as the default Python if not exists
  let defaultPythonPath = userSettings.getValue(SettingType.pythonPath);
  if (defaultPythonPath === '') {
    defaultPythonPath = getBundledPythonPath();

    if (!fs.existsSync(defaultPythonPath)) {
      defaultPythonPath = pythonPathForEnvPath(envPath, isConda);
      if (fs.existsSync(defaultPythonPath)) {
        console.log(
          `Setting "${defaultPythonPath}" as the default Python path`
        );
        userSettings.setValue(SettingType.pythonPath, defaultPythonPath);
        userSettings.save();
      }
    }
  }
}

export async function handleInstallCondaPackEnvironment(
  condaPackPath: string,
  installPath: string,
  forceOverwrite: boolean
) {
  console.log(`Installing to "${installPath}"`);

  await installCondaPackEnvironment(condaPackPath, installPath, {
    onInstallStatus: (status, message) => {
      switch (status) {
        case EnvironmentInstallStatus.RemovingExistingInstallation:
          console.log('Removing the existing installation...');
          break;
        case EnvironmentInstallStatus.Started:
          console.log('Installing Python environment...');
          break;
        case EnvironmentInstallStatus.Cancelled:
          console.log(
            'Installation cancelled since install path is not empty. Retry with --force to overwrite.'
          );
          break;
        case EnvironmentInstallStatus.Failure:
          console.error(`Failed to install.`, message);
          break;
        case EnvironmentInstallStatus.Success:
          if (installPath !== getBundledPythonEnvPath()) {
            addUserSetEnvironment(installPath, true);
          }
          console.log('Installation succeeded.');
          break;
      }
    },
    get forceOverwrite() {
      return forceOverwrite;
    }
  }).catch(reason => {
    //
  });
}

async function installAdditionalCondaPackagesToEnv(
  envPath: string,
  packageList: string[],
  channelList?: string[],
  callbacks?: ICommandRunCallbacks
) {
  const baseCondaPath = getCondaPath();
  const baseCondaEnvPath = baseCondaPath
    ? condaEnvPathForCondaExePath(baseCondaPath)
    : '';
  const condaBaseEnvExists = baseCondaEnvPath
    ? isBaseCondaEnv(baseCondaEnvPath)
    : false;

  if (!condaBaseEnvExists) {
    throw new Error(`Base conda path not found "${baseCondaEnvPath}".`);
  }

  if (packageList.length === 0) {
    throw new Error('No package specified.');
  }

  const packages = packageList.join(' ');
  const condaChannels =
    channelList?.length > 0 ? channelList : getCondaChannels();
  const channels = condaChannels.map(channel => `-c ${channel}`).join(' ');
  // TODO: remove classic solver. since installing additional packages onto conda-lock
  // generated environments fails with mamba solver, classic is used here.
  // should be fixed with conda 24.1. https://github.com/conda/conda-libmamba-solver/pull/429
  const installCommand = `conda install -y ${channels} --solver=classic -p ${envPath} ${packages}`;
  console.log(`Installing additional packages: "${packages}"`);
  await runCommandInEnvironment(baseCondaEnvPath, installCommand, callbacks);
}

export async function handleEnvActivateCommand(argv: any) {
  let envPath: string;
  if (argv.name) {
    envPath = path.join(getPythonEnvsDirectory(), argv.name);
  } else if (argv.prefix) {
    envPath = path.resolve(argv.prefix);
  } else {
    if (argv._.length === 2) {
      const envNameOrPath = argv._[1];
      if (
        fs.existsSync(envNameOrPath) &&
        fs.statSync(envNameOrPath).isDirectory()
      ) {
        envPath = envNameOrPath;
      } else {
        const envPathFromArg = path.join(
          getPythonEnvsDirectory(),
          envNameOrPath
        );
        if (
          fs.existsSync(envPathFromArg) &&
          fs.statSync(envPathFromArg).isDirectory()
        ) {
          envPath = envPathFromArg;
        }
      }
    }
    if (!envPath) {
      envPath = getBundledPythonEnvPath();
    }
  }

  if (
    !(envPath && fs.existsSync(envPath) && fs.statSync(envPath).isDirectory())
  ) {
    console.error(`Invalid environment directory "${envPath}"`);
    return;
  }

  console.log(`Activating Python environment "${envPath}"`);

  await launchCLIinEnvironment(envPath);
}

export async function handleEnvUpdateRegistryCommand(argv: any) {
  console.log(`Updating JupyterLab Desktop's Python environment registry...`);
  const registry = new Registry();
  await registry.ready;
  appData.save();
}

export interface ICreatePythonEnvironmentOptions {
  envPath: string;
  envType: string;
  sourceFilePath?: string;
  sourceType?: 'registry' | 'conda-pack' | 'conda-lock-file' | 'conda-env-file';
  packageList?: string[];
  condaChannels?: string[];
  callbacks?: ICommandRunCallbacks;
}

export async function createPythonEnvironment(
  options: ICreatePythonEnvironmentOptions
) {
  const {
    envPath,
    envType,
    packageList,
    callbacks,
    sourceFilePath,
    sourceType
  } = options;
  const isConda = envType === 'conda';
  const baseCondaPath = getCondaPath();
  const baseCondaEnvPath = baseCondaPath
    ? condaEnvPathForCondaExePath(baseCondaPath)
    : '';
  const condaBaseEnvExists = baseCondaEnvPath
    ? isBaseCondaEnv(baseCondaEnvPath)
    : false;

  const packages = packageList ? packageList.join(' ') : '';

  if (isConda) {
    if (!condaBaseEnvExists) {
      throw new Error(
        'Failed to create Python environment. Base conda environment not found.'
      );
    }

    const condaChannels =
      options.condaChannels?.length > 0
        ? options.condaChannels
        : getCondaChannels();
    const channels = condaChannels.map(channel => `-c ${channel}`).join(' ');
    if (sourceType === 'conda-lock-file') {
      const createCommand = `conda-lock install -p ${envPath} ${sourceFilePath}`;
      if (
        !(await runCommandInEnvironment(
          baseCondaEnvPath,
          createCommand,
          callbacks
        ))
      ) {
        throw new Error(
          `Failed to create environment from pack. Make sure "conda-lock" Python package is installed in then base environment "${baseCondaEnvPath}".`
        );
      }

      if (packages) {
        // TODO: remove classic solver. since installing additional packages onto conda-lock
        // generated environments fails with mamba solver, classic is used here.
        // should be fixed with conda 24.1. https://github.com/conda/conda-libmamba-solver/pull/429
        const installCommand = `conda install -y ${channels} --solver=classic -p ${envPath} ${packages}`;
        console.log(`Installing additional packages: "${packages}"`);
        await runCommandInEnvironment(
          baseCondaEnvPath,
          installCommand,
          callbacks
        );
      }
    } else if (sourceType === 'conda-env-file') {
      const createCommand = `conda env create -p ${envPath} -f ${sourceFilePath} -y`;
      await runCommandInEnvironment(baseCondaEnvPath, createCommand, callbacks);

      if (packages) {
        const installCommand = `conda install -y ${channels} -p ${envPath} ${packages}`;
        console.log(`Installing additional packages: "${packages}"`);
        await runCommandInEnvironment(
          baseCondaEnvPath,
          installCommand,
          callbacks
        );
      }
    } else {
      const createCommand = `conda create -p ${envPath} ${packages} ${channels} -y`;
      await runCommandInEnvironment(baseCondaEnvPath, createCommand, callbacks);
    }
  } else {
    const systemPythonPath = getSystemPythonPath();
    if (condaBaseEnvExists) {
      const createCommand = `python -m venv ${envPath}`;
      await runCommandInEnvironment(baseCondaEnvPath, createCommand, callbacks);
    } else if (fs.existsSync(systemPythonPath)) {
      execFileSync(systemPythonPath, ['-m', 'venv', envPath]);
    } else {
      throw new Error(
        'Failed to create Python environment. Python executable not found.'
      );
    }

    if (packages) {
      const installCommand = `python -m pip install ${packages}`;
      console.log('Installing packages...');
      await runCommandInEnvironment(envPath, installCommand, callbacks);
    }
  }

  markEnvironmentAsJupyterInstalled(envPath, {
    type: isConda ? 'conda' : 'venv',
    source: 'registry',
    appVersion: app.getVersion()
  });

  if (packages.includes('jupyterlab')) {
    addUserSetEnvironment(envPath, isConda);
  }
}

function isURL(urlString: string) {
  try {
    const url = new URL(urlString);
    return url && (url.protocol === 'https:' || url.protocol === 'http:');
  } catch (error) {
    return false;
  }
}

async function downloadToTempFile(
  fetchURL: string,
  fileName: string
): Promise<string> {
  console.log(`Downloading "${fetchURL}"...`);
  const downloadPath = createTempFile(fileName, '', null);
  const response = await fetch(fetchURL);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(downloadPath, buffer);
  console.log(`Finished downloading and saved to temp file "${downloadPath}"`);

  return downloadPath;
}

export async function handleEnvCreateCommand(argv: any) {
  let envPath: string;
  let installingToBundledEnvPath = false;
  if (argv.name) {
    envPath = path.join(getPythonEnvsDirectory(), argv.name);
  } else if (argv.prefix) {
    envPath = path.resolve(argv.prefix);
  } else {
    envPath = getBundledPythonEnvPath();
    installingToBundledEnvPath = true;
  }

  if (!envPath) {
    console.error('Environment path not set.');
    return;
  }

  if (fs.existsSync(envPath)) {
    if (argv.force) {
      console.log('Removing the existing environment...');
      try {
        fs.rmSync(envPath, { recursive: true });
      } catch (error) {
        console.error(`Failed to delete ${envPath}`);
        return;
      }
    } else {
      console.error(
        `Environment path ("${envPath}") not empty. Use --force flag to overwrite.`
      );
      return;
    }
  }

  // if no name or prefix path specified (jlab env create), use bundled installer
  let source = installingToBundledEnvPath ? 'bundle' : argv.source;

  const { sourceType } = argv;
  const isCondaPackSource = source === 'bundle' || sourceType === 'conda-pack';

  const packageList: string[] = argv._.slice(1);
  // add jupyterlab package unless source is conda pack
  if (source !== 'bundle' && argv.addJupyterlabPackage === true) {
    packageList.push('jupyterlab');
  }

  console.log(`Creating Python environment at "${envPath}"...`);

  let sourceIsTempFile = false;
  let sourceFilePath = '';

  if (isCondaPackSource) {
    if (source === 'bundle') {
      sourceFilePath = getBundledEnvInstallerPath();
    } else if (sourceType === 'conda-pack') {
      if (isURL(source)) {
        try {
          sourceFilePath = await downloadToTempFile(source, 'pack.tar.gz');
          sourceIsTempFile = true;
        } catch (error) {
          console.error(error);
        }
      } else {
        source = path.resolve(source);
        if (fs.existsSync(source) && fs.statSync(source).isFile()) {
          sourceFilePath = source;
        } else {
          console.error(`Source not found at "${source}".`);
        }
      }
    }

    if (sourceFilePath) {
      await handleInstallCondaPackEnvironment(
        sourceFilePath,
        envPath,
        argv.force
      );
      if (sourceIsTempFile) {
        fs.unlinkSync(sourceFilePath);
      }

      if (packageList.length > 0) {
        await installAdditionalCondaPackagesToEnv(
          envPath,
          packageList,
          argv.channel
        );
      }
    }

    return;
  }

  if (sourceType === 'conda-lock-file' || sourceType === 'conda-env-file') {
    if (isURL(source)) {
      try {
        sourceFilePath = await downloadToTempFile(
          source,
          sourceType === 'conda-lock-file' ? 'env.lock' : 'env.yml'
        );
        sourceIsTempFile = true;
      } catch (error) {
        console.error(error);
      }
    } else {
      source = path.resolve(source);
      if (fs.existsSync(source) && fs.statSync(source).isFile()) {
        sourceFilePath = source;
      }
    }

    if (!sourceFilePath) {
      console.error(`Invalid env source "${source}".`);
      return;
    }
  }

  const envType = argv.envType;
  const isConda =
    envType === 'conda' ||
    sourceType === 'conda-pack' ||
    sourceType === 'conda-lock-file' ||
    sourceType === 'conda-env-file';
  const baseCondaPath = getCondaPath();
  const condaEnvPath = baseCondaPath
    ? condaEnvPathForCondaExePath(baseCondaPath)
    : '';
  const condaBaseEnvExists = condaEnvPath
    ? isBaseCondaEnv(condaEnvPath)
    : false;

  if (isConda && !condaBaseEnvExists) {
    console.error(
      'conda base environment not found. You can set using jlab --set-base-conda-env-path command.'
    );
    return;
  }

  const createCondaEnv = isConda || (envType === 'auto' && condaBaseEnvExists);

  try {
    await createPythonEnvironment({
      envPath,
      envType: createCondaEnv ? 'conda' : 'venv',
      sourceFilePath: sourceFilePath,
      sourceType: sourceType,
      packageList,
      condaChannels: argv.channel
    });
  } catch (error) {
    console.error(error);
  }

  if (sourceIsTempFile) {
    fs.unlinkSync(sourceFilePath);
  }
}

export async function handleEnvSetPythonEnvsPathCommand(argv: any) {
  const dirPath = argv._.length === 2 ? argv._[1] : undefined;
  if (!dirPath) {
    console.error('Please set a valid envs directory');
    return;
  }

  const res = validatePythonEnvironmentInstallDirectory(dirPath);

  if (!res.valid) {
    console.error(res.message);
    return;
  }

  console.log(
    `Setting "${dirPath}" as the Python environment install directory`
  );
  userSettings.setValue(SettingType.pythonEnvsPath, dirPath);
  userSettings.save();
}

export async function handleEnvSetCondaPathCommand(argv: any) {
  const condaPath = argv._.length === 2 ? argv._[1] : undefined;
  if (!condaPath) {
    console.error('Please set a valid conda path');
    return;
  }

  if (!fs.existsSync(condaPath)) {
    console.error(`conda path "${condaPath}" does not exist`);
    return;
  } else if (!(await validateCondaPath(condaPath)).valid) {
    console.error(`"${condaPath}" is not a valid conda path`);
    return;
  }

  console.log(`Setting "${condaPath}" as the conda path`);
  userSettings.setValue(SettingType.condaPath, condaPath);
  userSettings.save();
}

export async function handleEnvSetCondaChannelsCommand(argv: any) {
  const channelList = argv._.slice(1);
  console.log(`Setting conda channels to "${channelList.join(' ')}"`);
  userSettings.setValue(SettingType.condaChannels, channelList);
  userSettings.save();
}

export async function handleEnvSetSystemPythonPathCommand(argv: any) {
  const systemPythonPath = argv._.length === 2 ? argv._[1] : undefined;
  if (!systemPythonPath) {
    console.error('Please set a valid Python path');
    return;
  }

  if (!fs.existsSync(systemPythonPath)) {
    console.error(`Python path "${systemPythonPath}" does not exist`);
    return;
  } else if (!(await validateSystemPythonPath(systemPythonPath)).valid) {
    console.error(`"${systemPythonPath}" is not a valid Python path`);
    return;
  }

  console.log(`Setting "${systemPythonPath}" as the system Python path`);
  userSettings.setValue(SettingType.systemPythonPath, systemPythonPath);
  userSettings.save();
}

function getProjectPathForConfigCommand(argv: any): string | undefined {
  let projectPath = undefined;
  if (argv.project || argv.projectPath) {
    projectPath = argv.projectPath
      ? path.resolve(argv.projectPath)
      : process.cwd();
    if (
      argv.projectPath &&
      !(fs.existsSync(projectPath) && fs.statSync(projectPath).isDirectory())
    ) {
      console.error(`Invalid project path! "${projectPath}"`);
      process.exit(1);
    }
  }

  return projectPath;
}

function handleConfigListCommand(argv: any) {
  const listLines: string[] = [];

  const projectPath = argv.projectPath
    ? path.resolve(argv.projectPath)
    : process.cwd();

  listLines.push('Project / Workspace settings');
  listLines.push('============================');
  listLines.push(`[Project path: ${projectPath}]`);
  listLines.push(
    `[Source file: ${WorkspaceSettings.getWorkspaceSettingsPath(projectPath)}]`
  );
  listLines.push('\nSettings');
  listLines.push('========');

  const wsSettings = new WorkspaceSettings(projectPath).settings;
  const wsSettingKeys = Object.keys(wsSettings).sort();
  if (wsSettingKeys.length > 0) {
    for (let key of wsSettingKeys) {
      const value = wsSettings[key].value;
      listLines.push(`${key}: ${JSON.stringify(value)}`);
    }
  } else {
    listLines.push('No setting overrides found in project directory.');
  }
  listLines.push('\n');

  listLines.push('Global settings');
  listLines.push('===============');
  listLines.push(`[Source file: ${UserSettings.getUserSettingsPath()}]`);
  listLines.push('\nSettings');
  listLines.push('========');

  const settingKeys = Object.values(SettingType).sort();
  const settings = userSettings.settings;

  for (let key of settingKeys) {
    const setting = settings[key];
    listLines.push(
      `${key}: ${JSON.stringify(setting.value)} [${
        setting.differentThanDefault ? 'modified' : 'set to default'
      }${setting.wsOverridable ? ', project overridable' : ''}]`
    );
  }

  console.log(listLines.join('\n'));
}

function handleConfigSetCommand(argv: any) {
  const parseSetting = (): { key: string; value: string } => {
    if (argv._.length !== 3) {
      console.error(`Invalid setting. Use "set <settingKey> <value>" format.`);
      return { key: undefined, value: undefined };
    }

    let value;

    // boolean, arrays, objects
    try {
      value = JSON.parse(argv._[2]);
    } catch (error) {
      try {
        // string without quotes
        value = JSON.parse(`"${argv._[2]}"`);
      } catch (error) {
        console.error(error.message);
      }
    }

    return { key: argv._[1], value: value };
  };

  const projectPath = getProjectPathForConfigCommand(argv);

  let key, value;
  try {
    const keyVal = parseSetting();
    key = keyVal.key;
    value = keyVal.value;
  } catch (error) {
    console.error('Failed to parse setting!');
    return;
  }

  if (key === undefined || value === undefined) {
    console.error('Failed to parse key value pair!');
    return;
  }

  if (!(key in SettingType)) {
    console.error(`Invalid setting key! "${key}"`);
    return;
  }

  if (projectPath) {
    const setting = userSettings.settings[key];
    if (!setting.wsOverridable) {
      console.error(`Setting "${key}" is not overridable by project.`);
      return;
    }

    const wsSettings = new WorkspaceSettings(projectPath);
    wsSettings.setValue(key as SettingType, value);
    wsSettings.save();
  } else {
    userSettings.setValue(key as SettingType, value);
    userSettings.save();
  }

  console.log(
    `${
      projectPath ? 'Project' : 'Global'
    } setting "${key}" set to "${value}" successfully.`
  );
}

function handleConfigUnsetCommand(argv: any) {
  const parseKey = (): string => {
    if (argv._.length !== 2) {
      console.error(`Invalid setting. Use "unset <settingKey>" format.`);
      return undefined;
    }

    return argv._[1];
  };

  const projectPath = getProjectPathForConfigCommand(argv);

  let key = parseKey();

  if (!key) {
    return;
  }

  if (!(key in SettingType)) {
    console.error(`Invalid setting key! "${key}"`);
    return;
  }

  if (projectPath) {
    const setting = userSettings.settings[key];
    if (!setting.wsOverridable) {
      console.error(`Setting "${key}" is not overridable by project.`);
      return;
    }

    const wsSettings = new WorkspaceSettings(projectPath);
    wsSettings.unsetValue(key as SettingType);
    wsSettings.save();
  } else {
    userSettings.unsetValue(key as SettingType);
    userSettings.save();
  }

  console.log(
    `${projectPath ? 'Project' : 'Global'} setting "${key}" reset to ${
      projectPath ? 'global ' : ''
    }default successfully.`
  );
}

function handleConfigOpenFileCommand(argv: any) {
  const projectPath = getProjectPathForConfigCommand(argv);
  const settingsFilePath = projectPath
    ? WorkspaceSettings.getWorkspaceSettingsPath(projectPath)
    : UserSettings.getUserSettingsPath();

  console.log(`Settings file path: ${settingsFilePath}`);

  if (
    !(fs.existsSync(settingsFilePath) && fs.statSync(settingsFilePath).isFile())
  ) {
    console.log('Settings file does not exist!');
    return;
  }

  shell.openPath(settingsFilePath);
}

function handleAppDataListCommand(argv: any) {
  const listLines: string[] = [];

  listLines.push('Application data');
  listLines.push('================');
  listLines.push(`[Source file: ${ApplicationData.getAppDataPath()}]`);
  listLines.push('\nData');
  listLines.push('====');

  const skippedKeys = new Set(['newsList']);
  const appDataKeys = Object.keys(appData).sort();

  for (let key of appDataKeys) {
    if (key.startsWith('_') || skippedKeys.has(key)) {
      continue;
    }
    const data = (appData as any)[key];
    listLines.push(`${key}: ${JSON.stringify(data)}`);
  }

  console.log(listLines.join('\n'));
}

function handleAppDataOpenFileCommand(argv: any) {
  const appDataFilePath = ApplicationData.getAppDataPath();
  console.log(`App data file path: ${appDataFilePath}`);

  if (
    !(fs.existsSync(appDataFilePath) && fs.statSync(appDataFilePath).isFile())
  ) {
    console.log('App data file does not exist!');
    return;
  }

  shell.openPath(appDataFilePath);
}

function handleLogsShowCommand(argv: any) {
  const logFilePath = getLogFilePath();
  console.log(`Log file path: ${logFilePath}`);

  if (!(fs.existsSync(logFilePath) && fs.statSync(logFilePath).isFile())) {
    console.log('Log file does not exist!');
    return;
  }

  const logs = fs.readFileSync(logFilePath);
  console.log(logs.toString());
}

function handleLogsOpenFileCommand(argv: any) {
  const logFilePath = getLogFilePath();
  console.log(`Log file path: ${logFilePath}`);

  if (!(fs.existsSync(logFilePath) && fs.statSync(logFilePath).isFile())) {
    console.log('Log file does not exist!');
    return;
  }

  shell.openPath(logFilePath);
}

export async function launchCLIinEnvironment(
  envPath: string
): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const isWin = process.platform === 'win32';
    envPath = envPath || getBundledPythonEnvPath();

    const baseCondaPath = getCondaPath();
    const baseCondaEnvPath = baseCondaPath
      ? condaEnvPathForCondaExePath(baseCondaPath)
      : '';
    const activateCommand = createCommandScriptInEnv(envPath, baseCondaEnvPath);
    const ext = isWin ? 'bat' : 'sh';
    const activateFilePath = createTempFile(`activate.${ext}`, activateCommand);

    const shell = isWin
      ? spawn('cmd', ['/C', `start cmd.exe /k ${activateFilePath}`], {
          stdio: 'inherit',
          env: process.env
        })
      : spawn('bash', ['--init-file', activateFilePath], {
          stdio: 'inherit',
          env: {
            ...process.env,
            BASH_SILENCE_DEPRECATION_WARNING: '1'
          }
        });

    shell.on('close', code => {
      if (code !== 0) {
        console.error('Shell exit with code:', code);
      }

      if (isWin) {
        setTimeout(() => {
          fs.unlinkSync(activateFilePath);
          resolve(true);
        }, 5000);
      } else {
        fs.unlinkSync(activateFilePath);
        resolve(true);
      }
    });
  });
}
