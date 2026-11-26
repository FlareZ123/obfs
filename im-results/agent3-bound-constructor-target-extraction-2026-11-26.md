# Bound constructor target extraction from exported native wrappers

**Research state:** intermediate adversarial finding, 26 November 2026  
**Reviewer:** Agent 3  
**Candidate branch:** `agent1/exported-closure-owner-proof-20261126`  
**Candidate code head reviewed:** `3fd4bd298750cdc3287ddce1542abc0569d5c0e9`  
**Reproduction branch:** `agent3/agent1-bound-constructor-extraction-20261126`  
**Reproduction commit:** `bb12fc53120e5d33e99329d49fe5bff273e3c759`  
**CI:** [focused manual-validation run 45832136174](https://github.com/FlareZ123/obfs/actions/runs/45832136174), Node 22.23.4, Ubuntu/Windows/macOS, all passed.

## Finding

The native-bound-target admission accepts a constructible ordinary function declaration when its only source-visible use is a top-level `internal.bind(null)` call. The exported bound wrapper remains constructible. A consumer outside the supplied graph can recover the supposedly private target without a preloader:

1. Construct the exported bound wrapper with `new hot()`.
2. The bound function's `[[Construct]]` forwards construction to the original target and uses the target's `prototype`.
3. The new instance therefore inherits from `internal.prototype`.
4. The ordinary `prototype.constructor` property points back to `internal`.
5. `Object.getPrototypeOf(instance).constructor` returns the original target function object. Calling `Function.prototype.toString` on it exposes the transformed target source.

The current `new.target` veto does not catch this path: the target body need not mention `new.target`. The scanner's `NewExpression` veto only sees new expressions in the supplied source graph; the consumer's `new hot()` occurs outside it.

## Reproduction

The source fixture is intentionally minimal:

```js
const owner={secretField:7};
function internal(){return owner.secretField;}
export const hot=internal.bind(null);
```

The test `test/agent3-bound-constructor-target-extraction.test.js` constructs `hot` externally, retrieves `Object.getPrototypeOf(instance).constructor`, and reads the recovered function source.

Run 45832136174 passed on all three focused platforms and also passed project JSDoc checks. The exact Ubuntu output was:

| Mode | Native target source | Recovered emitted target source | Property rewrites |
|---|---|---|---:|
| COO | `function internal(){return owner.secretField;}` | `function internal(){return owner._p2413a2afaf;}` | 1 |
| SNO | `function internal(){return owner.secretField;}` | `function internal(){return owner._p509da4525e;}` | 1 |
| SCO | `function internal(){return owner.secretField;}` | `function internal(){return owner._pe6481ab0cf;}` | 1 |

All three modes returned the original value `7`. The recovered function name remained `internal`, the wrapper name remained `bound internal`, and wrapper length remained `0`. This is a successful source-extraction witness, not a behavior-parity failure: the recovered body contains the transformed key rather than the original spelling.

## Assessment and recommended disposition

- The target is private only with respect to source-visible references in the supplied graph; it is not inaccessible to an external consumer of the exported bound wrapper.
- Ordinary constructible function declarations and function expressions should not be described as private bound targets under this public API shape.
- If the intended benefit requires preventing ordinary consumers from recovering the target function object, conservatively refuse constructible targets. Nonconstructible arrows avoid this particular `new hot()` / `prototype.constructor` route; any alternative admission still needs separate source-observer and host-preloader analysis.
- If the feature is intentionally only a property-renaming compatibility optimization and makes no source-secrecy claim, retain the transformation only with an explicit limitation that external construction of a bound wrapper reveals the transformed target source. Do not treat the target as a runtime secrecy boundary.
- This finding does not show that the original property spelling is recoverable from the transformed source. It shows that the emitted target function itself is recoverable without a hostile preloader, and that the existing hostile-preloader limitation is not the only extraction route.

This report does not authorize release or establish resistance to dynamic analysis. The primary strong-protection objective remains independently gated by the repository's other release blockers.

## Relationship to established repository evidence

This is not a novel extraction primitive. The repository already documents the exact constructible-bound-function escape in `im-results/bound-export-source-reachability-2026-11-22.md` and `docs/SECURITY.md` ("Bound callable targets and hostile-runtime extraction"). That earlier red/green study showed that a constructible target's source can be observed through `Reflect.construct(hot,[3]).constructor.toString()`, that field and identifier renames change the observable source, and that a nonconstructible arrow target avoids this particular constructor path while retaining a tested positive rename lane.

The current experimental branch therefore reopens an established compatibility failure: its `hasUnsafeNativeBindMutationSurface` predicate admits local `FunctionDeclaration` and `FunctionExpression` targets without distinguishing constructible from nonconstructible functions, and the current shape test treats ordinary declarations/expressions as admissible. The new three-mode reproduction extends the current-branch receipt to COO/SNO/SCO and three operating systems; it should be read as a regression against the earlier conservative contract, not as a first discovery.

**Recommended regression contract:** retain the existing nonconstructible-arrow positive witness; make ordinary constructible function declarations and function expressions negative for this lane unless the deployment can prove their bound wrappers are never constructed and no external source observer can inspect the target. Since the wrapper is an exported public function and can be constructed by an external consumer, the source graph cannot establish that condition. The earlier nonconstructible-arrow test and report should be the baseline.

## Additional host-surface characterization

The candidate gate also admits a source-visible `import.meta` read. The isolated test `test/agent3-native-bind-import-meta-host-getter.test.js` installs a host-provided `import.meta.env` getter through Node's `vm.SourceTextModule.initializeImportMeta`; the getter replaces this realm's `Function.prototype.bind` with a forwarding observer before the source's `internal.bind(null)` executes. Focused run [45833222367](https://github.com/FlareZ123/obfs/actions/runs/45833222367) passed on Ubuntu, Windows and macOS with strict JSDoc checks. Native capture was `function internal(){return owner.secretField;}`; emitted capture was `function internal(){return owner._p2e20e8ff0c;}`; both returned 7.

This is a custom host/loader capability, not an in-graph mutation and not a new threat beyond the documented hostile-loader boundary. It does show that `import.meta` is an unmodeled host object in the current lexical gate. Either reject `MetaProperty import.meta` in the bound-target lane or state an explicit trusted-`import.meta` assumption; `closedWorld:true` alone does not establish that its host-provided properties are inert.

## Cross-file proof and documentation freshness

The candidate's `test/agent1-bound-target-crossfile-probe.test.js` is a positive cross-file owner witness, not only a sibling-module mutation negative. Focused run [45832638302](https://github.com/FlareZ123/obfs/actions/runs/45832638302) passed 9 tests on Ubuntu, Windows and macOS, including:
- an exported owner object in `state.mjs` read by a local bound target in `app.mjs`, with one cross-file object/property rewrite in each of COO/SNO/SCO;
- imported callable targets remaining unrenamed;
- benign ESM-cycle variants preserving behavior.

The current `docs/CLOSED_WORLD_PROPERTY_PROOF.md` section still says positive bound-target witnesses are same-file and cross-file owner admission remains unproven. That wording is stale for the candidate head. The linked `../im-results/agent1-native-bind-target-proof-2026-11-26.md` is also absent from both the candidate branch tree and main at review time. The full manual-validation run cited there, 45805807618, is pinned to earlier code SHA `8eee5ba06475edfa2ee83ff24d353fda8ca3a6b8`, not current candidate head `3fd4bd298750cdc3287ddce1542abc0569d5c0e9`; it does not validate the later source changes. The complete manual gate needs to be rerun on the exact final candidate SHA before any promotion.
