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

for requirement in requirements:
  try:
    module = importlib.import_module(requirement)
    versions[requirement] = module.__version__
  except:
    versions[requirement] = 'NOT-FOUND'

if (getattr(sys, "base_prefix", None) or getattr(sys, "real_prefix", None) or sys.prefix) != sys.prefix:
  env_type = 'venv'

if env_type != 'venv' and os.path.exists(os.path.join(sys.prefix, "conda-meta")):
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
