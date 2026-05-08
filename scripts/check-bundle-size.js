// Verify each bundled preload script stays under the size budget.
// Cross-platform: Node-only, no shell utilities.

const fs = require('fs');
const path = require('path');

const PRELOAD_DIR = path.join(__dirname, '..', 'build', 'out', 'main');
const BUDGET_BYTES = 30 * 1024; // 30 KB per preload bundle

function findPreloads(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findPreloads(full));
    } else if (entry.isFile() && entry.name === 'preload.js') {
      results.push(full);
    }
  }
  return results;
}

const preloads = findPreloads(PRELOAD_DIR);
if (preloads.length === 0) {
  console.error(
    `No preload bundles found under ${PRELOAD_DIR}. Did you run yarn build?`
  );
  process.exit(1);
}

let failed = false;
for (const file of preloads) {
  const size = fs.statSync(file).size;
  const rel = path.relative(process.cwd(), file);
  const status = size > BUDGET_BYTES ? 'FAIL' : 'OK';
  console.log(`${status}  ${size.toString().padStart(7)} bytes  ${rel}`);
  if (size > BUDGET_BYTES) failed = true;
}

if (failed) {
  console.error(
    `\nBudget exceeded. Limit: ${BUDGET_BYTES} bytes per preload bundle.`
  );
  process.exit(1);
}
