# Release Instructions

## Dependencies

JupyterLab Desktop uses [tbump](https://github.com/dmerejkowsky/tbump) to bump JupyterLab and the application versions. You can install using:
```bash
pip install tbump
```

## Versioning

JupyterLab Desktop needs to be versioned with the same major, minor and patch versions as the JupyterLab it bundles. For example, if JupyterLab Desktop is based on JupyterLab 3.1.12, a valid JupyterLab Desktop version is 3.1.12-1 to 3.1.12-n. Last number after `-` is used as the `build number`. This version matching is enforced before JupyterLab Desktop installer binaries are published.

JupyterLab version, that JupyterLab Desktop bundles, is determined by `@jupyterlab/metapackage` dependency version in the [yarn.lock](yarn.lock).

If the JupyterLab version is not changing with the new JupyterLab Desktop release then only increment the build number after `-` (for example `3.1.12-2` to `3.1.12-3`). However, if JupyterLab version is changing with the new JupyterLab Desktop release then reset the build number after `-` to 1 (for example `3.1.12-3` to `3.1.13-1`).


## Updating the bundled JupyterLab

In order to change the JupyterLab version bundled with the application:

1. Update all `@jupyterlab` package dependencies in [package.json](package.json) using
    ```bash
    yarn set_jupyterlab_version <new-jlab-version>
    ```
    `<new-jlab-version>` must match a released JupyterLab version such as `3.1.13`. This command will update dependencies with `@jupyterlab` scope.

2. Bump the application version using `tbump` to `new-jlab-version-1`
    ```bash
    tbump --only-patch <new-jlab-version>-1
    ```

3. Update `@jupyter-widgets/jupyterlab-manager` version in [package.json](package.json) for ipywidgets if a compatible newer version is available.

4. Update `ipywidgets` python package version in [`env_installer/construct.yaml`](env_installer/construct.yaml) if there is a compatible newer version available.

Note that after updating the bundled JupyterLab version, it is necessary to bump JupyterLab Desktop version using `tbump` as described in the section below. Run `check_version_match` script before committing the changes to ensure version integrity.

```bash
yarn check_version_match
```

## Relase Workflow

1. Create a new release on GitHub as `pre-release`. Set the release `tag` to the value of target application version and prefix it with `v` (for example `v3.1.12-1` for JupyterLab Desktop version `3.1.12-1`). Enter release title and release notes. Release needs to stay as `pre-release` for GitHub Actions to be able to attach installers to the release.

2. Bump application version using `tbump`. If same JupyterLab version is being bundled then only increment the build number after `-`. If JupyterLab version is incremented then reset the build number to 1.

    Example: same JupyterLab version (`3.1.12`), bump from `3.1.12-2` to `3.1.12-3`
    ```bash
    tbump --only-patch 3.1.12-3
    ```

    Example: changing JupyterLab version (to `3.1.13`), bump from `3.1.12-3` to `3.1.13-1`
    ```bash
    tbump --only-patch 3.1.13-1
    ```

    tbump will list changes to be applied, confirm the changes to proceed with apply.

3. Make sure that application is building, installing and running properly by following the [distribution build instructions](README.md##building-for-distribution) locally

4. Create a branch preferably with the name `release-v<new-version>`. Add a commit with the version changes and create a PR. The PR must be created from main repo and not from a fork. This is necessary for GitHub Actions to be able to attach installers to the release.

5. GitHub Actions will automatically create installers for each platform (Linux, macOS, Windows) and upload them as release assets. Assets will be uploaded only if a release of type `pre-release` with tag matching the JupyterLab Desktop's version with a `v` prefix is found. For example, if the JupyterLab Desktop version in the PR is `3.1.12-2`, the installers will be uploaded to a release that is flagged as `pre-release` and has a tag `v3.1.12-2`. New commits to PR will overwrite the installer assets of the release.

6. Once all the changes are complete, and installers are uploaded to the release then publish the release.
