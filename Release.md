# Releasing through Travis-CI

### Workflow 1

1. Draft a new release on Github. Set the "Tag version" to the value of version in your application package.json, and prefix it with v. "Release title" can be anything you want.
For example, if your application package.json version is 1.0, your draft's "Tag version" would be v1.0.
2. Push some commits. Every CI build will update the artifacts attached to this draft.
3. Once you are done, publish the release. GitHub will tag the latest commit for you.

The benefit of this workflow is that it allows you to always have the latest artifacts, and the release can be published once it is ready.

### Workflow 2

1. run `npm version major/minor/patch` to tag and generate a commit
2. push the commit and the tag
3. The CI will draft a release with the correct "Tag version" from your package.json file


# Dependencies

To build for Linux and Windows the suggested way is to use the `dockerdist:linux` and `dockerdist:windows` command that use a well-tested and fully equipped docker environment to build for both.
To build the dmg container for macOS, a macOS machine is required. It's suggested to use Travis-CI in this regard.
This [documentation](https://github.com/electron-userland/electron-builder/wiki/Multi-Platform-Build) explains the needed dependencies to build locally.
