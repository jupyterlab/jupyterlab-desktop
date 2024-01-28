# Python environment management using CLI

JupyterLab Desktop CLI (`jlab`) provides several commands and options to manage Python environments for use in the application. Below is the list of environment management commands.

### `jlab env info`

Show app's Python environment configuration such as bundled Python environment installation path and default Python environment path.

### `jlab env list`

List Python environments available to the app. These are the environments discovered by the app or set by user.

### `jlab env install [path]`

Install the bundled Python environment. If the path argument is provided, then the environment is installed into the specified directory. Otherwise it is installed into the default installation path. Installed environment is automatically added to app's environments list to allow selection on the UI. If there is an existing installation, `--force` argument can be set to overwrite.

Examples:

```bash
# install to default directory
jlab env install
# install to /opt/jlab_server
jlab env install /opt/jlab_server
# install to /opt/jlab_server
jlab env install --path /opt/jlab_server
# install to /opt/jlab_server overwriting any existing installation
jlab env install /opt/jlab_server --force
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

### `jlab env activate [path]`

Activate a Python environment in system terminal. In order to activate app's default Python environment, skip the path argument. If the path argument is provided, then the environment at the specified directory is activated.

Examples:

```bash
# activate the default Python environment
jlab env activate
# activate the Python environment at /opt/jlab_server
jlab env activate /opt/jlab_server
```

Make sure to exit the terminal process when you are done with activated environment, by running `exit` command.

### `jlab env update-registry`

Update discovered and user set Python environments without launching UI. This command resolves the environment details using the paths stored in app's environment registry. This operation is automatically done at app launch but the command can be used to the same without launching the app.

### `jlab env set-base-conda-env-path <path>`

Set base conda environment path. Base conda environment is used to activate sub conda environments when launching JupyterLab server.

Examples:

```bash
# set base conda environment to /opt/base_conda
jlab env set-base-conda-env-path /opt/base_conda
```
