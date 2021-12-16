#!/usr/bin/env bash

real_path() (
  cd "$(dirname "$1")"
  LINK=$(readlink "$(basename "$1")")
  while [ "$LINK" ]; do
    cd "$(dirname "$LINK")"
    LINK=$(readlink "$(basename "$1")")
  done
  REALPATH="$PWD/$(basename "$1")"
  echo "$REALPATH"
)

# calculate application path from this script's path
SELF_DIR=$(dirname "$(real_path "$0")")
APP_CONTENTS_DIR=$(dirname "$(dirname "$SELF_DIR")")
JLAB_PATH="$APP_CONTENTS_DIR"/MacOS/JupyterLab

$JLAB_PATH "$@"
exit $?
