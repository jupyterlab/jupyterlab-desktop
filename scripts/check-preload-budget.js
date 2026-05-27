// Fails if any bundled preload script exceeds its size budget, or if the set of
// preload bundles drifts from the budget map. Runs after `yarn build` /
// `yarn bundle:preload`. Zero dependencies on purpose: a regression net for the
// Phase 3 preload rewrite, not a full bundle analyzer.

const fs = require('fs');
const path = require('path');

// Per-file ceilings in bytes, set ~20% over the current built sizes. When a
// preload grows past its ceiling (or a bundle is added/removed), update this
// map deliberately so the change is visible in review.
const BUDGETS = {
  aboutdialog: 11600,
  authdialog: 11650,
  dialog: 11450,
  labview: 11500,
  progressview: 12600,
  pythonenvdialog: 17250,
  pythonenvselectpopup: 14550,
  remoteserverselectdialog: 12650,
  settingsdialog: 14750,
  titlebarview: 13900,
  updatedialog: 12000,
  welcomeview: 15100
};

const mainDir = path.join(__dirname, '..', 'build', 'out', 'main');

function findPreloadBundles() {
  if (!fs.existsSync(mainDir)) {
    console.error(
      `Build output not found at ${mainDir}. Run "yarn build" first.`
    );
    process.exit(1);
  }
  const found = {};
  for (const entry of fs.readdirSync(mainDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const bundle = path.join(mainDir, entry.name, 'preload.js');
    if (fs.existsSync(bundle)) {
      found[entry.name] = fs.statSync(bundle).size;
    }
  }
  return found;
}

const found = findPreloadBundles();
const budgeted = new Set(Object.keys(BUDGETS));
const present = new Set(Object.keys(found));
const errors = [];

for (const name of budgeted) {
  if (!present.has(name)) {
    errors.push(`Missing expected preload bundle: ${name}/preload.js`);
  }
}
for (const name of present) {
  if (!budgeted.has(name)) {
    errors.push(
      `Unbudgeted preload bundle ${name}/preload.js (${found[name]} B). Add it to BUDGETS in scripts/check-preload-budget.js.`
    );
  }
}
for (const name of present) {
  if (budgeted.has(name) && found[name] > BUDGETS[name]) {
    errors.push(
      `${name}/preload.js is ${found[name]} B, over its ${BUDGETS[name]} B budget.`
    );
  }
}

const sorted = Object.keys(found).sort();
for (const name of sorted) {
  const budget = BUDGETS[name];
  const status = budget && found[name] <= budget ? 'ok' : 'OVER';
  console.log(
    `${status.padEnd(4)} ${name}/preload.js  ${found[name]} B${
      budget ? ` / ${budget} B` : ''
    }`
  );
}

if (errors.length > 0) {
  console.error('\nPreload bundle budget check failed:');
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  process.exit(1);
}

console.log('\nAll preload bundles are within budget.');
