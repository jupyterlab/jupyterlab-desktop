# JupyterLab Desktop Tests

This directory contains automated tests for JupyterLab Desktop using Playwright.

## Test Structure

- `welcome-screen.spec.ts` - Tests for the welcome screen and basic app launch
- `electron-dialogs.spec.ts` - Tests for capturing various Electron dialogs
- `app-states.spec.ts` - Tests for capturing different application states
- `helpers/` - Helper utilities for testing
- `snapshots/` - Generated screenshots (excluded from git)

## Running Tests

```bash
# Run all tests
yarn test

# Run tests in headed mode (with visible browser)
yarn test:headed

# Run tests in debug mode
yarn test:debug
```

## Test Configuration

Tests are configured via `playwright.config.ts` in the root directory.

## CI Integration

Tests run automatically in CI via `.github/workflows/test.yml` and generate screenshots that are uploaded as artifacts.

## Requirements

- Electron app must be built before running tests (`yarn build`)
- Tests require a virtual display in headless environments (xvfb)
- Screenshots are captured for visual regression testing