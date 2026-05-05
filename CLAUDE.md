# CLAUDE.md — jupyterlab-desktop fork

## Project context

Fork: `notluquis/jupyterlab-desktop` from `jupyterlab/jupyterlab-desktop`
Active branch: `revival/electron-41`
Goal: Phase 2 (unit test coverage + security hardening) before Phase 3 (Electron 41 upgrade)

### Phases

- **Phase 1** — done: CI, lint, basic infra
- **Phase 2** — done: 341 tests across 11 files, security CVE fixes, renovate bot
- **Phase 3** — pending: Electron 41 upgrade, ESM migration, preload test coverage

### Security advisories (private)

Each GHSA advisory has its own private fork named after its GHSA ID. Never mix CVE fixes across forks.

| CVE            | GHSA                | Private fork repo                        | Fix branch                          | Status               |
| -------------- | ------------------- | ---------------------------------------- | ----------------------------------- | -------------------- |
| CVE-2025-54991 | GHSA-8cvf-4977-r95v | `jupyterlab-desktop-ghsa-8cvf-4977-r95v` | `advisory-fix-cve-2025-54991-55002` | pushed, PR pending   |
| CVE-2025-55002 | GHSA-5c3f-5gj7-p9xh | `jupyterlab-desktop-ghsa-5c3f-5gj7-p9xh` | TBD                                 | fork not yet started |

- CVE-2025-54991 fix: entitlements only (no afterPack, no @electron/fuses)
- CVE-2025-55002 fix: fuses/afterPack only (no entitlements changes)
- Never publish CVE fixes in public PRs before advisory is published
- Never mention draft GHSA IDs, CVE IDs, or attack vectors in ANY public content (issues, PRs, comments) before the advisory is officially published — "N draft advisories pending" is the maximum safe phrasing
- PR #952 was a serious mistake: exposed GHSA-8cvf-4977-r95v, GHSA-vrj4-r4fw-9rfh, CVE-2025-54991, CVE-2025-55002 + attack vectors publicly before publication
- `ghsa-vrj4-r4fw-9rfh` = XSS advisory (Yaniv-git), unrelated to these CVEs — do not push fixes there

## Maintainer expectations (krassowski)

- **AI disclosure required** on every commit and PR that has AI-assisted content
  Format in commit body: `Note: AI-assisted (Claude Code). Manually verified: [what you checked]`
- **Security PRs go through private advisory fork**, not public PRs
- **fast-xml-parser usage** in `src/browser/components/welcomeview.ts` (XMLParser) must be manually verified after version upgrades — news feed parsing
- When leaving PR comments, disclose AI involvement clearly at the end: `Note: AI-assisted (Claude Code).`
- PR/issue comment tone: observations not verdicts; hedge uncertain claims ("I noticed X, not sure if it's relevant" not "X is broken"); never use em dashes, heavy bullet lists, or patterns that look AI-generated; keep it short and conversational
- When something doesn't work locally, assume personal config/env before claiming regression
- Never state that code work is "done" or "complete" without checking `git log` on the actual branch — PR #910 (Electron 37, closed) was described as "upgrade core done" in issue #951 when our branch had zero Phase 3 code
- Don't assert Electron behavior (permissions, defaults, webPreferences) without testing directly
- Let krassowski define scope and format when suggesting process changes; don't prescribe structure
- Security behavior claims (CVEs, trust model, fuse state) need manual verification disclosure — never state as confirmed without testing
- When editing a comment that already has replies, use ~~strikethrough~~ on the wrong part instead of deleting it; then reply with a quote acknowledging the correction
- **Verify exhaustively before deleting anything** — read every reference (CI, hooks, scripts, configs, watchers, lint-staged), run the suite, and document what was checked. Removal of dev tooling especially has hidden coupling (e.g. webpack runtime warning a dev expects).
- **Side-effect claims must be empirically verified on the post-change branch, not assumed from inspection.** "Removing X closes PR #Y" or "this eliminates dep Z" requires running `yarn why <dep>` (or equivalent) on the branch with the change applied. Mental walks through the dep tree miss alternate paths. Lesson learned: claimed micromatch removal in PR #959 first revision; @typescript-eslint chain still pulled it in, only confirmed after `yarn why` on the cleanup branch. Run the verification _before_ writing the PR body that mentions the side effect.
- **Correct mistakes by re-stating facts, not by narrating the correction.** When editing a PR/issue body or comment to fix a wrong claim, replace the claim with the right one directly. Do not write "I was wrong", "sorry for the noise", "corrected after re-checking", or other meta-commentary about the prior version. The diff and the current text are the source of truth; reviewers don't need the changelog of your reasoning, and self-flagellation reads as low-confidence noise. (If the original claim was already public for a long time and people acted on it, a single dated correction note is fine; otherwise, just fix it.)
- **Append, do not amend, on open PRs.** Once a branch has been pushed and a PR is open, every subsequent fix lands as a new commit on top of the branch (`git commit` + `git push`, no force). Do not `git commit --amend` and force-push to apply review feedback or fixes. Reasons: force-push hides the history of what changed in response to review (reviewers cannot see "this commit fixed the Copilot finding"), it invalidates in-flight reviews and notifications, and it requires repeated permission prompts. Squash-merge at land time flattens the history if the maintainer wants a single commit on master. The only times force-push is acceptable: branch is brand-new and has never been pushed, OR an absolute path / secret was committed and must be scrubbed (in which case disclose the force-push reason in the PR description).
- **Do not post working exploit reproducers in public PR / issue comments, even for already-published CVEs.** The CVE record is one click away on NVD/GHSA; copying a concrete payload + outputs into a comment turns the discussion thread into a recipe and gives easy lift to anyone scraping public repos for working PoCs against transitive dependents that have not yet upgraded. Verify empirically, then describe the verification at the level of "confirmed pre-patch behavior matches the advisory, post-patch does not." Offer to share the reproducer privately if review needs it. Same rule for stack traces that include sensitive paths and for screenshots that show internal URLs / tokens.
- **Don't escape backticks in heredocs.** When using `gh pr comment --body "$(cat <<'EOF' ... EOF)"`, the single-quoted heredoc already prevents shell interpretation, so `\` before backticks is wrong. Writing `\`yarn\`` produces literal `\`yarn\`` in the comment, which most GitHub markdown parsers tolerate but produces inconsistent rendering (sometimes the inline code works, sometimes the surrounding text behaves like markdown — e.g. `\`__proto__\`` renders without the underscores because GFM still interprets `__` as bold inside the malformed code span). Use plain backticks: `` `yarn` ``. Same rule for backslashes in any markdown body posted via heredoc.
- **Don't fix transitive dependency bumps with `resolutions` blocks.** When a Dependabot PR bumps a transitive dep (the dep is not in `package.json` directly, only via a parent), the proper fix is upgrading the parent dep that pulls it in, not pinning the transitive in `resolutions`. `resolutions` is duct tape: it survives until something else moves the lockfile, and it adds noise to `package.json` that future contributors have to reason about. Close the transitive Dependabot PR with a short comment naming the parent dep and the phase where its upgrade is planned (#951 Phase 4 covers most of this). Lesson learned 2026-05-08: I rebased four transitive bumps (#864 micromatch, #957 postcss, #956 xmldom, #923 tmp) using `resolutions` and then realised the parent-upgrade approach is cleaner; closed all four with explanatory comments. Direct-dep bumps are different: those land normally (e.g. #863 webpack stays open).

## Golden standard 2026 for AI in OSS (informs every commit and comment)

Cross-referenced from OpenInfra, EFF (Feb 2026), Fedora, Linux kernel (March 2026 Torvalds agreement), Drupal:

**Disclosure (mandatory):**

- Tag every AI-assisted commit: `Note: AI-assisted (Claude Code). Manually verified: <what>`. Equivalent to OpenInfra's `Assisted-By:` for fragments/suggestions and `Generated-By:` for substantial generation. Use the project's existing `Note:` format for now (krassowski hasn't asked for the standard tags); upgrade if/when project adopts a template.
- Disclose in PR description and in PR/issue comments at the end. Never hide AI involvement.
- Include what was manually verified (specific files, specific commands run, specific results) so the reviewer can scope their review.

**Accountability:**

- The contributor is the author and is fully accountable. AI is a tool, not a co-author.
- Must fully understand and be able to debug every line submitted. Reviewer time is not a debugging session for the contributor's tool.
- Treat AI output as untrusted: review for correctness, security, license compatibility before submission.
- Comments and documentation should read as human-authored. Avoid AI tells: heavy em dashes, bullet-list overload, "Furthermore," "In summary,", excessive headers, repeated parallel sentence structure.

**Quality bar:**

- No hallucinated APIs, no fabricated commit hashes, no invented PR numbers, no misrepresented test results.
- If a verification wasn't run, do not claim it was. "Build green locally" requires having run it.
- Don't open PRs to chase metrics. One substantive PR > five trivial bumps.
- Don't create noise: duplicate PRs, low-effort docs, formatting-only churn.

**Reviewer expectations apply to you:**

- Heightened scrutiny for AI-labeled contributions is reasonable. Anticipate it; ship clean.
- If a review request would just be "please refactor this for me," don't open the PR.

## Writing conventions

- No `--` as decorators or separators anywhere in code comments
- No block comment headers with decorative lines
- Comments only when the WHY is non-obvious; never explain what the code does
- One-line comments max, no multi-line comment blocks
- Commit messages: imperative mood, body explains why not what
- No `Co-Authored-By` for trivial one-liner fixes; use it for substantive AI-assisted work

## Build and test

```bash
yarn build           # tsc + bundle + copy assets
yarn test:unit       # vitest run (341 tests)
yarn test:e2e        # playwright (requires built app)
yarn dist:osx-dev    # local macOS build without code signing
```

Pre-commit hook: husky + lint-staged runs `vitest related --run` (NOT `vitest run --related`, that flag was removed in vitest 4.x).

## Test authoring rules (AI-assisted)

Cross-referenced from 2026 research: AI hallucination rates 3.1–19.1% on frontier models, up to 99% on fake-library prompts; AI-generated tests commonly mock the system under test, write tautological assertions, or cover only happy paths. These rules apply to every test added to this repo with AI assistance.

**Structure (mandatory):**

- AAA pattern explicit. Three sections per test: Arrange (setup, mocks, fixtures), Act (single call to the SUT), Assert (verify behavior). One concept per test.
- Test name describes observable behavior, not implementation: `'rejects URL with javascript: scheme'`, not `'test_validateURL_1'` or `'validateURL returns false'`.
- Each test independent. Fresh tempDirs, reset mocks in `beforeEach`, no shared mutable state, no order dependency.
- Deterministic. No `Date.now()` without freezing, no `Math.random()`, no real network/fs unless boundary-mocked.

**What to mock (and not):**

- Mock boundaries only: `fs`, `net.fetch`, `child_process.spawn`, `electron.ipcMain`/`ipcRenderer`, time. Use `electron-playwright-helpers` for IPC E2E (it injects helpers into the running app rather than mocking).
- Never mock the system under test. If the test mocks the function it is supposed to verify, it always passes; the mock returns whatever the test expects, regardless of bugs in the real code.
- Prefer real components for adjacent logic when latency and side effects are acceptable. Cheaper to find real bugs.

**Negative tests + edge cases:**

- For every happy-path test, write at least one error-path test (invalid input, null, empty, malformed, unicode boundaries, extreme size).
- Security-relevant code (path validators, URL parsers, IPC handlers): negative cases are the test. Path traversal `'../../etc/passwd'`, scheme injection `'javascript:'`, oversized input, embedded null bytes.

**Verification each test atrapa lo correcto (mutation lite):**

- Before declaring a test useful, mutate the production code: flip a `>` to `>=`, change `&&` to `||`, swap `true` and `false`, return the wrong constant. Run the test. If it still passes, the test is tautological or mocks too aggressively. Fix or delete.
- For unit tests adding regression coverage on a known bug: write the test against the unfixed code first and confirm it fails for the right reason. Then apply the fix and confirm it passes.

**Disclosure on test commits:**

- Use the same `Note: AI-assisted (Claude Code). Manually verified: <what>` footer. The verification line should describe the mutation check or the "test fails before fix, passes after" run, not just "tests pass".
- Do not bundle "added 50 tests" in a single commit. Split by area (one file or one logical concern per commit) so a reviewer can apply mutation-style scrutiny per piece.

**Anti-patterns to avoid (AI commonly produces these):**

- Tautological assertion: `expect(input).toBe(input)` after a transform that does nothing in the test path.
- Snapshot test of arbitrary string output without an "and we expect this exact output because..." rationale.
- Loose matcher hiding bugs: `expect(result).toBeDefined()` when the test should assert the actual value.
- Coverage-chasing tests: a test that walks a code path without asserting anything meaningful, added to bump a coverage number.
- Hallucinated imports: AI invents a method on a library that does not exist. `tsc --noEmit` catches the obvious cases; double-check by jumping to definition.
- Cargo-cult `vi.mock` for modules the test does not actually exercise.

**E2E tests (Playwright + Electron):**

- Always use a fresh tempDir as `JLAB_DESKTOP_HOME` per test, clean up in `finally`.
- For multi-window detection: filter `app.windows()` by title or URL, do not rely on `firstWindow()` alone (this app launches up to 4 windows on start: titlebar, welcome, session, manager).
- Stub all dialogs (`stubAllDialogs` from `electron-playwright-helpers`) so a misconfigured test does not block on a modal.
- Cap each E2E test under 30s; full app launch is already 5–10s on a CI runner.

**Coverage discipline:**

- Coverage % alone is not the goal. A repo with 80% high-quality coverage is better than 95% with tautological tests.
- Track which files are critical and ensure they have meaningful behavioral coverage; ignore the metric for build scripts and trivial getters.

## Vitest patterns (this project, CJS)

**Path depth in vi.mock calls:**

- Both `vi.mock('path')` and regular `import` use the same relative path from the test file: `../../src/main/...` from `test/unit/foo.test.ts`. Earlier guidance recommending 3 dots inside `vi.mock` was wrong; 2 dots is correct and what vitest expects. The previous test files in revival happened to work with 3 dots because vitest fell back through the project root, but the file system path was technically outside the repo. Copilot review on PR-C1 flagged this; fixed by using 2 dots consistently.

**Module mock factories:**

- `vi.fn()` instances in mock factories lose Mock API via `vi.mocked()`
- Direct reassign in `beforeEach`: `(module as any).method = vi.fn()`
- If property has only a getter: use `vi.spyOn(module, 'method').mockResolvedValue(...)`

**Constructor mocks:**

- Arrow functions cannot be used with `new`
- Use: `vi.fn().mockImplementation(function() { return mockInstance; } as any)`

**yargs argv.\_ structure:**

- `argv._[0]` = subcommand name, `argv._[1]` = first positional arg
- Handlers guard with `argv._.length === 2` for exactly one arg
- Tests must pass: `{ _: ['cmd-name', '/path/to/thing'] }`

**eslint no-empty-function:**

- `.mockImplementation(() => {})` triggers the rule
- Use `.mockReturnValue(undefined)` instead

## afterPack.js Linux path

`context.packager.appInfo.productFilename` returns "JupyterLab" (productName).
On Linux the actual binary is "jupyterlab-desktop" (from package.json `name`).
Always use `context.packager.executableName` for Linux path, with fallback to `appInfo.name`.

## Dependencies of note

- `@electron/fuses` 2.1.1: flip fuses in `afterPack` (before signing), not `afterSign`
- `fast-xml-parser` v5: dual CJS+ESM via conditional exports; not ESM-only despite `"type": "module"` in its package.json; webpack uses ESM path correctly
- `webpack` 5.x: only used by `webpack.preload.js` to bundle the 12 Electron preload scripts (target `electron-preload`). Not used for renderer UI or main process. Replaceable with esbuild in Phase 4 for ~25 MB devDep savings.
- `stylelint` and friends: dead weight in this repo (zero authored .css files, CI step is a no-op via `--allow-empty-input`). Removable; would also drop `mini-css-extract-plugin` (orphan) and shrink yarn.lock.
- Transitive deps with stalled Dependabot PRs: `postcss`, `@xmldom/xmldom`, `tmp` are build/dev-time only (not in the asar). Pin via yarn 1 `resolutions` if a CVE matters; surgical lockfile-only edits revert on next install.
- `micromatch` 4.0.8: pinned via `resolutions` on `revival/electron-41`. Also reaches the project transitively via @typescript-eslint independent of stylelint.

## GitHub advisory private fork rules

- Each advisory has exactly one private fork named `jupyterlab-desktop-ghsa-<id>`
- The fork's default branch is `master` (not `main`)
- PRs within the fork target the fork's own `master`; GitHub handles upstream merge on publish
- **`gh pr create` does NOT work. REST API does NOT work. GraphQL does NOT work.**
  GitHub hides the advisory fork from the normal fork graph intentionally. The only way to open the PR is the web UI:
  go to `github.com/jupyterlab/jupyterlab-desktop-ghsa-<id>`, click "Compare & pull request" after pushing a branch.
- Never copy files wholesale from another fork/branch — always apply changes surgically to avoid version drift
- `git push --force` is acceptable in private advisory forks to fix wrong commits before PR is created

## Pending work

**Done since last update:**

- ✅ Phase 1 triage commented on issue #951 (2026-05-08)
- ✅ #863 webpack 5.94, #957 postcss 8.5.14, #956 @xmldom/xmldom 0.8.13, #923 tmp 0.2.5 manually rebased on dependabot branches; comments + AI disclosure left on each
- ✅ #955 net.fetch TLS fix merged (squashed as f0dec2c)
- ✅ Upstream master synced into revival/electron-41 (merge commit, tests still 341/341)

**Open:**

- Decide on stylelint removal PR against master (verified safe in revival, build/tests green; lint:check pre-existing prettier issue is unrelated)
- Fix prettier:check failures on revival's test files (`test/unit/tokens.test.ts`, `test/unit/workspacesettings.test.ts`, `vitest.config.ts`)
- Comment on advisory GHSA-8cvf-4977-r95v to SwayZGl1tZyyy (fix in private fork, pending release)
- Comment on advisory GHSA-5c3f-5gj7-p9xh to SwayZGl1tZyyy (same)
- Open PR for CVE-2025-54991 fork via GitHub web UI (branch already pushed)
- Start private fork for CVE-2025-55002 (GHSA-5c3f-5gj7-p9xh) via advisory page, then push fuses-only fix
- Fill affected/patched versions in draft advisories once release is planned
- Visual verify news feed after fast-xml-parser v5 upgrade (`yarn build && yarn start`)
- Triage what to do with #934 (js-yaml, runtime path, conflicting) and #864 (micromatch, dev-only, dependabot rebase failed)
- Phase 3 prep: Electron 41 breaking changes audit (10 sub-tasks in issue #951)
