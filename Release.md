# Release Instructions

## Dependencies

JupyterLab App uses [tbump](https://github.com/dmerejkowsky/tbump) to bump JupyterLab and app versions. You can install using:
```bash
pip install tbump
```

## Versioning

JupyterLab App needs to be versioned with the same major, minor and patch versions as the JupyterLab it bundles. For example, if JupyterLab App is based on JupyterLab 3.1.12, a valid JupyterLab App version is 3.1.12-1 to 3.1.12-n. Last number after `-` is used as the `build number`. This version matching is enforced before JupyterLab App installer binaries are published.

JupyterLab version, that JupyterLab App bundles, is determined by `@jupyterlab/metapackage` dependency version in the [yarn.lock](yarn.lock).

If the JupyterLab version is not changing with the new JupyterLab App release then only increment the build number after `-` (for example `3.1.12-2` to `3.1.12-3`). However, if JupyterLab version is changing with the new JupyterLab App release then reset the build number after `-` to 1 (for example `3.1.12-3` to `3.1.13-1`).


## Updating the bundled JupyterLab

In order to change the JupyterLab version bundled with the App:

1. Update all `@jupyterlab` package dependencies in [package.json](package.json) using
    ```bash
    yarn set_jupyterlab_version <new-jlab-version>
    ```
    `<new-jlab-version>` must match a released JupyterLab version such as `3.1.13`. This command will update dependencies with `@jupyterlab` scope.

2. Update `@jupyter-widgets/jupyterlab-manager` version in [package.json](package.json) for ipywidgets if a compatible newer version is available.

3. Update `jupyterlab` and `ipywidgets` python package versions in [env_installer/construct.yaml](env_installer/construct.yaml)

Note that after updating the bundled JupyterLab version, it is necessary to bump JupyterLab App version using `tbump` as described in the section below. Run `check_version_match` script before committing the changes to ensure version integrity.

```bash
yarn check_version_match
```

## Relase Workflow

1. Create a new release on GitHub. Set the release `tag` to the value of target application version and prefix it with `v` (for example `v3.1.12-1` for JupyterLab App version `3.1.12-1`). Enter release title and release notes. Release needs to stay as `draft` or `pre-release` for GitHub Actions to be able to attach installers to the release.

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

3. Create a commit with the version changes and create a PR. The PR must be created from main repo and not from a fork. This is necessary for GitHub Actions to be able to attach installers to the release.

4. GitHub Actions will automatically create installers for each platform (Linux, macOS, Windows) and upload them as release assets. Assets will be uploaded only if a release of type `draft` or `pre-release` with tag matching the JupyterLab App's version with a `v` prefix is found. For example, if the JupyterLab App version in the PR is `3.1.12-2`, the installers will be uploaded to a release that is flagged as `draft` or `pre-release` and has a tag `v3.1.12-2`. New commits to PR will overwrite the installer assets of the release.

5. Once all the changes are complete, and installers are uploaded to the release then publish the release.
