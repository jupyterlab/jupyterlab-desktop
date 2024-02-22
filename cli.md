# JupyterLab Desktop CLI

JupyterLab Desktop comes with a CLI (`jlab`) that provides a rich set of commands and options to launch and configure the application. Below are the CLI options with examples.

## Setting up the `jlab` CLI command

JupyterLab Desktop installers for Windows and Linux create `jlab` CLI command as part of the installation process. However, macOS application creates this command at first launch and after updates. This command creation might sometimes fail if the user doesn't have the required permissions. See this [troubleshooting section](troubleshoot.md#macOS-write-permission-issues) to properly setup CLI on macOS.

## Jupyterlab Desktop CLI commands

- [`jlab` _Application launch_](#jlab-options)
- [`jlab env` _Python environment management_](#jlab-env-options)
- [`jlab config` _Application and project setting management_](#jlab-config-options)
- [`jlab appdata` _Access application cache data_](#jlab-appdata-options)
- [`jlab logs` _Access application logs_](#jlab-logs-options)

### `jlab <options>`

- Open directories using relative or absolute path
  - `jlab .` launch in current directory
  - `jlab ../notebooks` launch with relative path
  - `jlab /Users/username/notebooks` launch with absolute path
- Open notebooks and other files using relative or absolute path
  - `jlab /Users/username/notebooks/test.ipynb` launch notebook with absolute path
  - `jlab ../notebooks/test.ipynb` launch notebook with relative path
  - `jlab ../test.py` launch python file with relative path
- Open with a custom Python environment
  - `jlab --python-path /Users/username/custom_env/bin/python ../notebooks/test.ipynb` launch notebook with custom Python environment
- Connect to existing JupyterLab server
  - `jlab https://example.org/lab?token=abcde`

### `jlab env <options>`

See Python environment management [documentation](python-env-management.md#python-environment-management-using-cli) for `jlab env` CLI options.

### `jlab config <options>`

- #### `jlab config list [--project-path]`

  Show application settings together with any project level overrides. If `--project-path` is set then setting overrides for the project in the specified directory are listed otherwise overrides for the current working directory are listed.

  Examples:

  ```bash
  # list global application settings and project overrides in current working directory
  jlab config list
  # list global application settings and project overrides in /opt/test-project
  jlab config list --project-path=/opt/test-project
  ```

- #### `jlab config set <setting-key> <setting-value> [--project] [--project-path]`

  Set global application setting or project setting. If called without `--project` and `--project-path` sets global application setting. Calling with `--project` sets the project override for the current working directory. Calling with `--project-path` sets the project override for the specified directory.

  Examples:

  ```bash
  # set checkForUpdatesAutomatically to false
  jlab config set checkForUpdatesAutomatically false
  # set theme to "dark"
  jlab config set theme "dark"
  # set the global default Python path for JupyterLab server
  jlab config set pythonPath /Users/username/custom_env/bin/python
  # set the default Python path for JupyterLab server for project at current working directory
  jlab config set pythonPath /Users/username/custom_env/bin/python --project
  # set the default Python path for JupyterLab server for particular project
  jlab config set pythonPath /Users/username/custom_env/bin/python --project-path=/opt/test-project
  # set conda channels to ["conda-forge", "bioconda"] on Windows
  jlab config set condaChannels [\"conda-forge\",\"bioconda\"]
  # set conda channels to ["conda-forge", "bioconda"] on macOS and Linux
  config set condaChannels '["conda-forge","bioconda"]'
  ```

- #### `jlab config unset <setting-key> [--project] [--project-path]`

  Unset/reset global application setting or project setting. If called without `--project` and `--project-path` unsets global application setting. Calling with `--project` unsets the project override for the current working directory. Calling with `--project-path` unsets the project override for the specified directory. Once a project setting is unset it defaults to global setting. Once a global setting is unset its default value is used.

  Examples:

  ```bash
  # unset checkForUpdatesAutomatically
  jlab config unset checkForUpdatesAutomatically
  # unset the global default Python path for JupyterLab server
  jlab config unset pythonPath
  # unset the default Python path for JupyterLab server for project at current working directory
  jlab config unset pythonPath --project
  # unset the default Python path for JupyterLab server for particular project
  jlab config unset pythonPath --project-path=/opt/test-project
  ```

- #### `jlab config open-file [--project] [--project-path]`

  Open the settings JSON file for the global settings or project settings using the default File editor on system. If called without `--project` and `--project-path` opens global application settings file. Calling with `--project` opens the settings file for the the project at current working directory. Calling with `--project-path` opens the settings file for the project at specified directory.

  Examples:

  ```bash
  # open global settings file
  jlab config open-file
  # open settings file for project at current working directory
  jlab config open-file --project
  # open settings file for particular project
  jlab config open-file --project-path=/opt/test-project
  ```

### `jlab appdata <options>`

- #### `jlab appdata list`

  Show application data. This is the data cached by the app and reused at restart. Some of the data is not listed for simplicity but can be accessed using the `open-file` option.

  Examples:

  ```bash
  # list application data
  jlab appdata list
  ```

- #### `jlab appdata open-file`

  Open the application data JSON file using the default File editor on system.

  Examples:

  ```bash
  # open the application data file
  jlab appdata open-file
  ```

### `jlab logs <options>`

- #### `jlab logs show`

  Show application logs in system Terminal.

  Examples:

  ```bash
  # show application data
  jlab logs show
  ```

- #### `jlab logs open-file`

  Open the application log file using the default File editor on system.

  Examples:

  ```bash
  # open the application log file
  jlab logs open-file
  ```

For additional CLI options run `jlab --help` in command line.
