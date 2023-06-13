import { spawn } from 'child_process';
import {
  EnvironmentInstallStatus,
  getBundledPythonEnvPath,
  installBundledEnvironment
} from './utils';
import yargs from 'yargs/yargs';
import * as readline from 'node:readline';
import * as path from 'path';
import { appData } from './config/appdata';
import { IEnvironmentType } from './tokens';

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
      'jlab env activate',
      'Activate bundled Python environment at the default path'
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
          });
      },
      async argv => {
        console.log('Note: This is an experimental feature.');

        const action = argv.action;
        switch (action) {
          case 'install':
            await handleEnvInstallCommand(argv);
            break;
          case 'activate':
            await handleEnvActivateCommand(argv);
            break;
          default:
            console.log('Invalide input for "env" command.');
            break;
        }
      }
    )
    .parseAsync();
}

export async function showCLIPrompt(question: string): Promise<string> {
  const line = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    line.question(question, response => {
      line.close();
      resolve(response);
    });
  });
}

export async function handleEnvInstallCommand(argv: any) {
  const installPath = (argv.path as string) || getBundledPythonEnvPath();
  console.log(`Installing Python environment to "${installPath}"`);

  await installBundledEnvironment(installPath, {
    onInstallStatus: (status, message) => {
      switch (status) {
        case EnvironmentInstallStatus.RemovingExistingInstallation:
          console.log('Removing the existing installation...');
          break;
        case EnvironmentInstallStatus.Started:
          console.log('Installing now...');
          break;
        case EnvironmentInstallStatus.Cancelled:
          console.log('Installation cancelled.');
          break;
        case EnvironmentInstallStatus.Failure:
          console.error(`Failed to install.`, message);
          break;
        case EnvironmentInstallStatus.Success:
          if (argv.path) {
            const pythonPath =
              process.platform === 'win32'
                ? path.join(installPath, 'python.exe')
                : path.join(installPath, 'bin', 'python');
            appData.userSetPythonEnvs.push({
              path: pythonPath,
              name: 'installed-env',
              type: IEnvironmentType.Path,
              versions: {},
              defaultKernel: 'python3'
            });
            appData.save();
          }
          console.log('Installation succeeded.');
          break;
      }
    },
    confirmOverwrite: () => {
      return new Promise<boolean>(resolve => {
        showCLIPrompt(
          'Install path is not empty. Would you like to overwrite it? [Y/n] '
        ).then(answer => {
          resolve(answer === 'Y');
        });
      });
    }
  }).catch(reason => {
    //
  });
}

export async function handleEnvActivateCommand(argv: any) {
  const envPath = (argv.path as string) || getBundledPythonEnvPath();
  console.log(`Activating Python environment "${envPath}"`);

  await activateEnvironment(envPath);
}

export async function activateEnvironment(envPath: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const platform = process.platform;
    const isWin = platform === 'win32';
    envPath = envPath || getBundledPythonEnvPath();

    const activateCommand = isWin
      ? `${envPath}\\Scripts\\activate.bat`
      : `source "${envPath}/bin/activate"`;

    const shell = isWin
      ? spawn('cmd.exe', ['-cmd', '/K', activateCommand], {
          stdio: 'inherit',
          env: process.env
        })
      : spawn('bash', ['-c', `${activateCommand};exec bash`], {
          stdio: 'inherit',
          env: {
            ...process.env,
            BASH_SILENCE_DEPRECATION_WARNING: '1'
          }
        });

    shell.on('close', code => {
      if (code !== 0) {
        console.log('[shell] exit with code:', code);
      }
      resolve(true);
    });
  });
}
