#!/bin/bash

JUPYTER_LAB_COMMIT=231e2014773ff5d8e53a173c9c81a7cd233882b8
WORKING_DIR=$(pwd)
MODULES_DIR="${WORKING_DIR}/node_modules"
CLONE_DIR="${WORKING_DIR}/jupyterlab"
TARGET_DIR="${MODULES_DIR}/@jupyterlab"

function copy_packages() {
    cd $CLONE_DIR
    rm -fr $TARGET_DIR
    mkdir ${TARGET_DIR}
    cp -r packages/* ${TARGET_DIR}
    cp -r node_modules/* ${MODULES_DIR}
    cd $WORKING_DIR
}

echo "Installing JupyterLab From GitHub"

if [ "$(basename $WORKING_DIR)" != "jupyterlab_app" ] 
then
    echo "ERROR: Do not run install script manually!"
    echo "       Do 'npm install' to install packages"
    exit
fi

if [ -d "$CLONE_DIR" ] 
then
    cd $CLONE_DIR
    if [ "$(git rev-parse HEAD)" == "$JUPYTER_LAB_COMMIT" ]
    then 
        echo "Jupyter Lab already up to date"
        copy_packages
        exit
    fi
fi

rm -fr $CLONE_DIR
git clone https://github.com/jupyterlab/jupyterlab.git $CLONE_DIR
cd $CLONE_DIR
git checkout $JUPYTER_LAB_COMMIT
npm install
npm run build
copy_packages
