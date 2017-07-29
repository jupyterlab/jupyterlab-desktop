# Releasing through Travis-CI

1. Commit and push all your changes, you need to have a clean git repo locally
2. Run `npm version minor/major/patch` to update the version in package.json and create a tag and an individual commit
3. Push the newly created commit and tag 
4. Travis-CI will build for macOS, Linux, and Windows and release them in a Github release Draft, that will need to be hand-polished and published.

At the present time in Travis-CI due to a [bug](https://github.com/electron-userland/electron-builder/issues/1871) in electron-builder all artifacts are built on macOS and deployed by travis as a Github release draft.


# Dependencies

To build for Linux and Windows the suggested way is to use the `dockerdist:linux` and `dockerdist:windows` command that use a well-tested and fully equipped docker environment to build for both.
To build the dmg container for macOS, a macOS machine is required. It's suggested to use Travis-CI in this regard.
This [documentation](https://github.com/electron-userland/electron-builder/wiki/Multi-Platform-Build) explains the needed dependencies to build locally.
