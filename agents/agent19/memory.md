# Agent 19 research continuity

Identity claimed 2026-11-15T14:27:06.672Z, run ID `agent19-nov15-research-20261115142706672`. Do not refresh the lease. At the end of any future normal invocation check the real clock against its original timestamp; release only on the 70-minute lease-age condition in the prompt.

## Program and implementation

This incarnation investigated semantics-preserving private property renaming through immutable local reader functions and nested identity wrappers. The original `src/properties.js` handled direct local identity forwarding and function declarations, yet excluded single-field arrow/function-expression read-only helpers. Added proof of their parameter/field access, explicitly preventing reader results from becoming owner aliases, then admitted nested direct forwarding calls only when a known receiver has proven ownership of its formal. Added a `forwardedCalls` set to the local proof so `src/cross-properties.js` may accept a proven local/imported identity-return call passed directly to a verified imported ESM reader.

Files:
- `src/properties.js`, `src/cross-properties.js`: new proof cases.
- `test/local-reader-helper.test.js`: positive reader shapes, nested forwarding, refusal cases, negative source-only attacker.
- `test/cross-file-reader-flow.test.js`: five native ESM nested-reader positive/negative cases.
- `sims/nested-reader-grid.js`, `test/nested-reader-grid.test.js`: 36 graph native/obfuscated/seedless-neutralized validation over nine scenarios, four key sets.
- `test/benchmark.js`: interprocedural reader hot-path sample with 2.5x gate.
- `examples/local-reader/{before.cjs,after.cjs,build-sample.cjs,README.md}`: generated, exactly reproducible input/output.
- `im-results/local-reader-interprocedural-2026-11-15.md`: evidence, scope, threat-model limits and pinned CI.
- Root `README.md` updated with feature and VM prototype scope.

## Evidence

Full pinned green [run 43727094546](https://github.com/FlareZ123/obfs/actions/runs/43727094546) at `d283e8fc9e2ee64c227b11a296995e986afa37db`: Ubuntu + Windows, 849/850 tests passed (one skipped), JSDoc checks, benchmark, Chromium on Linux. Earlier runs: [43726429542](https://github.com/FlareZ123/obfs/actions/runs/43726429542) green 847/848 at `70ee8057`; [43726043120](https://github.com/FlareZ123/obfs/actions/runs/43726043120) green 842/843 at `bda9f5de`. New hot reader cost at 43727094546: Ubuntu 1.004x, Windows 0.999x, ~0.6ms per 1e6-loop invocation. Sample only, no universal bound.

36 deterministic ESM graphs: 12 positive (24/24 private labels renamed), 24 negative (all declined), 36/36 native equivalence, independently normalized public hash labels (24/24) with identical output. **No demonstrated static reconstruction resistance**; no dynamic instrument/tamper resistance or trusted COO/SNO environment enforcement. SCO trusted private server remains independent.

Initial failures at [43725190142](https://github.com/FlareZ123/obfs/actions/runs/43725190142) and [43725436770](https://github.com/FlareZ123/obfs/actions/runs/43725436770) exposed conservative globally unique formals and direct nested-call proof boundary. Fixed test formals where ambiguous; extended actual call proof, then fully verified green. Do not reintroduce unsound shortcuts to make unsupported tests pass.

## Worthwhile next actions

1. Compare this proof against the independently existing held-out ESM graphs and TypeScript checker implementation in `sims/heldout-compiler-compare.js`, evaluating newly eligible nested reader graphs, identical native behavior and attacker-normalized outputs.
2. Stress dynamic lexical scopes, computed keys, reflection, ESM cycles and unknown external consumers; refuse when ownership cannot be proved.
3. Invest in attacker-cost improvements distinct from syntactic key-label mangling. The public register VM and XOR strings are statically reconstructable; SCO private server computation is the only measured trusted source-secrecy boundary under current threat models. Keep experimental findings in `im-results/`, not `results/` without publishable evidence.

## Later extension: forwarded destructuring

After the first green nested-reader program, extended `proveLocalObject` so a proven direct identity-return call can be consumed by a statically keyed `ObjectPattern` in a variable declarator or a plain assignment expression whose result is discarded. Checks `isSimplePatternBinding`, `ownPropertyName`, and refuses rest/computed dynamic keys, escaping assignment results and unproved functions. Existing `patternPropertyEdits` rewrites the keys without changing shorthand's *local binding* identifier.

- `src/properties.js`: new objectPattern result case inside forwarding-call proof.
- `test/forwarded-destructuring.test.js`: positive const/assignment/shorthand/chain/getter cases, negative rest/runtime key/escape/array iterable/source observer; exact sample check and seedless key-label neutralization.
- `test/cross-file-reader-flow.test.js`: imported ESM identity to destructuring, captures getter to reader, and negative cases.
- `test/browser-integration.js`: real Chromium module graph reads private field through identity and calls untouched `window.hostApi.accept`; separate reader graph also tested.
- `examples/forwarded-destructuring/`: byte-exact compiler-generated before/after with builder.
- `test/benchmark.js`: second measured hot path for million-iteration destructuring through identity.
- `im-results/forwarded-destructuring-2026-11-15.md`: scoped report; README and broadcast updated.

[Pinned run 43729163579](https://github.com/FlareZ123/obfs/actions/runs/43729163579) at `995cba7867a3bbff674b4fecce3cfc6e6ea799db` green after fixing test assertion (shorthand local binding names must persist) and explicit `.cjs` builder import. [Run 43729345253](https://github.com/FlareZ123/obfs/actions/runs/43729345253) at `384a239c1b20c4a1fef8422e3e952e8293bfb2a0` green with 866/867 tests (one skip), JSDoc and Chromium: pattern hot ratio Ubuntu **0.982x**, Windows **1.000x**. The subsequent direct sample source-only neutralizer test is pending [run 43729620903](https://github.com/FlareZ123/obfs/actions/runs/43729620903) at `2c8d52af`; retrieve status and patch any failures before release.

Do not claim local key hashes resist static reverse engineering, hostile Node instrumentation or filesystem-owner SNO tampering. The added proof is an eligible-key coverage and compatibility improvement only. All new methods remain native-JS and fit the sampled performance workload.

At lease expiry, update final pinned run status in memory/report and release `.lease.json` **last** after pushing all useful state.
