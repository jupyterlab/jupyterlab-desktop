# Jupyterlab App

[![Build Status](https://travis-ci.org/jupyterlab/jupyterlab_app.svg?branch=master)](https://travis-ci.org/jupyterlab/jupyterlab_app)


A desktop application for [JupyterLab](https://github.com/jupyterlab/jupyterlab), based on [Electron](https://www.electronjs.org/).

## Build dependencies

JupyterLab App uses [(conda) Constructor](https://github.com/conda/constructor) to bundle JupyterLab backend into the stand-alone application. You can install Constructor using:

`conda install constructor`

### Linux

You will need the development packages of libcairo, libjpeg, and libgif.  In Debian-based distributions, these are provided by the `libcairo2-dev`, `libjpeg8-dev`, and `libgif-dev` packages.

## Getting started

1. run `git clone git@github.com:jupyterlab/jupyterlab_app.git`
2. run `yarn install` or `npm install`
3. run `yarn build:all` or `npm run build:all`

## Building for distribution

### macOS

1. Build the application

    `yarn clean && yarn build`

2. Create conda environment installer for backend bundle

    `yarn create_env_installer`

3. Create macOS installer. Installer will be created in `dist/JupyterLab.pkg`

    `yarn dist`

Regarding releasing please check out [release](Release.md)
