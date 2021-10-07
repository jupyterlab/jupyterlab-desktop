./opt/JupyterLab/resources/env_installer/JupyterLabAppServer-3.1.13-1-Linux-x86_64.sh -b -p "/opt/JupyterLab/resources/jlab_server"

ln -s "/opt/JupyterLab/resources/app/jlab" /usr/bin/jlab
chmod 755 "/opt/JupyterLab/resources/app/jlab"
