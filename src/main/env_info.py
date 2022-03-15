import os, sys, json

env_type = 'system'
env_name = 'python'

if (getattr(sys, "base_prefix", None) or getattr(sys, "real_prefix", None) or sys.prefix) != sys.prefix:
  env_type = 'venv'

if env_type != 'venv' and os.path.exists(os.path.join(sys.prefix, "conda-meta")):
  is_root = os.path.exists(os.path.join(sys.prefix, "condabin"))
  env_type = 'conda-root' if is_root else 'conda-env'

if env_type != 'system':
  env_name = os.path.basename(sys.prefix)

print(json.dumps({"type" : env_type, "name": env_name}))
