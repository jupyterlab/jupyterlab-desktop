# Troubleshooting JupyterLab Desktop

## How JupyterLab Desktop works

Understanding how JupyterLab Desktop (JLD) works will greatly help in troubleshooting issues.

## JupyterLab Desktop vs JupyterLab Web Application

The standard distribution of JupyterLab (Web Application) is via Python package `jupyterlab` and it can be installed using `pip install` and `conda install` commands. Once you install it, you can launch JupyterLab using `jupyter lab` CLI command. When this command is run, JupyterLab server is launched on the computer and the Web Application UI can be accessed from the browser. This setup process requires you to install Python and other scientific computing dependencies manually using Terminal commands. If you are working with multiple Python environments, the process gets more complex for setting up and launching JupyterLab. Opening notebook files on your PC, working with multiple projects in different directories with different Python environments are other pain points when using JupyterLab Web Application directly from CLI.

JupyterLab Desktop makes installing and launching JupyterLab much easier and provides other user friendly features. It comes with one click installers for different operating systems. It still uses the JupyterLab Web Application behind the scenes but it hides the complexity of installation, launch and upgrades. It enables working with different projects in different directories with their own Python environment configuration and UI layout. It keeps a history of previous sessions for easy restore. It also shows a news feed with latest blog posts from Jupyter Blog to keep the users up to date with the Jupyter ecosystem projects. All of these features and more are provided with user friendly GUI with simple clicks.

JupyterLab Desktop (JLD) is a desktop application which can easily be installed with user friendly installers on different operating systems. It is bundled with a Python environment that includes jupyterlab Python package and several popular Python libraries ready to use in scientific computing and data science workflows. The bundled Python environment can be installed on a system by using few clicks on JLD UI. That way users can get started with Jupyter notebooks with few clicks and without worrying about installing Python and setting up Python environments.

When JLD is first launched a Welcome page is presented. This page provides access to desktop app specific features.

<img src="media/welcome-page.png" alt="Desktop app components" width=900 />

JupyterLab Desktop launches JupyterLab server instances in the background for user sessions and displays JupyterLab Web Application UI in an embedded browser. Below is a screenshot of the JLD UI highlighting some of the components critical to understanding the application architecture.

<img src="media/desktop-app-frame.png" alt="Desktop app components" width=1024 />

JLD supports multiple session windows. Each session window has a corresponding JupyterLab server process. Users can launch multiple session windows in different directories and for each session they can use different Python environments. Python environments could have different jupyterlab versions and different set of dependency Python packages.

## JupyterLab Desktop vs jupyterlab Python package versions

When a new version of JLD is released, it comes with a bundled Python environment installer. The jupyterlab Python package version in that installer is the same as the desktop app version except for the suffix part. For example JLD version 3.6.3-1 bundles jupyterlab Python package version 3.6.3. JLD version 3.6.3-2 also bundles the same version of jupyterlab (3.6.3). This allows releasing new versions of JLD even if the jupyterlab version stays the same.

You can see the version of the JLD by going to Desktop app menu -> About dialog.

<img src="media/about-desktop.png" alt="Desktop application version" width=450 />

The version of the jupyterlab Python package can be seen either by hovering over the title bar area that shows the environment info on top right, or by opening the About dialog of JupyterLab UI (Help menu -> About).

<img src="media/about-web-app.png" alt="Web application version" width=350 />

JLD is compatible with a wide range of jupyterlab Python package versions (>=3.0.0). So, any custom Python environment with jupyterlab package version >= 3.0.0 can be used in JLD.

## JupyterLab Desktop vs JupyterLab Web Application settings

JupyterLab Desktop loads JupyterLab Web Application UI in embedded browser. They have different settings except for theme setting which can be synced from JLD settings to web app settings. JLD settings are accessed from the hamburger menu on top right of a session window. Web app settings are accessed from the Settings menu shown in the embedded browser view's top section.

JLD settings are applicable to all sessions

Workspace settings (layout of UI, open tabs) are stored per project.

## Getting Python environment information for a session

If you would like to access the details of the Python environment used by a session, you can hover on the Server information label shown on the title bar. You will see the session information summary as shown below which includes JupyterLab server information, working directory root, Python environment type & Python executable path, Python and JupyterLab Python package versions. In order to list all of the Python packages in the current Python environemnt, you can run `pip list` in a JupyterLab Terminal.

<img src="media/session-summary.png" alt="Session summary" width=450 />

## Logs

JupyterLab Desktop saves logs in the following locations. Information about crashes, warnings and additional information might be available in logs. For troubleshooting purposes, it is recommended to set log level to Debug.

- On Windows: `%APPDATA%\jupyterlab-desktop\logs\main.log`
- On macOS `~/Library/Logs/jupyterlab-desktop/main.log`
- On Linux: `$XDG_CONFIG_HOME/jupyterlab-desktop/logs/main.log` or `~/.config/jupyterlab-desktop/logs/main.log`

You can change the log level from the Settings dialog. Setting log level to `Debug` will provide most detailed logs, while setting to `Error` will configure the app to log only when errors occur. Changing log level requires application restart.

<img src="media/set-log-level.png" alt="Set log level" width=350 />

## Custom Environment server launch errors

As mentioned in [how the desktop application works](#how-the-desktop-application-works) section above, JupyterLab Desktop requires jupyterlab (>=3.0.0) Python package in the Python environment selected. JupyterLab Desktop launches a new JupyterLab server instance locally using the jupyterlab Python package. A common reason for server launch errors is missing this Python package.

You can easily install jupyterlab Python package to a custom environment by using the following command after activating the environment in a system Terminal. (See [instructions here](user-guide.md#How-to-create-a-Custom-Python-Environment) for creating a custom Python environment)

```bash
pip install jupyterlab
```

Running the following command shows if the package is available and its version if installed.

```bash
pip show jupyterlab
```

Server launch errors are usually saved in application logs. Please check the logs section above to inspect logs for launch errors.

Note that JupyterLab Desktop currently supports venv and conda Python environments. Other environments such as `mamba` are not tested.

Another way to debug server launch errors is by trying to launch JupyterLab by using system Terminal and using the same launch parameters as the desktop app. Follow these steps below to do that.

### Launching JupyterLab Server manually

1. Go to Settings dialog in desktop app and open the `Server` tab.
2. Server tab shows `Server launch command preview` as shown below. Copy the command to clipboard.

    <img src="media/server-lauch-command-preview.png" alt="Set log level" width=800 />

3. Open a system Terminal and activate the custom Python environment you would like to debug.
4. Run the command copied from the preview after replacing `{port}` with a value like `8888` and `{token}` with a value like `abcde`.
5. Check the Terminal output for errors and/or warnings.

## Installation Path

JLD installers use the following paths for application and bundled Python environment installation. It is recommended to use these default paths. However, if these paths resolve to absolute paths that have spaces and or special characters on your system, then you need to use a different path. Conda environments don't work properly if they are installed to paths that have spaces in them.

- On Windows: `C:\JupyterLab\`
- On macOS: `/Applications/JupyterLab.app`
- On Linux `/opt/JupyterLab`

Bundled Python environment installers are located in:
- On Windows: `C:\JupyterLab\resources\env_installer`
- On macOS: `/Applications/JupyterLab.app/Contents/Resources/env_installer`
- On Linux `/opt/JupyterLab/resources/env_installer`

Bundled Python environment is installed to
- On Windows: `%AppData%\jupyterlab-desktop\jlab_server`
- On macOS: `~/Library/jupyterlab-desktop/jlab_server`
- On Linux `~/.config/jupyterlab-desktop/jlab_server`

## Settings locations and resetting

JLD stores user settings, project settings and application data in different locations as JSON files. You can see [Configuration and data files section in UserGuide](user-guide.md#Configuration-and-data-files) for the locations in different systems. It is safe to delete these files or keys in these files to reset specific configurations.

## Theme not persisting

If you are having issues with theme settings check out [Theming section in User Guide](user-guide.md#theming). You may need to turn off synching.

## Application updated but still running old JupyterLab version

Updating JLD application doesn't automatically update the Python environment previously used by the application, for various reasons. However, bundled Python environment installer is updated if the new JLD has a version upgrade other than suffix (`-n`) change. You can compare the versions of JLD application and jupyterlab package versions in the Python environment as described in [versions section above](#JupyterLab-Desktop-vs-jupyterlab-Python-package-versions).

JLD provides an easy way to update the bundled Python environment installation. Simply go to `Hamnurger Menu` -> `Settings` -> `Server` tab. If you bundled Python environment is out-dated then you will see a notification and a button to update the installation.

<img src="media/bundled-env-update.png" alt="Set log level" width=700 />

## Write permission issues

On macOS, bundled Python environment is installed into a non user data directory (`~/Library/jupyterlab-desktop/jlab_server`) due to conda environment path limitations. Make sure that you have write permissions to `~/Library` directory. If you are having issues with bundled Python environment in macOS, check that envinronment is properly installed in there. If `~/Library/jupyterlab-desktop/jlab_server/bin/python` file exists and you can manually launch Python by using this path on a macOS Terminal, then your bundled Python environment installation was sucessful.

JLD installers for Windows and Linux create `jlab` CLI command as part of the installation process. However, macOS creates this command at first launch and after updates. This command creation might sometimes fail if the user doesn't have the right permissions. This command is created as a symlink at `/usr/local/bin/jlab`. The symlink points to `/Applications/JupyterLab.app/Contents/Resources/app/jlab` script that launches the desktop application. If you are having issues with running `jlab` command on macOS. Try these:
- Make sure you can launch JLD from desktop launcher links
- Make sure you have write access to `/usr/local/bin/` directory
- If you are still having issues make sure `/Applications/JupyterLab.app/Contents/Resources/app/jlab` is executable. You can run the command below to enable execution.
```bash
chmod 755 /Applications/JupyterLab.app/Contents/Resources/app/jlab
```

## Clearing cache

## Cleanup after uninstalling

## Windows uninstall issues

Since the bundled Python environment is installed into the same directory, installing and uninstalling multiple versions might leave dangling install metadata in registry. You can clean these records by following these steps.
1. Make sure no JupyterLab Desktop or server instance is running (rebooting Windows should terminate them if any)
2. If you want to uninstall any existing JupyterLab Desktop and/or Server installation, go to Add / Remove Programs remove all of the related installations.
3. If there are any dangling installations that cannot be removed from Add / Remove Programs then remove those dangling ones by following [the instructions here](https://support.microsoft.com/en-us/topic/removing-invalid-entries-in-the-add-remove-programs-tool-0dae27c1-0b06-2559-311b-635cd532a6d5) with care.
4. The instructions in the link above may need to be followed also for: HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall

## Double clicking .ipynb files not launching JLD

JupyterLab Desktop installers automatically associate `.ipynb` files with the application. If you are still having issues with launch by double clicking `.ipynb` files, you can fix it by right clicking the file and changing the default opener. Use the system specific `Open with...` dialog to set JupyterLab Desktop as the default application to open `.ipynb` files with.

## Debugging if an issue is specific to JLD

Some of the issues are obviously JupyterLab Desktop issues such as inability to launch the application, persistence settings etc. However, we also get issues reported or features requested in this repo for JupyterLab Web Application or other dependency Python libraries. You can check if a problem is specific to Desktop application by testing the same feature in JupyterLab Web Application. You can launch JupyterLab Web Application manually by following the instructions in [Launching JupyterLab Server manually](#Launching-JupyterLab-Server-manually) section.

Another method to launch the web application within the same Python environment is by using the Terminal in JupyterLab Desktop. Just note that this might not always work if you have a bash profile that activates a Python environment by default. Follow these steps to launch the web application from JLD.
1. Open a new Terminal by using `File` -> `New Launcher` menu and then clicking `Terminal` icon in the `Other` section.
2. Run `jupyter lab` command in terminal to launch the web application in the external browser
3. Once you are done testing, make sure to stop JupyterLab by using `Ctrl + C` keys in Terminal.
4. In order to check if you are using the same Python environment as JLD, you can run `which python` (`where.exe python` on Windows) command.

## Application doesn't launch, how to debug

go to settings and set log level to debug and try launching again. check logs
