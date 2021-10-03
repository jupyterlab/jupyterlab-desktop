#!/usr/bin/env sh

# calculate App path from this script's path
JLAB_PATH=$(dirname $(realpath $0))
JLAB_PATH=$(realpath "$JLAB_PATH"/../../jupyterlab_app)
$JLAB_PATH "$@"
exit $?
