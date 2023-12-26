import { execFileSync, spawn } from 'child_process';
import {
  createCommandScriptInEnv,
  createTempFile,
  EnvironmentInstallStatus,
  envPathForPythonPath,
  getBundledPythonEnvPath,
  getBundledPythonPath,
  installBundledEnvironment,
  isBaseCondaEnv,
  isEnvInstalledByDesktopApp,
  markEnvironmentAsJupyterInstalled,
  pythonPathForEnvPath
} from './utils';
import yargs from 'yargs/yargs';
import * as fs from 'fs';
import * as path from 'path';
import { appData } from './config/appdata';
import { IEnvironmentType, IPythonEnvironment } from './tokens';
import { SettingType, userSettings } from './config/settings';
import { Registry } from './registry';

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
      'jlab env install',
      'Install bundled Python environment to the default path'
    )
    .example(
      'jlab env install --path /opt/jlab_server',
      'Install bundled Python environment to /opt/jlab_server'
    )
    .example(
      'jlab env create --path /opt/jlab_server',
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
      h: 'help'
    })
    .command(
      'env <action> [path]',
      'Manage Python environments',
      yargs => {
        yargs
          .positional('action', {
            describe: 'Python environment action',
            type: 'string',
            default: ''
          })
          .positional('path', {
            type: 'string',
            default: '',
            describe: 'Destination path'
          })
          .option('force', {
            describe: 'Force the action',
            type: 'boolean',
            default: false
          })
          .option('exclude-jlab', {
            describe: 'Exclude jupyterlab Python package in env create',
            type: 'boolean',
            default: false
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
            await handleEnvInstallCommand(argv);
            break;
          case 'activate':
            await handleEnvActivateCommand(argv);
            break;
          case 'create':
            await handleEnvCreateCommand(argv);
            break;
          case 'set-base-conda-env-path':
            await handleEnvSetBaseCondaCommand(argv);
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
    .parseAsync();
}

export async function handleEnvInfoCommand(argv: any) {
  const bundledEnvPath = getBundledPythonEnvPath();
  const bundledEnvPathExists =
    fs.existsSync(bundledEnvPath) && fs.statSync(bundledEnvPath).isDirectory();
  let defaultPythonPath = userSettings.getValue(SettingType.pythonPath);
  if (defaultPythonPath === '') {
    defaultPythonPath = getBundledPythonPath();
  }
  const defaultEnvPath = envPathForPythonPath(defaultPythonPath);
  const defaultEnvPathExists =
    fs.existsSync(defaultEnvPath) && fs.statSync(defaultEnvPath).isDirectory();
  const condaRootPath = appData.condaRootPath;
  const condaRootPathExists =
    condaRootPath &&
    fs.existsSync(condaRootPath) &&
    fs.statSync(condaRootPath).isDirectory();
  const systemPythonPath = appData.systemPythonPath;
  const systemPythonPathExists =
    systemPythonPath &&
    fs.existsSync(systemPythonPath) &&
    fs.statSync(systemPythonPath).isFile();

  const infoLines: string[] = [];
  infoLines.push(
    `Default Python environment path:\n  "${defaultEnvPath}" [${
      defaultEnvPathExists ? 'exists' : 'not found'
    }]`
  );
  infoLines.push(
    `Bundled Python environment installation path:\n  "${bundledEnvPath}" [${
      bundledEnvPathExists ? 'exists' : 'not found'
    }]`
  );
  infoLines.push(
    `Base conda environment path:\n  "${condaRootPath}" [${
      condaRootPathExists ? 'exists' : 'not found'
    }]`
  );
  infoLines.push(
    `System Python path:\n  "${systemPythonPath}" [${
      systemPythonPathExists ? 'exists' : 'not found'
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
        `  [${env.name}], path: ${envPath}${
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

export async function handleEnvInstallCommand(argv: any) {
  const installPath = (argv.path as string) || getBundledPythonEnvPath();
  console.log(`Installing to "${installPath}"`);

  await installBundledEnvironment(installPath, {
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
          if (argv.path) {
            addUserSetEnvironment(installPath, true);
          }
          console.log('Installation succeeded.');
          break;
      }
    },
    get forceOverwrite() {
      return argv.force;
    }
  }).catch(reason => {
    //
  });
}

export async function handleEnvActivateCommand(argv: any) {
  const envPath = (argv.path as string) || getBundledPythonEnvPath();
  console.log(`Activating Python environment "${envPath}"`);

  await launchCLIinEnvironment(envPath);
}

export async function handleEnvUpdateRegistryCommand(argv: any) {
  console.log(`Updating JupyterLab Desktop's Python environment registry...`);
  const registry = new Registry();
  await registry.ready;
  appData.save();
}

export async function createPythonEnvironment(
  envPath: string,
  envType: string,
  packages: string,
  callbacks?: ICommandRunCallbacks
) {
  const isConda = envType === 'conda';
  const condaRootExists = isBaseCondaEnv(appData.condaRootPath);

  if (isConda) {
    const createCommand = `conda create -y -c conda-forge -p ${envPath} ${packages}`;
    await runCommandInEnvironment(
      appData.condaRootPath,
      createCommand,
      callbacks
    );
  } else {
    if (condaRootExists) {
      const createCommand = `python -m venv create ${envPath}`;
      await runCommandInEnvironment(
        appData.condaRootPath,
        createCommand,
        callbacks
      );
    } else if (fs.existsSync(appData.systemPythonPath)) {
      execFileSync(appData.systemPythonPath, ['-m', 'venv', 'create', envPath]);
    } else {
      throw {
        message:
          'Failed to create Python environment. Python executable not found.'
      };
    }

    if (packages.trim() !== '') {
      const installCommand = `python -m pip install ${packages}`;
      console.log('Installing packages...');
      await runCommandInEnvironment(envPath, installCommand, callbacks);
    }
  }

  markEnvironmentAsJupyterInstalled(envPath);
  addUserSetEnvironment(envPath, isConda);
}

export async function handleEnvCreateCommand(argv: any) {
  const envPath = argv.path as string;

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
        'Environment path not empty. Use --force flag to overwrite.'
      );
      return;
    }
  }

  const excludeJlab = argv.excludeJlab === true;
  const envType = argv.envType;
  const isConda = envType === 'conda';
  const condaRootExists = isBaseCondaEnv(appData.condaRootPath);

  const packageList = argv._.slice(1);
  if (!excludeJlab) {
    packageList.push('jupyterlab');
  }

  console.log(`Creating Python environment at "${envPath}"...`);

  if (isConda && !condaRootExists) {
    console.error(
      'conda base environment not found. You can set using jlab --set-base-conda-env-path command.'
    );
    return;
  }

  const createCondaEnv = isConda || (envType === 'auto' && condaRootExists);

  try {
    await createPythonEnvironment(
      envPath,
      createCondaEnv ? 'conda' : 'venv',
      packageList.join(' ')
    );
  } catch (error) {
    console.error(error);
  }
}

export async function handleEnvSetBaseCondaCommand(argv: any) {
  const envPath = argv.path as string;
  if (!fs.existsSync(envPath)) {
    console.error(`Environment path "${envPath}" does not exist`);
    return;
  } else if (!isBaseCondaEnv(envPath)) {
    console.error(`"${envPath}" is not a base conda environemnt`);
    return;
  }

  console.log(`Setting "${envPath}" as the base conda environment`);
  appData.condaRootPath = envPath;
  appData.save();
}

export async function launchCLIinEnvironment(
  envPath: string
): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const isWin = process.platform === 'win32';
    envPath = envPath || getBundledPythonEnvPath();

    const activateCommand = createCommandScriptInEnv(
      envPath,
      appData.condaRootPath
    );
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

export interface ICommandRunCallback {
  (msg: string): void;
}

export interface ICommandRunCallbacks {
  stdout?: ICommandRunCallback;
  stderr?: ICommandRunCallback;
}

export async function runCommandInEnvironment(
  envPath: string,
  command: string,
  callbacks?: ICommandRunCallbacks
) {
  const isWin = process.platform === 'win32';
  const commandScript = createCommandScriptInEnv(
    envPath,
    appData.condaRootPath,
    command,
    ' && '
  );

  // TODO: implement timeout. in case there is network issues

  return new Promise<boolean>((resolve, reject) => {
    const shell = isWin
      ? spawn('cmd', ['/c', commandScript], {
          env: process.env,
          windowsVerbatimArguments: true
        })
      : spawn('bash', ['-c', commandScript], {
          env: {
            ...process.env,
            BASH_SILENCE_DEPRECATION_WARNING: '1'
          }
        });

    if (shell.stdout) {
      shell.stdout.on('data', chunk => {
        const msg = Buffer.from(chunk).toString();
        console.debug('>', msg);
        if (callbacks?.stdout) {
          callbacks.stdout(msg);
        }
      });
    }
    if (shell.stderr) {
      shell.stderr.on('data', chunk => {
        const msg = Buffer.from(chunk).toString();
        console.error('>', msg);
        if (callbacks?.stdout) {
          callbacks.stdout(msg);
        }
      });
    }

    shell.on('close', code => {
      if (code !== 0) {
        console.error('Shell exit with code:', code);
        resolve(false);
      }
      resolve(true);
    });
  });
}
