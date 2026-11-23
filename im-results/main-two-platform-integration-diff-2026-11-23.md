# Current-main full-suite failure disposition and old-main named-case comparison

**Agent 8, 23 November 2026. Status:** source-pinned **red integration evidence** for the obfuscator. This is an intermediate engineering/testing receipt, not a verified security or performance improvement. Primary product release remains **RELEASE-BLOCKED**.

## Two immutable comprehensive run sources

| Full workflow | Source commit | Platform | Total | Passed | Failed | Skipped |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| [Earlier main 45166435075](https://github.com/FlareZ123/obfs/actions/runs/45166435075) | `8b2d5c0661ab7fbe49f2b7cc0aff28a2ca7cf1c7` | Ubuntu | 5,151 | 5,130 | 18 | 3 |
| Earlier main 45166435075 | same | Windows | 5,151 | 5,124 | 17 | 10 |
| [Latest complete main 45250108841](https://github.com/FlareZ123/obfs/actions/runs/45250108841) | `84b855e666d70a9a0937540f987595e122144fcf` | Ubuntu | 5,237 | 5,197 | 26 | 14 |
| Latest complete main 45250108841 | same | Windows | 5,237 | 5,190 | 26 | 21 |

Both newer `node22` workflow jobs failed their behavioral/adversarial test stage; **neither run constitutes full-suite acceptance**. The focused job was skipped in the unfocused workflow. Older and newer totals differ because the test corpus changed. All figures came from the Node test-runner summaries in the frozen workflow logs. Any later main commit is outside this source.

## Exact named-case comparison

The `sims/compact-node-test-runner.js` prints a `FAILED_TEST_INDEX` record. Comparing those exact case names rather than test ordinals:

- **Windows:** all 17 earlier failure names recur in the newer 26 failures. Exactly 9 new names appear; 0 old failure names disappear.
- **Ubuntu:** 17 earlier failures recur, exactly the same 9 new names appear, and one earlier Ubuntu-only `generated five-state SCO and matched ordinary esbuild-minified service yield identical clones` failure does not recur. The latter absence is a **single run outcome**, not proof of a repaired fault or a stable pass.

The common 17 retained names cover:

1. bound `Blob` constructor primitive-positive property rewriting
2. `Blob` primitive-options property rewriting
3. hostile bound target source interception
4. hostile bind source with minified/obfuscated ESM
5. native two-file private ESM factory
6. cross-module named declaration reader calls
7. public-only normalization functional clone comparison
8. four-file ESM imports, nested calls and external API flow
9. COO private direct-use class owner-field yield
10. SNO private direct-use class owner-field yield
11. private tuple complete cold-session profile
12. SNO bound private target hostile-runtime extraction
13. bound public export native source and callable metadata
14. attacker private-property source recovery after identifier pass
15. local Symbol key mutation and generated-once invariant
16. two-file ESM caller under local Symbol transformation
17. deterministic before/after sample output bytes

All **9 additional failure names** belong to newly committed `test/agent1-reference-role-destructuring.test.js` red-first tests in the newer source, absent from the earlier source:

1. reference role path: member receiver on assignment
2. reference role path: member receiver on compound assignment
3. reference role path: member computed index on assignment
4. reference role path: destructuring default initializer
5. reference role path: destructuring member assignment target
6. reference role path: destructuring computed-member key
7. reference role path: destructuring computed-call key
8. reference role path: for-of member assignment target
9. reference role path: for-of destructuring default

These names reveal test additions with failing assertions. They are **not** a controlled old-versus-new causal attribution: source and corpus both changed, and other agents continue modifying the repository. A matching failure-name set also does not prove individual emitted programs are identical.

## Agent 8 changes relative to this integration source

The newer source contains prior independently reviewed and merged SCO compatibility/policy updates:

- [SCO exact batch outer arity PR #340](https://github.com/FlareZ123/obfs/pull/340), merged `c7f9fc04fa9e19f425fc61f0953533dc1b37d36b`; recognized helper rejects surplus args before child execution. Targeted security regression green on Ubuntu+Windows, overall Ubuntu authorization workflow red at a separate native IPv6 Chromium baseline.
- [Selected private `Intl` host-data/Locale PR #335](https://github.com/FlareZ123/obfs/pull/335), merged `e87e2a62dd4c3d7eb2f7f2487c0a336221090162`; true original-vs-generated Chrome/Node compatibility positive/negative red-green with two-OS focused JSDoc.
- [Malformed `atob`/`btoa` host exceptions PR #343](https://github.com/FlareZ123/obfs/pull/343), merged `479f4c6178cdf53111104eec17a43636f601dfa5`; real browser/Node error-string mismatch and focused green with selected private arithmetic.
- [Selected-private `new URL` constructor failure PR #346](https://github.com/FlareZ123/obfs/pull/346), merged `fa776fb1d8a6d2ef41a174ae6d5358708150037a`; validated fixed valid URL and arithmetic positive, declined unproved native failure paths.

Later [private transitive ESM `new URL` checker PR #347](https://github.com/FlareZ123/obfs/pull/347), merged `094067ceb6fc53327b7d5f4ba9907b21892535b1`, was **not** part of the frozen `84b855...` main source. Its separate source-pinned [focused 45251097147](https://github.com/FlareZ123/obfs/actions/runs/45251097147) succeeded on both OS with three graph admission tests and strict JSDoc. No unfocused full-suite result has been reported for that later integration commit here.

## Consequences

The latest comprehensive Node test evidence remains red with 26 failed cases on each OS. The 17 older failure names require owner-led emitter/proof/performance investigation, and the 9 newly added reference-role failure names are clear candidate work for their author. There is no basis to promote this integration checkpoint to strong obfuscation, arbitrary interfile semantic equivalence or universal runtime-budget compliance. Preserve the fixed source commitments, exact workflow run IDs, and negative outcomes when comparing future runs.
