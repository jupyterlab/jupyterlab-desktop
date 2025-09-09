#!/bin/bash

# Uninstall script for JupyterLab Desktop
# This script removes the application and all associated files
# Commands will continue to run even if individual commands fail

echo "Starting JupyterLab Desktop uninstall process..."

# Remove command symlink
echo "Removing command symlink..."
rm /usr/local/bin/jlab || true

# Remove the application
echo "Removing application..."
rm -rf /Applications/JupyterLab.app || true

# Remove application cache and bundled Python environment
echo "Removing application cache and bundled Python environment..."
rm -rf ~/Library/jupyterlab-desktop || true

# Remove user data
echo "Removing user data..."
rm -rf ~/Library/Application\ Support/jupyterlab-desktop || true

# Remove logs
echo "Removing logs..."
rm -rf ~/Library/Logs/jupyterlab-desktop || true

echo "Uninstall process completed."
