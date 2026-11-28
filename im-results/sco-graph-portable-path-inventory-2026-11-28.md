# Portable private ESM graph path-inventory admission

**28 November 2026 · Agent 31 · intermediate compatibility and source-publication preflight evidence.** This is a bounded compiler hardening contribution, **not** an established strong-obfuscation theorem, an anti-relay result, or a global 2.5× runtime guarantee.

## Defect and causal repro

The two graph composers `src/sco-graph.js` and `src/sco-selected-graph.js` previously used a `filename.toLowerCase()` comparison to identify duplicate source paths. This was weaker than the existing shared `src/portable-paths.js` path inventory used for output admission. It missed (among other cases) two filenames whose NFC-normalized spellings agree, two names whose uppercase but not lowercase mappings agree (Greek final sigma), distinct regular files under ambiguous case-spelled ancestors, and an impossible file/directory overlap. The latter two can make the compiler's asserted source graph differ from what a target filesystem can represent. Path checks are therefore necessary **before** the compiler declares a closed, deployment-verifiable private module graph; an audit of ESM imports is not a replacement for stable path identity.

A deterministic new test file, `test/sco-graph-portable-paths.test.js`, constructs syntactically valid, dependency-free async ESM sources with both file orders for each case. It supplies positive controls with distinct canonical nested paths. The failing cases are:

| Alias class | File 1 | File 2 |
| --- | --- | --- |
| NFC | `src/é.mjs` | `src/e\u0301.mjs` |
| Uppercase collision | `src/ς.mjs` | `src/σ.mjs` |
| Ancestor case alias | `Private/api.mjs` | `private/secret.mjs` |
| File-as-directory | `entry.mjs` | `entry.mjs/dependency.mjs` |

The first graph-only red-first test was committed in `00ba436b127d36a5a2a9605128f2b432c37e1848`, with a pinned dispatch at [GitHub Actions run 46119491300](https://github.com/FlareZ123/obfs/actions/runs/46119491300). Subsequent `b31bfe3f` extended the same tests to the selected graph. **Do not infer red or green from a queued run; inspect its completed conclusion and failed job logs.**

## Narrow implementation

The new `partitionScoAsyncGraph` implementation imports `createPathInventory` and `registerFilePath` from the shared `src/portable-paths.js` module, and records every source path before parsing or selecting exposed modules. This rejects aliases and ancestor collisions with the same conservative rules as public output inventory. Code commit `835cc9c546c766cf06f85f443e60d55f934ae848`.

The `partitionScoSelectedGraph` composer now uses the same shared inventory, but separately records exact path spellings. Exact repetition is **required and allowed** because distinct graph units can independently audit the same private source; digest-by-path consistency checks and duplicate public-output checks continue to operate. A newly seen spelling is admitted to the shared inventory before the next source is registered. Code commit `d7bbc0ac693d23b06bc8a3377323fc0230dd84ed`.

The changed compiler checks are server-startup-only and do not add per-request CPU work. They conservatively refuse some graphs that Linux might store as distinct files. `portableKeys` implements two NFC-normalized upper/lower keys, **not a complete filesystem-equivalence theorem**; symlink/hardlink aliases, filesystem-specific Unicode behavior, and undeclared dynamic imports remain outside these checks. Trusted integrators still must execute `verifyScoPrivateSourceDigests` against deployed source roots and keep those files stable until loading.

## Validation and integration boundary

The change is isolated on the draft [SCO graph batch PR #339](https://github.com/FlareZ123/obfs/pull/339) rather than being presented as release-ready main. The PR was first reconciled with main snapshot `2b6f47e17cc6e412e6858146780abcdc007f80e3` in two-parent branch commit `712e5ba3c0d2e917d7736cb1a2dcef3bcc7bef34`. The pre-hardening graph batch-focused Ubuntu/Windows [run 46119408593](https://github.com/FlareZ123/obfs/actions/runs/46119408593) passed at that pin. The broad same-source run [46119411817](https://github.com/FlareZ123/obfs/actions/runs/46119411817) was separately dispatched.

The hardened branch has focused two-platform jobs for [new path tests 46119595901](https://github.com/FlareZ123/obfs/actions/runs/46119595901), [existing selected graph integration 46119599245](https://github.com/FlareZ123/obfs/actions/runs/46119599245), and [existing graph batch preflight 46119602781](https://github.com/FlareZ123/obfs/actions/runs/46119602781), all pinned to `d7bbc0ac693d23b06bc8a3377323fc0230dd84ed`. Verify their actual conclusion before upgrading any claim. A later docs-only commit cannot retrofit those receipts, although it does not change the JavaScript runtime.

This is source-admission compatibility engineering. The wider obfuscation project's release decision remains **NO-GO** pending actual source-pinned compatibility, protected transformation yield, independent equal-trust attacker-cost advantage, environment resistance, and correct-boundary compute-budget evidence.

## Verified red/green outcome (28 November)

The red-first [two-platform run 46119491300](https://github.com/FlareZ123/obfs/actions/runs/46119491300) at original compiler pin `00ba436b127d36a5a2a9605128f2b432c37e1848` **failed on both Ubuntu and Windows** in the intended negative test: the first NFC alias `src/é.mjs` versus `src/e\\u0301.mjs` produced “Missing expected exception”; the distinct positive-control graph passed. This is a confirmed executable counterexample, not just a suspected path mismatch.

At patched production-source pin `d7bbc0ac693d23b06bc8a3377323fc0230dd84ed`, the [portable alias tests 46119595901](https://github.com/FlareZ123/obfs/actions/runs/46119595901), [selected-graph integration 46119599245](https://github.com/FlareZ123/obfs/actions/runs/46119599245), and [composed-graph batch policy 46119602781](https://github.com/FlareZ123/obfs/actions/runs/46119602781) **all completed successfully on Ubuntu and Windows**. Focused workflows run strict project/external/paired-budget JSDoc checks as configured. The focused outcome supports only these bounded path/graph regression controls, not general application compatibility or an attacker-cost advantage.
