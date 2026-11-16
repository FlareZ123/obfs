# Direct-call host provenance and public-token application attack

**Agent 6, 16 November 2026.** Intermediate compiler-soundness and public-source attack evidence at branch source `01884105637fbc5a7263d41c6228459b26fa096f`. This is not an academically established security result.

## Motivating semantic proof gap

In a declared three-module ESM graph, a caller can pass `globalThis` to a local function, which destructures the ambient `Reflect` object and replaces its `ownKeys` method with an opaque, preloaded host callback. The callback dynamically imports a separate exported state object and reads `Object.keys(state)`. A native execution sees `secretField`; rewriting that field under the unproved assumption that `Reflect.ownKeys` was pristine can cause the callback to observe a generated `_p...` name.

Agent 4 independently recorded four **actual pre-fix** same-family semantic failures on Ubuntu in [run 43892388977](https://github.com/FlareZ123/obfs/actions/runs/43892388977) against its own test-only branch. Its [green run 43892841749](https://github.com/FlareZ123/obfs/actions/runs/43892841749) and [parallel report](ambient-call-parameter-provenance-2026-11-16.md) are independent evidence for the same abstract soundness problem. Agent 6's independently frozen **pre-fix red**, [run 43893359123](https://github.com/FlareZ123/obfs/actions/runs/43893359123) at exact test-only source `54678bd9faae620919c5a9408b6b1823f32aefbf`, failed on **both Ubuntu and Windows**. Five tests produced genuine original-vs-emitted semantic differences: native observed `secretField` while emitted returned a random `_p...` key. A sixth pre-patch failure involved an overstrict positive-control test containing an unrelated literal `Reflect` Identifier; that fixture was revised separately, so count **five** true soundness witnesses, not six.

The patched `safeClosedCallerRecordRead` records direct local declaration/const-function parameter lists, propagates identifier actual-argument provenance into formal identifiers, collects destructured ObjectPattern formal capabilities, and feeds these into the existing conservative native-Reflect effect gate. Five distinct source-visible negative transports now correctly **refuse** the unsafe owner property rename. Two separate benign input graphs retain **one true owner-field rewrite**, including unrelated global field destructuring and an entirely local non-host object. These are finite lexical-name-based may-alias checks, not a complete interprocedural effect analysis; imported calls and unknown higher-order dispatch remain unproved.

[Exact full Ubuntu/Windows manual gate 43892701513](https://github.com/FlareZ123/obfs/actions/runs/43892701513) passed at `01884105637fbc5a7263d41c6228459b26fa096f`: Ubuntu 1,704 passed, 0 failed, 1 skipped; Windows 1,703 passed, 0 failed, 2 skipped from 1,705 Node tests per operating system. Both strict JSDoc suites and the sampled benchmark passed, and Ubuntu real Chromium and its 64-case two-variant record test passed. This shows selected correctness and performance compatibility only.

## Distinct genuinely transformed six-module COO application

The static attack harness `sims/application-challenge-token-neutralize.js` intentionally starts from two *different original source contracts* produced by `sims/application-challenge-observer-ablation.js`:

- `own-only`: both existing function-source observers are removed and the missing-key record call is changed to an own-key call;
- `null-proto`: both observers are removed and the private literal record explicitly adopts a null prototype, retaining the missing-key call.

On each contract, the real compiler emits six ESM modules with **2/2 actual private-field renames**. The unchanged frozen original is still 0/2; these numbers must never be conflated. The original source bytes total **2,793** (own-only) or **2,809** (null-proto). The emitted outputs total **3,058** or **3,074** bytes respectively for the sampled seed settings.

## Seedless source-only adversary and measured outcomes

`sims/application-challenge-token-neutralize-attacker.js` is a separate Node child process. Its only application inputs are the published COO directory and a destination directory. It loads built-in Node modules and the seedless Acorn token-normalization routine; it does **not** import the compiler, original application files or compilation seed. The process changes hash-shaped property/local labels to neutral sequential names. It does not recover erased original spelling or infer an original algorithm that was absent from the delivered bytes.

For two seeds per variant in the full Ubuntu run 43892701513, the independent attacker statically neutralized **2 generated private-property labels and 9 generated local labels** per delivered six-module graph. The scanner itself required **17.66–20.36 ms** on the observed Ubuntu CI worker; this excludes process startup, file copying and execution verification, and is not a controlled human or LLM attacker-effort comparison. Rewritten public outputs were 2,974 bytes (own-only) or 2,990 bytes (null-proto), versus original 2,793/2,809. Every compiled and normalized application matched its own native version across **84 differential and 160 held-out cases per seed and contract**. The CI passed the identical harness on Windows; its timing numbers are not asserted here.

The experiment is a **negative obfuscation-security result** for these rename-only variants: a source-only attacker can remove the conspicuous hashed-name layer while retaining executable behavior. It cannot prove general original-source recovery, large-application attacker time, or the absence of an advantage from unrelated future architectures. A simpler public-directory copy attack is already known to functionally clone these COO variants.

## Decision and next work

The compiler now preserves five selected source-visible host-effect transports and yields actual safe property changes in two positive controls. This correctness improvement does not establish tamper-resistance or unauthorized-use prevention. Future integration should consolidate this implementation with Agent 4's independently verified callsite provenance tests and account for imported function calls, call aliases, binding identity/shadows, and unproved higher-order effects. Preserve the same native-vs-emitted host callback witness and nonvacuous positive coverage whenever broadening the proof.

Runtime 2.5x compliance remains a workload-dependent empirical question. The earlier [integrated six-module paired process study](agent6-integrated-property-evidence-2026-11-16.md) measured the exact distinct source variants under 2.5x, but the new token-normalization attack is an offline analyst process and its timing is not end-user obfuscated compute.
