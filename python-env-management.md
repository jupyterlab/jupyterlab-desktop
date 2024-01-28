# Python environment management using CLI

JupyterLab Desktop CLI (`jlab`) provides several commands and options to manage Python environments for use in the application. Below is the list of environment management commands.

### `jlab env info`

Show app's Python environment configuration such as bundled Python environment installation path and default Python environment path.

### `jlab env list`

List Python environments available to the app. These are the environments discovered by the app or set by user.

### `jlab env create`

Install or update the bundled Python environment. Environment is installed into the [default installation path](troubleshoot.md#Installation-Paths). If there is an existing installation and/or you would like to update the environment set the `--force` argument to replace the existing installation.

Examples:

```bash
# install bundled environment to default directory
jlab env create
# update bundled environment installation
jlab env create --force
```

### `jlab env create [--name=<name>] [--prefix=<path>] [--source=<bundle>] [--source-type=<source-type>] [--channel=<channels>] [--env-type=<env-type>] [--add-jupyterlab-package=<value>] [package list]`

Create a new Python environment using the bundled installer. If the `--name` argument is set, then the environment is created under Python [environment install directory](troubleshoot.md#Installation-Paths). If the `--prefix` (directory path) argument is provided, then the environment is installed into the specified directory. Created environment is automatically added to app's environments list to allow selection on the UI. If there is an existing installation at the resolved location, `--force` argument can be set to overwrite.

Options:

**--name**: Environment name and directory name for installation under `<application-data-dir>/envs/` directory.

**--prefix**: Environment installation directory path. If `--name` and `--prefix` are both set `--prefix` is discarded.

**--source**: Installation source. Valid values are `bundle`, `<a-file-path>`, `<a-url>`, `""`. Default is empty string (`""`).

**--source-type**: Installation source type. Valid values are `bundle`, `conda-pack`, `conda-lock-file`, `conda-env-file`, `registry`. Default is `registry`.

**--channel**: List of custom conda channels to use when installing new conda packages. By default, conda channels from user settings is used. You can use `jlab env info` to see default conda channels.

**--env-type**: Environment type to create. Valid values are `conda`, `venv` and `auto`. Default is `auto`. If it is set to `auto`, `conda` will be used if a conda based --source-type is set or if conda executable is found in the system.

**[package list]**: List of (additional) packages to install to the environment. If source type already contains packages, this package list is installed after the source is installed.

**--add-jupyterlab-package**: Flag to automatically add `jupyterlab` Python package to package list. `jupyterlab` package is required for an environment to be compatible with JupyterLab Desktop. Default is `true`. This flag has no effect when source-type is `bundle` since bundle already contains jupyterlab package.

Examples:

```bash
# install to <application-data-dir>/envs/ml-env
jlab env create --name=ml-env --source=bundle
# install to /opt/jlab_server
jlab env create --prefix=/opt/jlab_server --source=bundle
# install to /opt/jlab_server overwriting any existing installation
jlab env create --prefix=/opt/jlab_server --source=bundle --force
```

### `jlab env create <path> [package list]`

Create a new conda or venv Python environment at the specified path. `jupyterlab` Python package is automatically installed since it is required by the desktop application. You can use `--exclude-jlab` to skip installation of `jupyterlab` package. A conda environment is created by default. If you would like to create venv environment, then add argument `--env-type venv` to the command. If there is an existing installation, `--force` argument can be set to overwrite.

Examples:

```bash
# create new conda environment at /opt/jlab_server
jlab env create /opt/jlab_server
# create new conda environment at /opt/jlab_server
jlab env create --path /opt/jlab_server
# create new venv environment
jlab env create /opt/jlab_server --env-type venv
# create new environment with jupyterlab, scikit-learn, pandas, numpy packages
jlab env create /opt/jlab_server scikit-learn pandas numpy
# create new environment with only numpy package
jlab env create /opt/jlab_server --exclude-jlab numpy
# create new conda environment at /opt/jlab_server overwriting any existing installation
jlab env create /opt/jlab_server --force
```

### `jlab env activate [--name=<name>] [--prefix=<prefix>]`

Activate a Python environment in system terminal. In order to activate app's default Python environment, skip the path argument. If the path argument is provided, then the environment at the specified directory is activated.

Examples:

```bash
# activate the default Python environment
jlab env activate
# activate the Python environment at /opt/jlab_server
jlab env activate /opt/jlab_server
# activate ml-env in <application-data-dir>/envs/ directory by name
jlab env active ml-env
# activate ml-env in <application-data-dir>/envs/ directory by name
jlab env active --name=ml-env
# activate ml-env by prefix path
jlab env active /opt/envs/ml-env
# activate ml-env by prefix path
jlab env active --prefix=/opt/envs/ml-env
```

Make sure to exit the terminal process when you are done with activated environment, by running `exit` command.

### `jlab env update-registry`

Update discovered and user set Python environments without launching UI. This command resolves the environment details using the paths stored in app's environment registry. This operation is automatically done at app launch but the command can be used to the same without launching the app.

### `jlab env set-python-envs-path <path>`

Set Python environment install directory.

Examples:

```bash
# set environment install directory to /opt/python_envs
jlab env set-python-envs-path /opt/python_envs
```

### `jlab env set-conda-path <path>`

Set base conda executable path. Base conda executable is used to when creating new conda environments, and running conda commands.

Examples:

```bash
# set conda path to /opt/base_conda/bin/conda
jlab env set-conda-path /opt/base_conda/bin/conda
```

### `jlab env set-conda-channels <channel list>`

Set conda channels (separated by space) to use when installing new conda packages.

Examples:

```bash
# set conda channels to [conda-forge, defaults]
jlab env set-conda-channels conda-forge defaults
```

### `jlab env set-system-python-path <path>`

Set Python executable path to use when creating new venv environments

Examples:

```bash
# set conda channels to /opt/python3.12/bin/python
jlab env set-system-python-path /opt/python3.12/bin/python
```

## Command argument aliases

Below are the shorthand aliases for some of the arguments

- `-n` for `--name`
- `-p` for `--prefix`
- `-c` for `--channel`
