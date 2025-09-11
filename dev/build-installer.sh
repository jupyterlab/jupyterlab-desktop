#!/bin/bash

# Build installer script for JupyterLab Desktop
# This script cleans, builds, creates environment installer, and builds distribution

echo "Starting JupyterLab Desktop build process..."

# Clean and build
echo "Running clean and build..."
yarn run clean && yarn build || {
    echo "Error: Clean and build failed"
    exit 1
}

# Create environment installer for macOS ARM64
echo "Creating environment installer for macOS ARM64..."
yarn create_env_installer:osx-arm64 || {
    echo "Error: Environment installer creation failed"
    exit 1
}

# Build distribution for macOS ARM64 dev
echo "Building distribution for macOS ARM64 dev..."
yarn dist:osx-arm64-dev || {
    echo "Error: Distribution build failed"
    exit 1
}

echo "Build process completed successfully!"

# Open distribution folder in Finder
echo "Opening distribution folder in Finder..."
open dist/
