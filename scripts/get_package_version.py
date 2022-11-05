import json


def get_package_version(path):
    """Extract version from given `package.json` file."""
    with open(path) as f:
        package = json.load(f)
        return package['version']

if __name__ == '__main__':   
    print(get_package_version(path='package.json'))
