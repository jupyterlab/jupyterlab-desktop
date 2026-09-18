import os, sys, json, platform, importlib

env_type = 'system'
env_name = 'python'
python_version = platform.python_version()
default_kernel = 'python3'

requirements = [
  'jupyterlab'
]

versions = {
  "python": python_version
}

def is_pixi_pyproject(pyproject_path):
  try:
    with open(pyproject_path, encoding="utf-8") as pyproject:
      for line in pyproject:
        stripped = line.strip().replace(" ", "")
        if (
          stripped.startswith("[tool.pixi]") or
          stripped.startswith("[tool.pixi.") or
          stripped.startswith("[[tool.pixi.")
        ):
          return True
  except OSError:
    pass

  return False

def has_pixi_manifest(workspace_path):
  if os.path.isfile(os.path.join(workspace_path, "pixi.toml")):
    return True

  pyproject_path = os.path.join(workspace_path, "pyproject.toml")
  return os.path.isfile(pyproject_path) and is_pixi_pyproject(pyproject_path)

for requirement in requirements:
  try:
    module = importlib.import_module(requirement)
    versions[requirement] = module.__version__
  except:
    versions[requirement] = 'NOT-FOUND'

if (getattr(sys, "base_prefix", None) or getattr(sys, "real_prefix", None) or sys.prefix) != sys.prefix:
  env_type = 'venv'

if env_type != 'venv':
  env_path = os.path.normpath(sys.prefix)
  envs_path = os.path.dirname(env_path)
  pixi_path = os.path.dirname(envs_path)
  workspace_path = os.path.dirname(pixi_path)
  if (
    os.path.basename(env_path) and
    os.path.basename(envs_path) == "envs" and
    os.path.basename(pixi_path) == ".pixi" and
    has_pixi_manifest(workspace_path)
  ):
    env_type = 'pixi-env'

if env_type == 'system' and os.path.exists(os.path.join(sys.prefix, "conda-meta")):
  is_root = os.path.exists(os.path.join(sys.prefix, "condabin"))
  env_type = 'conda-root' if is_root else 'conda-env'

if env_type != 'system':
  env_name = os.path.basename(sys.prefix)

try:
  import jupyter_client
  mkm = jupyter_client.multikernelmanager.MultiKernelManager()
  default_kernel = mkm.default_kernel_name
except:
  pass

print(json.dumps({"type" : env_type, "name": env_name, "versions" : versions, "defaultKernel": default_kernel}))
