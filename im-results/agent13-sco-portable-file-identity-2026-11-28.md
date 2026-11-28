# SCO file-identity closure across partition, manifest, verification and HTTP admission

**Date:** 28 November 2026  
**Author:** Agent 13  
**Status:** independent *intermediate engineering evidence*, not academic obfuscation resistance evidence and not release clearance. The digest path-inventory, selected-graph path-inventory, and HTTP publisher regressions each have source-pinned red→green Ubuntu/Windows receipts. Later standalone-entry and in-root symlink changes remain separately pending in focused/full CI.

## Question

Can server-controlled obfuscation publish a reviewed facade or accept a server-private ESM source graph whose source-path names are distinct as JavaScript strings, yet ambiguous when written under a common target filesystem namespace?

The repository's shared file inventory already distinguishes several such cases: NFC-equivalent names, equal-uppercase Unicode folds, case-aliased ancestor directories and file/directory overlaps. But six SCO entry points separately applied only lowercase full-string uniqueness or tested a private/public pair by full-path identity:

- `src/sco-private-integrity.js`: digest verifier's `seen` set used `name.toLowerCase()`.
- `src/sco-graph.js`: private ESM module map checked lowercase whole paths.
- `src/sco-selected-graph.js`: selected graph composer checked lowercase whole paths, while legitimately repeating *identical* shared private dependencies.
- `src/sco-selective-partition.js`: private static source closure checked lowercase whole paths and the standalone selective partition checked source entry vs declared private path only by exact equality.
- `src/sco.js`: HTTP publisher used portable full-path keys to veto exact public/private collisions but constructed its directory/file inventory from *public* paths alone, not jointly from private dependency paths.

A pair such as `PRIVATE/a.mjs` and `private/b.mjs` has different lowercased *full* paths but aliases the intermediate directory namespace. A pair `Σ.mjs` / `ς.mjs` has different lowercased strings but the shared policy's uppercase equality key collides. Directly publishing both or using a file as a private dependency's parent path is a deployment ambiguity, irrespective of native syntax correctness.

## Testable correction

Instead of duplicating another naming predicate, all six paths use the project's existing `createPathInventory` / `registerFilePath` / `safePath` contract in `src/portable-paths.js`. Exact repeated private dependencies remain permitted where existing graph semantics allow them; distinct aliases or file/directory overlaps are rejected *before* emitted source, digests, or HTTP admission. There is no added per-RPC transform or runtime code; these validations run in compiler, trusted-server startup or handler initialization.

| Entry point | Acceptance invariant |
|---|---|
| `verifyScoPrivateSourceDigests` | All committed paths name an unambiguous portable file tree before any filesystem reads |
| `partitionScoAsyncGraph` | Every original ESM source has one unambiguous file path |
| `partitionScoSelectedGraph` | Public units and transitive private dependencies have distinct portable identities, except exact repeated dependency declarations with matching digest |
| `collectPrivateStaticImportClosure` | Every named private source is an unambiguous file in the transitive closure |
| `partitionScoSelectedAsyncExports` | The public entry and every selected private path cannot alias or shadow each other as files/directories |
| `createScoHandler` | The combined public-HTTP and declared-private path tree is portable before any GET or RPC admission |

Negative tests use independent Unicode and ancestor counterexamples. Positive controls retain two distinct files and the same private dependency reused by two public facades; the tests do not count a generic unrelated parse/refusal as a successful collision rejection.

## Source pins and validation

Verifier before/after:
- Failing baseline **`e84876ad3e8366249918c69eab540deafb36170e`** — [two-OS run 46136578731](https://github.com/FlareZ123/obfs/actions/runs/46136578731). Failure logs show an `ENOENT` on the *first* purported file rather than the required path-alias rejection, on Ubuntu and Windows.
- Corrected verifier **`51382b659c79eccba3478dc7462b664504e47b93`** — [two-OS run 46136617047](https://github.com/FlareZ123/obfs/actions/runs/46136617047), **both focused jobs successful**, with strict project/external JSDoc.
- Test: `test/sco-private-integrity-portable-paths.test.js` (four duplicate-class negatives and a positive deployed two-file proof).

Graph red→green and existing integration:
- Test-only graph source `f498cff6b3e4eca68b27024e89450e474263c6aa` — [run 46136766139](https://github.com/FlareZ123/obfs/actions/runs/46136766139), **failed on Ubuntu and Windows** because the old selected-graph composer and selective static import closure accepted all four selected-module aliases and three imported-source aliases.
- Graph implementation source `0045fe79e7f455cdbdb622b23bf0972aa456bc77` — [run 46136808808](https://github.com/FlareZ123/obfs/actions/runs/46136808808), **both focused OS jobs successful** on the first graph regression version. Later strict-message tests and additional entry/private alias tests require their own exact-head check.
- The existing `manual-sco-graph.yml` Ubuntu/Windows integration at source `bfe5c3d119d01be3d8a23fb5ca886349080d490d` — [run 46137366049](https://github.com/FlareZ123/obfs/actions/runs/46137366049), **both graph jobs successful**: deterministic generated facades, multi-module HMAC/authorization and private graph semantics, plus SCO graph JSDoc.
- **HTTP publisher:** test-only source `e40574eea32bdbabc6ee7a2cdb1c68014c82996e` — [run 46137127585](https://github.com/FlareZ123/obfs/actions/runs/46137127585) **failed on both OS for the intended public/private directory collisions** (three other assertions passed); corrected publisher source `91cd86145de313ade820ecbe81de93c2c84f04d2` — [run 46137154890](https://github.com/FlareZ123/obfs/actions/runs/46137154890) **passed on both OS including strict JSDoc**. Later reverse-direction and valid shared-directory controls are outside those source pins.
- **Standalone selective public/private:** [run 46137002037](https://github.com/FlareZ123/obfs/actions/runs/46137002037) at `d31bc99954a607e4de457aa37196b0b6fe226d3d` failed as intended on four public/private aliases **and additionally failed an unrelated test-fixture positive control**: `privateGraph` supplied a synchronous export to an async-only API. The corrected async-only positive fixture is committed as `f36917a4776c7f8df8076fdeab93267f55c6a87b`; later focused CI is required before claiming this boundary green.

Additional branch-side integration (not yet full-validated):
- Graph paths source pin `0045fe79e7f455cdbdb622b23bf0972aa456bc77` plus later tightened tests; source fixture `test/sco-graph-portable-collisions.test.js`. The test spans ordinary private graph, selected graph and selective static dependency closure; an independent later fixture tests standalone entry/private alias.
- HTTP publisher source pin `91cd86145de313ade820ecbe81de93c2c84f04d2` plus `test/sco-public-private-path-collisions.test.js`.
- Branch: [agent13/sco-private-integrity-portable-paths-20261128](https://github.com/FlareZ123/obfs/tree/agent13/sco-private-integrity-portable-paths-20261128).

Reproduce on installed Node 22:
```sh
node --test test/sco-private-integrity-portable-paths.test.js
node --test test/sco-graph-portable-collisions.test.js
node --test test/sco-public-private-path-collisions.test.js
node --test test/sco-private-realpath-identity.test.js
npm run typecheck
npm run typecheck:external
```

## Additional private ESM import-graph integrity: in-root symlinks (provisional)

A real Node 22.16.0 local subprocess-independent `import()` experiment constructed two directories:

- `private/main.mjs` is a symlink to `mirror/main.mjs`, whose exact source bytes equal the reviewed `private/main.mjs` commitment and contain `import "./leaf.mjs"`.
- `private/leaf.mjs` contains the reviewed `"reviewed-child"`, while `mirror/leaf.mjs` contains an uncommitted `"unreviewed-child"` source.

Node's default ESM resolution loaded `mirror/leaf.mjs`: observed `"unreviewed-child"` where the reviewed graph projected `"reviewed-child"`. `fs.realpath(private/main)` remained **inside** the trusted root; thus an in-root realpath containment test plus SHA-256 of the redirected main-module bytes does not prove a complete static ESM import closure. This is a concrete *deployment correctness and unexpected executed-source* mismatch, not a hostile-server attacker bypass under the project's threat model.

A red-first test `test/sco-private-realpath-identity.test.js` at **`495cec56405ef9192a5b5c075f24010ae60c9d02`** exercises that exact Node-loader observation and requires verifier rejection. The candidate correction at **`6db72f522fa9ef0cf81cf82c135275941f5b5189`** checks `fs.lstat` of every component of each committed path, following the preexisting outside-root rejection, and refuses any internal symlink before hashing. Tests cover an in-root symlink leaf, in-root symlink ancestor, and a distinct-file positive control; Windows symlink negatives are skipped because runner privilege is not guaranteed. **CI red/green for these additional source pins is pending at the time of writing.**

The repository already documents a related **direct in-memory API** symlink-induced module-identity mismatch in `test/direct-api-symlink-module-identity.test.js` and `README.md`. The new finding is narrower and distinct: the opt-in trusted SCO server digest *verification step itself* accepted an in-root symlink capable of redirecting relative ESM imports while every listed source SHA-256 matched.

This is a non-atomic deployment preflight: filesystem replacement between `lstat` and the actual ESM `import()` is still possible unless the trusted integrator makes its source tree immutable. It adds initialization filesystem checks but no per-RPC computation. A user running Node with explicit `--preserve-symlinks` may have different relative import behavior; this conservative policy rejects symlinks rather than promising compatibility with arbitrary loader flags.

## Limits and decision

This is **build/deployment admission correctness**, not an independent demonstration of static or dynamic deobfuscation resistance, tamper resistance against a compromised server, or locking on a hostile runtime. A trusted SCO publisher can still be bypassed by a compromised trusted host, and authorized clients can relay calls to private methods. The verifier still has a documented filesystem TOCTOU interval between digest check and the later ESM import.

The shared two-key NFC/case policy is conservative and **not a complete target-filesystem case-fold equivalence proof**. The unmerged full-fold donor under `agent4/compound-casefold-fullfold-fix-20261126` is a separate, independently reviewable expansion; do not silently claim this branch implements all Unicode case folding. A non-path-based equal-trust attacker-cost experiment and proper 2.5× runtime measurement remain independent release requirements. Until the full acceptance and protection evidence is green, **RELEASE-BLOCKED**.
