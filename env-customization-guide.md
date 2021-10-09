# Customizing the Bundled Python Environment

JupyterLab Desktop is a self-contained standalone desktop application which bundles a Python environment. The bundled Python environment comes with several popular Python libraries to make the App ready to use in scientific computing and data science workflows. These packages are `numpy`, `scipy`, `pandas`, `ipywidgets` and `matplotlib`. In order to install additional packages into JupyterLab Desktop's Python environment, you need to follow certain steps during and after the installation as described below.

## Linux Instructions

On Linux, JupyterLab Desktop is installed into `/opt/JupyterLab` and Python environment is created in `/opt/JupyterLab/resources/jlab_server`

- Install the App by double clicking the installer file and wait for the installation to finish.
- Linux installs JupyterLab Desktop as the root user. That's why it is necessary to change the ownership to the current user to be able to customize JupyterLab Desktop's Python environment.
- Before launching JupyterLab Desktop, open a Terminal and run the following command with your `username` to change App file system ownership.
```bash
sudo chown -R username:username /opt/JupyterLab
```

## macOS Instructions

On macOS, JupyterLab Desktop should be installed into `~/Applications/JupyterLab` for current user in order to allow environment customizations. Python environment is created in `~/Applications/JupyterLab.app/Contents/Resources/jlab_server`.

- Make sure you install the App for current user in order to allow changes to App's Python environment. It is not the default location of the installer, you can set it by following these steps

| Change Install Location  | Install for me only |
| ------------- | ------------- |
| ![Choose Install Location](media/mac-install-location.png) | ![Choose Current User](media/mac-install-for-current-user.png) |


## Windows Instructions

On Windows, JupyterLab Desktop should be installed to default install location `C:\JupyterLab\`. There will be two installers running during setup. Keep the default paths for both installers. Python environment is created in `C:\JupyterLab\resources\jlab_server`.

# Installing New Python Packages

Make sure you installed JupyterLab Desktop following the steps outlined above in order to have required permissions to install new Python packages.

- Open a Notebook and run the command below in a cell for the package you want to install. You will see the log of the installation process as the cell output.
  ```bash
  %pip install <package_name>
  ```
  For example: to install scikit-learn
  ```bash
  %pip install scikit-learn
  ```
- In order to use the newly installed package you need to restart your active notebook's kernel or create a new notebook
