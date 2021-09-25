# JupyterLab App

A desktop application for [JupyterLab](https://github.com/jupyterlab/jupyterlab), based on [Electron](https://www.electronjs.org/).

![JupyterLab App](media/jupyterlab-app.png)

## Download
![GitHub release (latest by date)](https://img.shields.io/github/v/release/jupyterlab/jupyterlab_app)

Before installing please read the [Python Environment Customization Guide](env-customization-guide.md) if you plan to customize the Python environment to add new packages.

- [Debian, Ubuntu Linux Installer](https://github.com/jupyterlab/jupyterlab_app/releases/latest/download/JupyterLab-Setup-Debian.deb)
- [Red Hat, Fedora, SUSE Linux Installer](https://github.com/jupyterlab/jupyterlab_app/releases/latest/download/JupyterLab-Setup-Fedora.rpm)
- [macOS Installer](https://github.com/jupyterlab/jupyterlab_app/releases/latest/download/JupyterLab-Setup-macOS.pkg)
- [Windows Installer](https://github.com/jupyterlab/jupyterlab_app/releases/latest/download/JupyterLab-Setup-Windows.exe)

## Build dependencies

- [conda](https://docs.conda.io)
    
    You can install `conda` as part of a [Miniforge](https://github.com/conda-forge/miniforge) installer.
    

- [(conda) Constructor](https://github.com/conda/constructor) to bundle JupyterLab App Server into the stand-alone application. You can install Constructor using:

    ```bash
    conda install -c conda-forge constructor
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

JupyterLab App bundles JupyterLab front-end and a conda environment as JupyterLab App Server as its backend into an Electron application.

`<platform>`: mac, linux or win

- Get the project source code

    ```bash
    git clone https://github.com/jupyterlab/jupyterlab_app.git
    ```

- Install dependencies and build JupyterLab App

    ```bash
    yarn
    yarn build
    ```

- Create the JupyterLab App Server installer using

    ```bash
    yarn create_env_installer:<platform>
    ```

    Installer will be created in one of `env_installer/JupyterLabAppServer<version>-MacOSX-x86_64.sh`, `env_installer/JupyterLabAppServer-<version>-Linux-x86_64.sh`, `env_installer/JupyterLabAppServer-<version>-Windows-x86_64.exe` based on your platform

- Run the installer to install the JupyterLab App Server. Make sure to set install location to `jlab_server` directory that is at the same level as `jupyterlab_app` project source code

- Now you can launch the JupyterLab App locally using:

    ```bash
    yarn start
    ```

## Building for distribution

- Build the application

    ```bash
    yarn run clean && yarn build
    ```

- Create JupyterLab App Server installer

    ```bash
    yarn create_env_installer:<platform>
    ```

- Create JupyterLab App installer which will also bundle JupyterLab App Server installer.

    ```bash
    yarn dist:<platform>
    ```

    App Installer will be created in `dist/JupyterLab.pkg` (macOS), `dist/JupyterLab.deb` (Debian, Ubuntu), `dist/JupyterLab.rpm` (Red Hat, Fedora) and `dist/JupyterLab-Setup.exe` (Windows) based on the platform

## Release Instructions

For instructions on updating bundled JupyterLab packages and cutting a new app release, please follow [Release.md](Release.md) document.
