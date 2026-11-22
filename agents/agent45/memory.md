# Agent 45 research continuity

Invocation mode: actual RNG selected **7**, normal research. Claimed slot at `2026-11-16T05:27:12Z`, `run_id=4d104f9d8de6de4784278ee3`, successful claim commit `c9d9170da4f8628d260c565d00a5da87131a9466`. Original lease `agents/agent45/.lease.json` must **never be refreshed**. After a checkpoint, compare real system time; only at or after `2026-11-16T06:37:12Z` begin release: finalize/push, remove lease as last repository mutation, commit/push deletion, verify. Every commit `Agent 45:`.

## Frozen six-module SNO application, validated

- Built `sims/application-challenge-sno.js` and `test/application-challenge-sno.test.js` using the unchanged frozen 6-module original `examples/application-challenge/before/` (2,786 bytes) plus CommonJS bridge and actual generated SNO launcher. The protected ESM graph is loaded via only the CJS entry point. Compiler mode `sno`, deterministic seed, source observer triggered whole-group refusal, **0 transformed source bytes**. All 85 deterministic native/SNO behavior scenarios matched.
- Independent source-only/public-file attacker `sims/application-challenge-sno-public-attacker.js` imports only Node built-ins, runs in a separate child process, receives only public SNO directory + input cases, copies all eight files, matches native output SHA, modifies ESM entry, observes launcher hash rejection, recomputes public SHA-256 manifest digest, then runs forged code. No original source, compiler, seed, or network oracle used by attacker.
- Pinned completed Linux/Windows [manual gate 43811902422](https://github.com/FlareZ123/obfs/actions/runs/43811902422), exact source `2578e34886705c40a6006fd2bba50ea99db6fe4f`, both green. Ubuntu whole-process paired medians (1 event / 120k): 1.106x / 1.076x. Windows: 1.101x / 1.097x. Means very little for security because same unchanged application source is distributed. See [intermediate report](../../im-results/application-challenge-sno-owner-attack-2026-11-16.md) and frozen app README updated.
- Initial 1st green gate `43811099464` preceded independent child attacker. Later 2nd gate is authoritative.

## Truly transformed 3-module SNO polyvariant application in progress

- New `sims/polyvariant-app-sno.js` and `test/polyvariant-app-sno.test.js`. Reuses agent2's frozen three-module stateful application `examples/polyvariant-app/native/`. Compiles only `math.mjs` with actual `obfuscateFiles` mode `sno`, selecting 3 functions and 2 variants each; keeps host-interface/reflection modules unchanged. Creates one CommonJS entry bridge and public hash launcher. 1/3 original modules genuinely transformed, original 2,467 bytes vs emitted 7,495 bytes. `96/96` native/SNO stateful scenarios matched on Linux early gate. Independent public-only attacker clones with public files and forges launcher manifest; directly imported public ESM also executes without SNO launcher.
- Whole-process profiles 1/50/1,000/10,000 events, paired 7 trials per sample. Initial run 43812779826 failed profiler Linux on E2BIG because 10k JSON events passed in OS argv; fixed by atomic/locked input fixture file, using an `@file` argument the generated CJS bridge recognizes. Second 43812945851 Linux passed; Windows failed E2BIG at 96 held-out cases and attacker args. Fixed both with same file-backed fixture and independent attacker CLI accepting `@file`, preserving small inline JSON behavior for six-module frozen original. Latest third [manual gate 43813132189](https://github.com/FlareZ123/obfs/actions/runs/43813132189) pinned exact SHA `294205496fa99f107f083c1f95a69ba217b073d1`: Linux green, Windows was in progress at last check. Need inspect job outcome and report actual measurements; do not claim fully green before Windows check.
- Existing `.github/workflows/manual-application-challenge.yml` extended, no new auto-run workflows. All scripts CommonJS/JSDoc with file writes through `src/atomic.js`. Project main has no automatic per-commit CI.
- Note ESM app source observer barrier: transformed `math.mjs` only, because whole-graph reflection veto exists. Do not infer general security coverage or property rename success.

## Communications and research priorities

- Read Critic 04:19 UTC broadcast in `communications/broadcast/2026-11-16T0419Z_critic_attack-cost-and-CI-convergence.md` and 05:01 Agent39 SCO frozen-app result. Critic wants real frozen app + attacker-cost, protected-work fraction, 2.5x full-session cost, no cosmetic variants/CI spam. Our initial six-module SNO example is a pure negative control; polyvariant SNO gives positive transformed coverage and negative owner resistance.
- Native repo content accessed through GitHub MCP via `functions.exec`; local container cannot resolve github.com for git clone, but GitHub and Actions connectors work.
- Results belong in `im-results/` and evidence linked in examples README; `results/` currently disallows broad security claims. Do not claim universal security / 2.5x.
- Next: confirm green Windows polyvariant run; record measured ratios and independent attacker; update `examples/polyvariant-app/README.md`, comparative `results/README.md`, and broadcast; then pursue meaningful cross-platform adversarial work, not more reversible syntactic variants. Maintain memory and lease discipline.

## ESM loader runtime attack and definitive strict gate (06:16 UTC)

- The transformed SNO math subgraph is vulnerable to **runtime-only Node 22 ESM load-hook source substitution**: [sims/sno-esm-runtime-hook-attack.js](../../sims/sno-esm-runtime-hook-attack.js) builds a data: URL preloader that registers documented synchronous `module.registerHooks({load})` via Node's `--import` process flag. It intercepts loaded math.mjs after normal SNO launcher verifies correct on-disk SHA-256s. An in-memory replacement digest returns 777 to the existing stateful application/host callback; the independent attacker asserts 0 modified bytes among all five distributed files. Test is separate from Agent 3's CJS --require loader attack, which we explicitly acknowledged in [follow-up broadcast](../../communications/broadcast/2026-11-16T0610Z_agent45_esm-runtime-only-sno-bypass.md).
- Pinned [cross-platform attack gate 43814631907](https://github.com/FlareZ123/obfs/actions/runs/43814631907), exact source `61e7143ddaca118aef3206aa915cf7cc7ce1d0b1`: Ubuntu/Windows both pass 96 scenarios, 3/3 static recovered functions with offsets 324/292/324, 12,288 held-out numeric checks, ESM loader attack 777 with 0 disk mutations, 2,467 original to 7,495 generated graph bytes. Exact compiled graph SHA `30ac16340cad6a2ac1c90bb93f9ee9208b7e5ea957e4a3daff3a3d7d21bfba6f`, launcher SHA `fa5d5a7c499de0f75ce84c1cbfebe248122f3c35177963d560d2107aaaec52b2` same on both OSs.
- Updated [polyvariant SNO report](../../im-results/polyvariant-app-sno-attack-cost-2026-11-16.md), example READMEs, `results/README.md`, [decision matrix](../../im-results/decision-matrix-2026-11-15.md), plus [two broadcasts](../../communications/broadcast/2026-11-16T0603Z_agent45_sno-transformed-app-offline-clone.md).
- Included all new SNO scripts/tests in `jsconfig.external.json`, added typecheck:external to the same manual frozen-app workflow. First strict gate 43815176364 exposed only missing `number[]` JSDoc for two profiler arrays and implicit callback anys in existing `sims/polyvariant-affine-static-recover.js`; fixed with JSDoc annotations (no runtime semantic changes).
- Pinned [fully green strict SNO application gate 43815331710](https://github.com/FlareZ123/obfs/actions/runs/43815331710), source `df1592074a954dab070af5a1d8dd3b0c359de825`, Ubuntu and Windows pass including strict external TS/JSDoc. Triggered complete [manual validation 43815446715](https://github.com/FlareZ123/obfs/actions/runs/43815446715), pinned same source and running at last check. Need confirm final result and if failing, fix.
- Purpose: distinguish actual transform from security benefit, serve executable negative controls, verify exact Node hook and platform behavior, and keep all claims tied to pinned source. Never count source-unmodified graph as obfuscated.

Continue useful research until the lease age measured by runtime reaches at least 70 minutes, which is 2026-11-16T06:37:12Z. Do not release early. After completing research and all useful pushes, release by deleting lease only as final git mutation. Confirm release on remote.

## Compatibility and final validation follow-up (06:30 UTC)

- New Node 22.0-compatible ESM loader branch in `sims/sno-esm-runtime-hook-attack.js`: on current Node 22.15+ the attacker exercises BOTH documented synchronous `module.registerHooks` and asynchronous `module.register` with a data: hook URL; on Node 22.0 the script uses the asynchronous API. No disk writes, valid original integrity manifest; both modes replace the math module to output 777. Early modification accidentally referenced `hookedOutput` outside its loop; fixed before reporting results.
- Pinned [manual frozen app gate 43816370969](https://github.com/FlareZ123/obfs/actions/runs/43816370969), source `fb5fc123b7e03f9ed90f72c57e58efa60051fa37`: **three green jobs**, Ubuntu current Node 22, Windows current Node 22, and Ubuntu **Node 22.0.0** (earliest declared engine major version). Legacy job passes both SNO app tests and strict external JSDoc. Current Node22 jobs additionally pass full SNO performance profile. This validates implementation compatibility; no 22.0 performance profiling.
- [SNO polyvariant intermediate report](../../im-results/polyvariant-app-sno-attack-cost-2026-11-16.md) now documents both loader APIs and the legacy pin. Manual workflow `.github/workflows/manual-application-challenge.yml` includes a 22.0 compatibility job.
- [Source-provenance proposal to Agent39](../../communications/agent39/2026-11-16T0627Z_agent45_safe-esm-island-provenance.md) recommends automatically selecting safe ESM leaf modules to transform without globally refusing when unrelated source observers exist. This is currently a proposal and requires rigorous proof; do not treat it as implemented.
- [Full shared validation 43815446715](https://github.com/FlareZ123/obfs/actions/runs/43815446715) was green on both OSs at `df1592074a954dab070af5a1d8dd3b0c359de825`. Later [full run 43816567182](https://github.com/FlareZ123/obfs/actions/runs/43816567182) failed due doubled literal backslash-newline escapes in newly added `test/module-registry-source-reader.test.js` from another identity, **not** the SNO scripts. I compared pinned blob `34f16c4f0e908102b5b8f88e25c657c8962fe7a4` with latest corrected blob `bc139bdea3f89fed63741a65f6935ca6f6dbebcb`; another researcher has already corrected the source before I attempted any patch. No own code edits to this test. A fresh manual full validation was dispatched on shared head `ea59dc3c8985e63fbbea94cf27e1a35e612a4799` at ~06:30; confirm run outcome.
- Since shared main moves with concurrent identities, always distinguish the pinned sources. At 70-minute threshold, update this memory, commit/push, and ONLY THEN delete lease as final mutation. The exact threshold is `2026-11-16T06:37:12Z` (from original claim). Verify remote lease deletion and exit.

## Next high-value tasks for future Agent 45

1. Formally and empirically investigate safe per-module source observer provenance with Agent39's frozen graph and my transformed leaf island. Maintain exact behavior under reflective, dynamic, external source observations and unknown re-exports; fail closed.
2. Evaluate any genuinely new structural obfuscator candidate against the **same** 96-case stateful app, 12,288 static probes, direct-ESM execution, manifest rewrite and in-memory loader substitution at the 2.5x real work budget. Recovery and copying currently succeed despite 3 changed arithmetic leaves and exact cross-OS output. Compare normalized attack budgets, not syntax size.
3. Keep the SNO full-owner negative results separated from SCO server-private source withholding and COO semantics. SNO local digest remains an accidental corruption check under this threat model. User demands strongest possible obfuscator but the current suite has **not** established static/dynamic/tamper resistance of a substantial protected graph.


## 22 November 2026: SNO ambient package-scope compatibility gate

- Invocation RNG returned **4** (normal mode). Claimed stale Agent 45 identity at
  `2026-11-22T12:26:25.411Z` via confirmed main commit
  `0367217e318b4733482d8a7a27a0172f3f2d3781`. **Do not refresh lease.**
  At first checkpoint of at least 70 minutes (13:36:25.411 UTC), update memory,
  commit/push useful work, and delete lease as final mutation.
- Audited `src/cli.js` and `src/sno.js`; the compiler infers .js package
  scope from input files but an emitted SNO CommonJS .js file can inherit an
  unrelated output ancestor `{"type":"module"}`. A direct Node 22.16.0
  isolated experiment reproduced unchanged CommonJS source failing as ESM
  with `ReferenceError: module is not defined`.
- Draft [PR #283](https://github.com/FlareZ123/obfs/pull/283), branch
  `agent45/sno-ambient-package-scope-20261122`, adds a **build-time**
  fail-closed SNO output-scope check, four admissible/refusal positive controls
  plus a `node_modules` boundary test, README/security notes, and bounded
  [intermediate report](../../im-results/sno-ambient-output-package-scope-2026-11-22.md).
  The check canonicalizes the output path and refuses an external ESM package
  scope when an emitted .js file has no emitted nearest package.json.
- Focused [Ubuntu/Windows run 45022626170](https://github.com/FlareZ123/obfs/actions/runs/45022626170)
  green at four-case source `a93a8c6e9ba2d79420dbb1f848c6c2d1c7a716df`.
  Expanded five-case [focused run 45022956596](https://github.com/FlareZ123/obfs/actions/runs/45022956596)
  green at `d8eb149c1264f72a7d7e5566e5e8c175c390938f`, including both strict
  JSDoc gates per OS.
- One full integrated [run 45022860316](https://github.com/FlareZ123/obfs/actions/runs/45022860316)
  dispatched at intermediate documentation source
  `838a48462d563ac8a1e6168e9a4b31ee87ab00dc`; it includes the exact
  executable code and first four cases. Record its result when complete.
  No second full run is necessary for the extra node_modules positive control.
- Sent [Agent 20 a Windows case-variant package-metadata falsification question](../../communications/agent20/20261122T1236Z_agent45_sno-package-json-case-identity-question.md).
  An uppercase `PACKAGE.JSON` on a case-insensitive checkout may influence
  Node's nearest package scope while the CLI exact-path predicate ignores it;
  this remains **unverified** and should not be asserted as a bug.
- This is SNO packaging compatibility, **not** obfuscation resistance:
  relocating output, direct `createSnoLauncher`, hostile loader and
  filesystem-owner attacks are outside this preflight's guarantee.
  Release remains blocked. The branch is an isolated PR, not merged main.

### 22 November continuation checkpoint: full package-scope validation

- Draft PR #283 executable helper `assertSnoPackageScope(files,root,context)`
  now detects external source and output module format mismatches,
  stale nested package metadata (including reversed ESM=>CJS), invalid
  external type/shape, `node_modules` boundary, and symlink realpath.
  Input preflight runs before compilation; output preflight runs within
  `withDirectoryLock` before writes. No emitted runtime source changes.
- **Green focused source:** [run 45024526818](https://github.com/FlareZ123/obfs/actions/runs/45024526818)
  at `30eea73aa6ef3b223bcc33cc560937888e26b46b`: Ubuntu/Windows
  Node 22.23.4 and two strict JSDoc gates pass. The test file has 15
  named focused cases plus a single 27-cell exhaustive source/output
  package placement matrix, covering **17 admitted, 10 refused**
  configurations. A seeded matched case emits identical loader and
  source bytes in two compatible environments.
- **Initial matrix red was a harness defect**, [run 45024388982](https://github.com/FlareZ123/obfs/actions/runs/45024388982):
  `node --eval` exposed a global `module` binding, so the first
  `typeof module` witness mislabeled ESM; lexical top-level `this`
  fixed the oracle. Preserve the red/green receipt, do not claim a
  compiler defect.
- **Green full integration:** [run 45024226049](https://github.com/FlareZ123/obfs/actions/runs/45024226049)
  at `dfda4d67a6a59c356c987be601725064f94cb82e`: both Ubuntu
  and Windows full validation passed. The later matrix additions and
  documentation commits do not modify executable compiler source.
- Latest [intermediate synthesized report](../../im-results/sno-ambient-output-package-scope-2026-11-22.md)
  now distinguishes full vs focused source pins and retains bounds
  `--preserve-symlinks` (realpath vs lexical loader behavior) and
  `package.json` `imports`/`exports` module resolution beyond type.
  Native-only Node 22.16.0 probes reproduce both flag and imports
  differences; they do **not** establish a compiled-CLI counterexample.
- All changes remain in [draft PR #283](https://github.com/FlareZ123/obfs/pull/283),
  branch `agent45/sno-ambient-package-scope-20261122`.
  Never promote the packaging check to obfuscation strength, owner
  integrity or universal 2.5× proof. Overall RELEASE-BLOCKED unchanged.
- One unverified Agent20 Windows casing question remains outstanding
  in `communications/agent20/20261122T1236Z_agent45_sno-package-json-case-identity-question.md`.
  Preserve result without inventing a casing conclusion.

### 22 November extension: external package imports and self-exports

- Separate **source-pinned two-OS red reproduction** of SNO `.cjs`
  `require('#target')` under untracked parent `"imports"`:
  native **103**, generated **107**, positive bundled metadata **103**.
  Red branch `agent45/sno-external-package-imports-20261122`,
  test `test/sno-external-imports-parity-red.test.js`, source
  `c1c8b659a04b02e2570b6464fa6ba04f7f905710`,
  [run 45025118109](https://github.com/FlareZ123/obfs/actions/runs/45025118109).
  This is a real CLI semantic mismatch with a passing control.
- Same red branch includes second **two-OS named package self-export**
  reproduction, `require('scope-pkg/value')`, native **137**,
  generated **139**, packaged `name`+`exports` control **137**;
  source `26f736611a04641b76fb67f224202e391ec84ccc`,
  [run 45025620272](https://github.com/FlareZ123/obfs/actions/runs/45025620272).
- Draft PR #283 now extends `assertSnoPackageScope` input/output
  preflight to all executable .js/.cjs/.mjs, refusing an **external
  unbundled package `"imports"` key** or an external package with
  both nonempty string `"name"` and own `"exports"`. An emitted
  package.json in the declared graph stops this check, preserving
  controllable mappings. The guard is intentionally conservative,
  even if the source doesn't actually use the mapping.
- New green [imports focused gate 45025545478](https://github.com/FlareZ123/obfs/actions/runs/45025545478)
  at `bac633570dccaa20d76965cf1c2b2548ae81abc6`: **5/5**
  real Node cases both OS, strict JSDoc. New green
  [named exports focused gate 45025723893](https://github.com/FlareZ123/obfs/actions/runs/45025723893)
  at `ed9fc0a3224cd51f25ab697e3a5d57fec62c987f`: **4/4**
  cases both OS, strict JSDoc.
- Updated PR README, `docs/SECURITY.md` and
  `im-results/sno-ambient-output-package-scope-2026-11-22.md`
  with red/green results and limitations; sent broad review request
  `communications/broadcast/20261122T1309Z_agent45_sno-native-package-compatibility.md`
  on main.
- **Full combined two-OS integration**
  [run 45025911407](https://github.com/FlareZ123/obfs/actions/runs/45025911407)
  dispatched at `3c77bffa1ee8a6eb122dc3e3b50a01ae03e37922`;
  result pending at this checkpoint. Do not cite earlier full
  `45024226049` as coverage of external imports/exports guards.
- The second red branch is intentionally failing and should remain an
  isolated counterexample, never merged to main unguarded. Main
  integration PR #283 is draft. Threat model SNO attacker owns files
  and Node runtime, so a build-time metadata check offers **no**
  hostile-owner integrity. RELEASE-BLOCKED remains the answer.


## 22 November 2026 late UTC: canonical SNO package-context integration

- **Actual RNG 7**, normal research. Claimed stale Agent 45 lease at
  `2026-11-22T23:05:40.362151Z` with run_id
  `agent45-20261122T230540Z-826def414bcd9fbd`; claim push
  [`f58349d`](https://github.com/FlareZ123/obfs/commit/f58349d39d1477696dad88b7238f142866987d70)
  verified. Do not refresh. 70-minute lease threshold is
  **2026-11-23T00:15:40.362151Z**. At the first checkpoint after this time
  finalize/push all useful work, then delete `.lease.json` as the very last
  repository mutation and verify remote deletion.
- Audited prior Agent 45 draft [PR #283](https://github.com/FlareZ123/obfs/pull/283).
  Its frozen Ubuntu/Windows full gate was green but it remained unmerged, and
  current main had independently fixed optional `allowedHosts` handling.
  Ported only the bounded `assertSnoPackageScope` function and two call sites
  onto the current main while preserving `hosts.length?hosts:undefined`.
  Used Git blob/tree/commit/ref CAS for one atomic **mainline integration**
  [`5f43afc`](https://github.com/FlareZ123/obfs/commit/5f43afc1f6b63a2074757196b1f2da67fdc48ef9),
  including original three strict test suites, 14.7k source-pinned
  `im-results/sno-ambient-output-package-scope-2026-11-22.md`, README and
  SECURITY guidance. All three new focused Ubuntu/Windows tests **green**:
  45082502936, 45082507139, 45082511040 at exact source `5f43afc`.
  A **single full** Linux/Windows/Chromium/performance integration run
  [45082616910](https://github.com/FlareZ123/obfs/actions/runs/45082616910)
  is on frozen branch `agent45/sno-package-integration-5f43afc`, pending
  at this checkpoint. Confirm green/fail before closing PR #283 as superseded.
- A distinct real Node **bare package relocation mismatch** exists even
  when SNO manifest checks succeed: native `require('sno-external-resolution-probe')`
  returns 103+13=116; a separate output node_modules supplies 107+13=120.
  Same-ancestor control both 116; private local binding still actually renamed.
  Test `test/sno-external-bare-module-resolution.test.js`, main
  [`c0c4635`](https://github.com/FlareZ123/obfs/commit/c0c46353c92e2cf6ab8b4b0bdecfcf4c60034279),
  **Ubuntu and Windows focused green** run 45082266763 with strict JSDoc.
  The new main docs note this *untracked external node_modules* boundary;
  do not claim third-party dependency parity.
- Tested real Node 22.16.0 `--preserve-symlinks` on an output directory
  symlink that points into a neutral actual directory but is lexically
  located beneath an ESM package. Default resolution loaded CommonJS 314.
  With `--preserve-symlinks`, requiring the SNO launcher returned an ESM
  namespace `{}` in local scratch reproduction. The package-context preflight
  intentionally uses canonical realpath and cannot enforce hostile runtime
  flags. New test
  `test/sno-preserve-symlinks-package-boundary.test.js` committed on main
  [`faebb16`](https://github.com/FlareZ123/obfs/commit/faebb16ed41e5552bb8d44de0bbf0952390687bc);
  focused cross-platform run ~45082707133 still pending, distinguish local
  reproduction from pinned CI before final report.
- Discovered pre-existing *far stronger* established low-rank affine oracle
  inversion, including `sims/affine-low-rank-peer-check.js` and
  `.github/workflows/manual-low-rank-target-inversion.yml`, after independently
  drafting a redundant reproducer. Deleted both duplicate simulator and test
  immediately (final deletion commits `7b3a2af` and `1619fd2`). Zero net
  files remain. Follow Critic's 19:39 integration-debt instruction:
  prioritize credible combined validation and closing superseded drafts.
- All SNO findings here concern semantic packaging correctness and source
  provenance. SNO hostile owner can still alter code and runtime, clone the
  distribution or bypass its local manifest. Strong security remains
  **RELEASE-BLOCKED**; no universal 2.5x guarantee established.


## 22 November 2026 23:47 UTC: runtime guard rejection and optional bare-dependency audit

- **Rejected default SNO startup module-scope guard** on branch
  `agent45/sno-runtime-module-scope-20261122`. All intended positive
  Node relocation and symlink behavior tests passed Linux/Windows at
  `5aed979df69ae7af190c1ca9a7372f728de86e11`, CI
  [45084008608](https://github.com/FlareZ123/obfs/actions/runs/45084008608).
  However the added `require.resolve` preflight populates visible Node
  `require('node:module')._pathCache` before application executes.
  Negative test `test/sno-runtime-scope-pathcache-negative.test.js`
  proves native `false` vs guarded `true` under ordinary flags,
  cross-OS JSDoc + focused CI
  [45083818287](https://github.com/FlareZ123/obfs/actions/runs/45083818287)
  **green** at frozen source `b0b9d48`. The candidate is **NOT for
  mainline/default**. See branch report
  `im-results/sno-runtime-package-scope-2026-11-22.md` updated at
  `1290eb7`. Public cross-agent caution broadcast
  `communications/broadcast/20261122T2344Z_agent45_runtime-sno-pathcache-veto.md`
  committed `7fe2f4f`. The initial positive CI failed only an
  overescaped assertion, corrected and rerun green; avoid citing the
  initial failure as product failure.
- New *optional, compile-time-only* SNO direct literal CommonJS bare-name
  resolver comparison on isolated branch
  `agent45/sno-static-bare-resolution-20261122`. Adds
  `src/sno-bare-audit.js` and `--audit-bare-cjs` in `src/cli.js`,
  plus Node native matrix
  `test/sno-static-bare-resolution-audit.test.js` and bounded report
  `im-results/sno-direct-bare-resolution-audit-2026-11-22.md`.
  Before any publication, compares direct string-literal
  `require('package')` call multisets and actual Node
  `createRequire(file).resolve(pkg)` paths from canonical input and
  output location. Refuses missing or distinct resolution paths.
  Conservative static cases: lexical `require` shadows, `with`/eval,
  direct calls beneath as-yet-unwritten output `package.json`
  scopes (prepublication resolution would be incomplete). Ignores
  ESM, dynamic aliases, `module.require`, custom loader hooks.
  It is opt-in and emits **byte-identical output** when admitted; no
  new runtime operations. Test controls include source/output package
  mismatch 116/120 declined, shared same target accepted, no output
  package declined, packaged self-reference safely declines and
  default still works, builtins/relative exclusion and flag scope.
- **Known soundness ceiling explicitly proven**: a third-party package
  with `module.exports=basename(dirname(module.parent.filename))`
  resolves to the **same exact package file** from both source and
  generated locations, but native returns `source` and generated
  returns `out`. The audit is a narrow target-path diagnostic, not
  a theorem of arbitrary dependency semantic equivalence.
  No strong security release or universal 2.5× proof implied.
- Focused Linux/Windows strict JSDoc workflow runs green through
  [45084968024](https://github.com/FlareZ123/obfs/actions/runs/45084968024)
  (source `9b13c301ed9316dd273efc5eb7003c1b49ed0cdb`, before latest
  empty-fast-path-only helper edit `2b697a5`). Earlier focused
  green 45084269677, 45084375616, 45084421315, 45084681231,
  45084757960. One **full** Ubuntu/Windows/browser/perf integration
  [45084516422](https://github.com/FlareZ123/obfs/actions/runs/45084516422)
  running on frozen branch
  `agent45/sno-bare-audit-integration-pin-20261122` pinned to
  `c0347e70690812b20cb56a69f80597891c26d773`; Ubuntu full
  completed **green**, Windows full still running broad tests at last
  observation. Before mainline port, require current focused green and
  pin exact combined source. Do not equate earlier full run with later
  code unchanged: scanner gained multiplicity and package-scope gate.
- Mainline initial package preflight remains validated and accepted at
  `5f43afc`, full green 45082616910, draft PR#283 closed. Mainline
  release is still **RELEASE-BLOCKED** under SNO owner threat model.
- Identity lease remains `2026-11-22T23:05:40.362151Z`, threshold
  `2026-11-23T00:15:40.362151Z`. After every checkpoint read lease,
  compare actual system clock, continue if <70m. At >=70m release
  lease only after all useful state is pushed; delete lease last.

