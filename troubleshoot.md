# Troubleshooting JupyterLab Desktop

## How the desktop application works

Understanding how JupyterLab Desktop (JLD) works will greatly help in troubleshooting issues.

JupyterLab Desktop (JLD) is a desktop application which can easily be installed with user friendly installers on different operating systems. It is bundled with a Python environment that includes jupyterlab Python package and several popular Python libraries ready to use in scientific computing and data science workflows. The bundled Python environment can be installed on a system by using few clicks on JLD UI. That way users can get started with Jupyter notebooks with few clicks and without worrying about installing Python and setting up Python environments.

JupyterLab Desktop launches JupyterLab server instances in the background for user sessions and displays JupyterLab Web UI in an embedded browser. Below is a screenshot of the JLD UI highlighting some of the components critical to understanding the application architecture.

<img src="media/desktop-app-frame.png" alt="Desktop app components" width=1024 />

JLD supports multiple session windows. Each session window has a corresponding JupyterLab server process. Users can launch multiple session windows in different directories and for each session they can use different Python environments. Python environments could have different jupyterlab versions and different set of dependency Python packages.

## JupyterLab Desktop vs jupyterlab Python package versions

When a new version of JLD is released, it comes with a bundled Python environment installer. The jupyterlab Python package version in that installer is the same as the desktop app version except for the suffix part. For example JLD version 3.6.3-1 bundles jupyterlab Python package version 3.6.3. JLD version 3.6.3-2 also bundles the same version of jupyterlab (3.6.3). This allows releasing new versions of JLD even if the jupyterlab version stays the same.

You can see the version of the JLD by going to Desktop app menu -> About dialog. The version of the jupyterlab Python package can be seen either by hovering over the title bar area that shows the environment info on top right, or by opening the About dialog of JupyterLab UI (Help menu -> About).

JLD is compatible with a wide range of jupyterlab Python package versions (>=3.0.0). So, any custom Python environment with jupyterlab package version >= 3.0.0 can be used in JLD.

## JupyterLab Desktop vs JupyterLab Web Application settings

JupyterLab Desktop loads JupyterLab Web Application UI in embedded browser. They have different settings except for theme setting which can be synced from JLD settings to web app settings. JLD settings are accessed from the hamburger menu on top right of a session window. Web app settings are accessed from the Settings menu shown in the embedded browser view's top section.

JLD settings are applicable to all sessions

Workspace settings (layout of UI, open tabs) are stored per project.

## Logs

JupyterLab Desktop saves logs in the following locations. Information about crashes, warnings and additional information might be available in logs. For troubleshooting purposes, it is recommended to set log level to Debug.

- On Windows: `%APPDATA%\jupyterlab-desktop\logs\main.log`
- On Linux: `$XDG_CONFIG_HOME/jupyterlab-desktop/logs/main.log` or `~/.config/jupyterlab-desktop/logs/main.log`
- On macOS `~/Library/Logs/jupyterlab-desktop/main.log`

You can change the log level from the Settings dialog. Setting log level to `Debug` will provide most detailed logs, while setting to `Error` will configure the app to log only when errors occur. Changing log level requires application restart.

<img src="media/set-log-level.png" alt="Set log level" width=350 />

## Custom Environment server launch errors

As mentioned in [how the desktop application works](#how-the-desktop-application-works) section above, JupyterLab Desktop requires jupyterlab (>=3.0.0) Python package in the Python environment selected. JupyterLab Desktop launches a new JupyterLab server instance locally using the jupyterlab Python package. A common reason for server launch errors is missing this Python package.

You can easily install jupyterlab Python package to a custom environment by using the folloing command after activating the environment in a system Terminal.

```bash
pip install jupyterlab
```

Running the following command shows if the package is available and its version if installed.

```bash
pip show jupyterlab
```

Server launch errors are usually saved in application logs. Please check the logs section abo to inspect logs for launch errors.

Another way to debug server launch errors is by trying to launch JupyterLab by using system Terminal and using the same launch parameters as the desktop app. Follow these steps below to do that.

### Launching JupyterLab Server manually

1. Go to Settings dialog in desktop app and open the `Server` tab.
2. Server tab shows `Server launch command preview` as shown below. Copy the command to clipboard.

    <img src="media/server-lauch-command-preview.png" alt="Set log level" width=800 />

3. Open a system Terminal and activate the custom Python environment you would like to debug.
4. Run the command copied from the preview after replacing `{port}` with a value like `8888` and `{token}` with a value like `abcde`.
5. Check the Terminal output for errors and/or warnings.

## Installation Path

default install paths for app and server

no space

## Settings locations and resetting

## Theme not persisting

If you are having issues with theme settings check out [Theming section in User Guide](user-guide.md#theming). You may need to turn off synching.

## Application updated but still running old JupyterLab version

## Write permission issues

jlab command issues

## Clearing cache

## Cleanup after uninstalling

## Windows uninstall issues

