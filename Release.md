# Releasing

1. run `npm version minor/major/patch` to update the version in package.json
1. Draft a new release on Github Releases. 
2. Set the "Tag version" to the value of version in your application package.json, and prefix it with v. (For example, if your application package.json version is 1.0, your draft's "Tag version" would be v1.0.)
3. Push some commits. Every Travis-CI build will update the artifacts attached to this draft.
4. Once you are done, publish the release. GitHub will tag the latest commit for you.

Alternatively, if a tag is pushed manually to the repo, the CI will build the artifacts and create a draft release.

# Dependencies

To build for Linux and Windows the suggested way is to use the `dockerdist:linux` and `dockerdist:windows` command that use a well-tested and fully equipped docker environment to build for both.
To build the dmg container for macOS, a macOS machine is required. It's suggested to use Travis-CI in this regard.
