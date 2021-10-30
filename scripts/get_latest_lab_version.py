from urllib.request import urlopen
import json


REPOSITORY = "jupyterlab"
ORGANIZATION = "jupyterlab"


def find_latest_stable(owner, repository):
    """Find latest stable release on GitHub for given repository."""
    endpoint = f"https://api.github.com/repos/{owner}/{repository}/releases"
    releases = json.loads(urlopen(endpoint).read())
    for release in releases:
        # skip drafts and pre-releases
        if release['prerelease'] or release['draft']:
            continue
        name = release['tag_name']
        if not name.startswith('v'):
            raise ValueError('Unexpected release tag name format: does not start with v')
        return name[1:]

if __name__ == '__main__':   
    print(find_latest_stable(owner=ORGANIZATION, repository=REPOSITORY))
