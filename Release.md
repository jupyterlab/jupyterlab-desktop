# Releasing through Travis-CI

1. run `npm version minor/major/patch` to update the version in package.json and create a tag
2. push the newly created commit and tag 
3. Travis-CI will build for macOS , Linux, and Windows and release them in a Github release Draft, that will need to be hand-polished and published.



# Dependencies

To build for Linux and Windows the suggested way is to use the `dockerdist:linux` and `dockerdist:windows` command that use a well-tested and fully equipped docker environment to build for both.
To build the dmg container for macOS, a macOS machine is required. It's suggested to use Travis-CI in this regard.
