# Developer Documentation

## Build dependencies

- [conda](https://docs.conda.io)

  You can install `conda` as part of a [Miniforge](https://github.com/conda-forge/miniforge) installer.

- [conda pack](https://github.com/conda/conda-pack) and [conda lock](https://github.com/conda/conda-lock) to bundle JupyterLab Desktop Server into the standalone application and to create lock files. You can install them using:

  ```bash
  conda install -c conda-forge conda-pack conda-lock
  ```

- nodejs

  You can install from https://nodejs.org/en/download/ or run:

  ```bash
  conda install -c conda-forge nodejs
  ```

- yarn

  Install using

  ```bash
  npm install --global yarn
  ```

## Local development

JupyterLab Desktop bundles JupyterLab front-end and a conda environment as JupyterLab Desktop Server as its backend into an Electron application.

`<platform>`: osx-64, osx-arm64, linux or win

- Get the project source code

  ```bash
  git clone https://github.com/jupyterlab/jupyterlab-desktop.git
  ```

- Install dependencies

  ```bash
  yarn 
  ```

- Create the JupyterLab Desktop Server installer (one-time setup)

  ```bash
  yarn create_env_installer:<platform>
  ```

  Installer will be created in `env_installer/jlab_server.tar.gz` and will be available for use in `env_installer/jlab_server`.

### Development with Auto-Reload

For active development with automatic recompilation and app restart:

```bash
yarn dev
```

This command will:
- Watch TypeScript files (`src/**/*.ts`) and automatically recompile them
- Watch assets and rebuild them when changed
- Watch the compiled `build/` directory and restart Electron when files change
- Provide a fast development cycle where changes appear immediately

### Manual Development (Alternative)

If you prefer manual control:

- Build JupyterLab Desktop

  ```bash
  yarn build
  ```

- Launch JupyterLab Desktop

  ```bash
  yarn start
  ```

  If JupyterLab Desktop does not find a compatible Python environment configured, it will prompt for installation using JupyterLab Desktop Server installer or let you choose a custom environment on your computer at first launch.

## Building for distribution

To build for dev distribution on macos arm64, run the following command:

```bash
./dev/build-installer.sh
```

Otherwise, run the following commands locally:

- Build the application

  ```bash
  yarn run clean && yarn build
  ```

- Create JupyterLab Desktop Server installer

  ```bash
  yarn create_env_installer:<platform>
  ```

- Create JupyterLab Desktop installer which will also bundle JupyterLab Desktop Server installer. For development, you can bypass signing the application installer by adding `-dev` to the platform name. For example, `yarn dist:osx-dev` will create a development installer for macOS.

  ```bash
  yarn dist:<platform>
  ```

  Application Installer will be created in `dist/JupyterLab.dmg` (macOS), `dist/JupyterLab.deb` (Debian, Ubuntu), `dist/JupyterLab.rpm` (Red Hat, Fedora) and `dist/JupyterLab-Setup.exe` (Windows) based on the platform

## Release Instructions

For instructions on updating bundled JupyterLab packages and cutting a new release, please follow [Release.md](Release.md) document.


# Uninstalling JupyterLab Desktop

To uninstall JupyterLab Desktop, run the following command:

## MacOS

```bash
./dev/uninstall.sh
```
