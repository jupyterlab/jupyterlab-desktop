#!/usr/bin/env bash

# calculate application path from this script's path
JLAB_PATH=$(python3 -c "import sys; from os import path; self_path=path.realpath(sys.argv[1]); print(path.normpath(path.join(self_path, '../../../MacOS/JupyterLab')));" "${BASH_SOURCE[0]}");
$JLAB_PATH "$@"
exit $?
