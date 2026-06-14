// Generates a minimal env_installer/jlab_server.tar.gz so electron-builder --dir can satisfy its
// extraResources copy in CI packaged-build e2e, where the bundled Python env is unused (e2e provides
// Python via JLAB_TEST_PYTHON_PATH). Never run for real distribution; the real tar comes from conda pack.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function createStubEnvTar(outPath) {
  const target =
    outPath ||
    path.resolve(__dirname, '..', 'env_installer', 'jlab_server.tar.gz');

  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) {
    fs.rmSync(target);
  }

  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'jlab-stub-env-'));
  try {
    fs.writeFileSync(
      path.join(staging, 'STUB_FOR_E2E'),
      'Placeholder bundled environment for CI packaged-build e2e. Not a real conda pack output.\n'
    );
    execFileSync('tar', ['-czf', target, '-C', staging, 'STUB_FOR_E2E']);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }

  return target;
}

if (require.main === module) {
  const out = createStubEnvTar();
  console.log('Wrote stub env tarball: ' + out);
}

module.exports = { createStubEnvTar };
