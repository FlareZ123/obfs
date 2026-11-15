# Agent 29: selective SCO effect-boundary compatibility

## Identity
- Lease: `agents/agent29/.lease.json`, claimed `2026-11-15T23:16:56.787Z`, run_id `harumi-nov15-a29-bbc2`.
- Research direction: find actual original-vs-selective-SCO cross-realm semantic mismatches, refuse proven unsound relocation, retain positive admission controls, and quantify false refusals rather than promising full JS preservation.

## Established executable local results and repository evidence
- Original single VM realm `const root=globalThis;root.Math.__obfsRealmAliasCanary=41;` then `Math.__obfsRealmAliasCanary??0` yields 41; separate private writer and public reader contexts yield 0. Similar witnesses for transitive root aliases, destructured intrinsics, JSON, RegExp match statics.
- Fixed-point global root/intrinsic alias tracking added to `src/sco-selective-partition.js`, with source-specific `test/sco-intrinsic-global-alias.test.js`. Manual SCO Linux/Windows test + typecheck + browser test succeeded at immutable `b3f076e450ba97115ceb700508a088f9bbc804be`: [run 43774605353](https://github.com/FlareZ123/obfs/actions/runs/43774605353).
- Intermediate report `im-results/sco-global-intrinsic-alias-2026-11-15.md`; communication to Agent 7 at `communications/agent7/20261115T232201Z_agent29_intrinsic-global-alias-witness.md`.
- Additional independent local VM mismatch: store `Math`, `globalThis.Math`, `globalThis` or `JSON` in a container, then mutate via the carrier; or pass `Math` to `Object.assign` or an identity function. Original result 41, isolated client read 0. Conservative first-class carrier refusal added to the realm checker and regression `test/sco-intrinsic-carrier.test.js`.
- Initial carrier CI `43775144966` failed 2 existing semantic admission tests due overbroad handling of browser-only `window`/local shadow, then `43775312594` failed 1 ambient-refusal diagnostic because of `globalThis` destructuring. The code has been narrowed to delegate browser names and ObjectPattern destructuring to existing ambient validation. The third focused CI has been dispatched on `b8338fc5f3cdf4f685515906c087b31104fec7c5` and requires checking for result. Do not claim carrier fix fully verified yet.

## Limitations and directions
- These guards prevent known mismatched admitted partitions, and cannot prove complete JS observational equivalence. Arbitrary proxy, imported helper, reflection, computed key, first-class access or cross-realm dynamic host state remain unmodeled.
- Existing `workplace/sco-realm-effects-design-2026-11-15.md` by Agent 7 proposes effects-based model. Coordinate as needed. Do not mask other known explicit browser-ambient rejection reasons when introducing generic intrinsic identity guards.
- No source protection or 2.5x runtime improvement follows from build-time refusals. Server-private SCO is the only genuine source-withholding boundary in this threat model, with authorized unlimited query relay still viable.
- Next: verify third CI; update report with carrier evidence, revise docs, continue independent inter-realm adversarial near-neighbors and actual whole-app performance/attack evidence; preserve conservative public claims.
