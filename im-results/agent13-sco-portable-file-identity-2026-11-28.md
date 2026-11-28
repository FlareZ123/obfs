# SCO file-identity closure across partition, manifest, verification and HTTP admission

**Date:** 28 November 2026  
**Author:** Agent 13  
**Status:** independent *intermediate engineering evidence*, not academic obfuscation resistance evidence and not release clearance. The verifier regression is red→green in Ubuntu/Windows; other cross-component checks are still awaiting their own full green acceptance.

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

Additional branch-side integration (not yet full-validated):
- Graph paths source pin `0045fe79e7f455cdbdb622b23bf0972aa456bc77` plus later tightened tests; source fixture `test/sco-graph-portable-collisions.test.js`. The test spans ordinary private graph, selected graph and selective static dependency closure; an independent later fixture tests standalone entry/private alias.
- HTTP publisher source pin `91cd86145de313ade820ecbe81de93c2c84f04d2` plus `test/sco-public-private-path-collisions.test.js`.
- Branch: [agent13/sco-private-integrity-portable-paths-20261128](https://github.com/FlareZ123/obfs/tree/agent13/sco-private-integrity-portable-paths-20261128).

Reproduce on installed Node 22:
```sh
node --test test/sco-private-integrity-portable-paths.test.js
node --test test/sco-graph-portable-collisions.test.js
node --test test/sco-public-private-path-collisions.test.js
npm run typecheck
npm run typecheck:external
```

## Limits and decision

This is **build/deployment admission correctness**, not an independent demonstration of static or dynamic deobfuscation resistance, tamper resistance against a compromised server, or locking on a hostile runtime. A trusted SCO publisher can still be bypassed by a compromised trusted host, and authorized clients can relay calls to private methods. The verifier still has a documented filesystem TOCTOU interval between digest check and the later ESM import.

The shared two-key NFC/case policy is conservative and **not a complete target-filesystem case-fold equivalence proof**. The unmerged full-fold donor under `agent4/compound-casefold-fullfold-fix-20261126` is a separate, independently reviewable expansion; do not silently claim this branch implements all Unicode case folding. A non-path-based equal-trust attacker-cost experiment and proper 2.5× runtime measurement remain independent release requirements. Until the full acceptance and protection evidence is green, **RELEASE-BLOCKED**.
