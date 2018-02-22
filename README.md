# Jupyterlab App

[![Build Status](https://travis-ci.org/jupyterlab/jupyterlab_app.svg?branch=master)](https://travis-ci.org/jupyterlab/jupyterlab_app)


A native app for [JupyterLab](https://github.com/jupyterlab/jupyterlab), based on [Electron](https://electron.atom.io/).

### Build dependencies

#### Linux

You will need the development packages of libcairo, libjpeg, and libgif.  In Debian-based distributions, these are provided by the `libcairo2-dev`, `libjpeg8-dev`, and `libgif-dev` packages.

### Getting started

1. run `git clone git@github.com:jupyterlab/jupyterlab_app.git`
2. run `yarn install` or `npm install`
3. run `yarn build:all` or `npm run build:all`

### Building for distribution

To test building for distribution you can install [Docker](https://docs.docker.com/engine/installation/) and run `yarn dockerdist:platform` where "platform" is either "linux" or "win". To build for macOS a macOS computer is required.

If you don't want to user Docker but instead want to build locally, there are a few [dependencies](https://github.com/electron-userland/electron-builder/wiki/Multi-Platform-Build) you're required to install.

Regarding releasing please check out [release](release.md)
