# Release Instructions

## Versioning

JupyterLab Desktop needs to be versioned with the same major, minor and patch versions as the JupyterLab it bundles. For example, if JupyterLab Desktop is based on JupyterLab 3.1.12, a valid JupyterLab Desktop version is 3.1.12-1 to 3.1.12-n. Last number after `-` is used as the `build number`. This version matching is enforced before JupyterLab Desktop installer binaries are published.

JupyterLab version, that JupyterLab Desktop bundles, is determined by `@jupyterlab/metapackage` dependency version in the [yarn.lock](yarn.lock).

If the JupyterLab version is not changing with the new JupyterLab Desktop release then only increment the build number after `-` (for example `3.1.12-2` to `3.1.12-3`). However, if JupyterLab version is changing with the new JupyterLab Desktop release then reset the build number after `-` to 1 (for example `3.1.12-3` to `3.1.13-1`).

Run the `check_version_match` script before committing version changes to ensure version integrity:

```bash
yarn check_version_match
```

## Updating the bundled JupyterLab

Updating to a new JupyterLab release is automated by the [`Check for new JupyterLab releases`](.github/workflows/sync_lab_release.yml) workflow. It runs daily (and can be dispatched manually from the Actions tab), and when a new JupyterLab release is found it:

1. Bumps the application version to `<new-jlab-version>-1` using [tbump](https://github.com/your-tools/tbump)
2. Updates the conda lock files (`yarn update_conda_lock`)
3. Updates the macOS binary sign lists for `osx-64` and `osx-arm64`
4. Opens a PR titled `Update to JupyterLab v<new-jlab-version>`

When reviewing the PR:

- Review the lock file changes carefully.
- Update `ipywidgets` python package version in [`env_installer/jlab_server.yaml`](env_installer/jlab_server.yaml) if there is a compatible newer version available. This is not automated.

### Manual fallback

If the workflow fails or a manual update is needed, the same steps can be run locally (requires `pip install tbump`):

```bash
tbump --only-patch <new-jlab-version>-1
yarn update_conda_lock
yarn create_env_installer:osx-64 && yarn update_binary_sign_list --platform osx-64
yarn create_env_installer:osx-arm64 && yarn update_binary_sign_list --platform osx-arm64
```

## Release Workflow

Releases are driven by manually dispatched GitHub Actions workflows. They must be run from the main repo (they rely on repo secrets), on the `master` branch. The release version is always read from [package.json](package.json).

1. If the version in `package.json` has already been released, bump the version first. A new JupyterLab version is normally bumped by the sync workflow PR described above; to re-release the same JupyterLab version, increment the build number locally with tbump and merge that change (for example, bump from `3.1.12-2` to `3.1.12-3`):

   ```bash
   tbump --only-patch 3.1.12-3
   ```

   If the version in `package.json` has not been released yet, there is nothing to bump.

2. Dispatch the [`Create Pre-release`](.github/workflows/prerelease.yml) workflow. It creates a GitHub release of type `pre-release` with tag `v<version>` (for example `v3.1.12-3`), unless a release with that tag already exists. Edit the release description to add the release notes; they can be refined at any time before publishing. The release needs to stay as `pre-release` for GitHub Actions to be able to attach installers to it.

3. Dispatch the [`Create Release PR`](.github/workflows/releasepr.yml) workflow. It verifies that the pre-release exists, then creates a `release-v<version>` branch with a placeholder commit and opens a `Release v<version>` PR.

4. The [`Publish`](.github/workflows/publish.yml) workflow runs on the PR (and on any push to `master`). When it finds a draft or pre-release with a tag matching the version in `package.json`, it builds signed installers for each platform (Linux, macOS, Windows) and uploads them as assets to that release. New runs overwrite the existing installer assets.

5. Make sure that application is building, installing and running properly by following the [distribution build instructions](dev.md#building-for-distribution) locally, or by testing the installers attached to the pre-release.

6. Once all the changes are complete, installers are uploaded and the release notes are ready, merge the release PR and publish the release.

7. After publishing, dispatch the [`Publish to WinGet`](.github/workflows/winget.yml) workflow with the release tag (for example `v3.1.12-3`) as the version input to submit the Windows installer to the WinGet package registry.
