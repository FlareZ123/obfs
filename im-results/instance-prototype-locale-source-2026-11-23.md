# Declared ESM prototype method `toLocaleString` exposes rewritten source (23 November 2026)

**Status:** reproducible former mainline compiler semantic defect, repaired and merged to `main` with source-pinned full Ubuntu/Windows and real-browser checks. Nested destructuring remains separately investigated. This is a **compatibility** finding. It does not establish confidentiality, tamper resistance or an application-independent 2.5× bound.

## Contract and minimal witness

The exact closed ESM graph (supplied to `obfuscateFiles` in full) contains `owner.mjs` exporting `{secretField:7}`, `state.mjs` importing the owner and exporting `const instance=new Reader()` where `Reader.prototype.read()` returns `owner.secretField`, and `consumer.mjs` that reads:

```js
const source = Object.getPrototypeOf(instance).read.toLocaleString();
```

This is a source observer: native `Object.prototype.toLocaleString` delegates to the callable receiver's `toString` and, in Node 22.23.4, returns exactly `read(){return owner.secretField;}`. The observer is **inside** the compiler's declared input graph, so the usual integrator `closedWorld:true` premise is satisfied for this test. The previously documented *omitted external consumer* scenario is a different, narrower deployment-contract limitation.

## Source-pinned negative and proposed repair

- Before repair: branch source `50fbd345f645efe2ea5165bc3b6000bb7bd3ed9b`, focused [Linux/Windows run 45098531246](https://github.com/FlareZ123/obfs/actions/runs/45098531246), **RED** in COO and SNO. The observable `source` changed to `read(){return owner._p4580b229bec7;}` (COO) and `read(){return owner._p3c595fae4ec7;}` (SNO). The numerical `value=7` and `privateValue=13` remained equal. All preceding source-parity and private-yield controls were green.
- Cause: in `src/ast.js`, `observesFunctionSource` treated `.toLocaleString` as a source observer only when its receiver was syntactically proven to contain a function, whereas `.toString` guarded any receiver not proven primitive. A method obtained indirectly through an exported class instance is callable at runtime but not represented in the local syntactic function-carrier summary.
- Repair: branch source `dd552b81c1bfac48c50110880930fd209f20687e`, make `toLocaleString` share the `toString` / `toSource` conservative opt-out for any receiver that `isDefinitelyPrimitive` cannot prove. Focused [Linux/Windows run 45098638387](https://github.com/FlareZ123/obfs/actions/runs/45098638387) **GREEN** for the exact witness and original controls.
- Protected-work positive: source `e9aaa410de88f8bc91128c19a6fb029ac3ae634a`, [Linux/Windows run 45098696869](https://github.com/FlareZ123/obfs/actions/runs/45098696869) **GREEN**, including `nativeNumber.toLocaleString('en-US')` on a proven primitive receiver in the same input graph as a protected exported record; at least one safe private property rewrite remains.
- Dynamic computed selector: source `da94584343ccfcccfc2cc5c29f35350dc3b3130f`, [Linux/Windows run 45098773750](https://github.com/FlareZ123/obfs/actions/runs/45098773750) **GREEN**, where `const selector=true?'toLocaleString':'valueOf'` is used to select a prototype method dynamically. That specific pattern showed correct behavior after repair; no claim about arbitrary dynamic selectors follows.
- Captured method, single-element array locale formatting, `Object.prototype.toLocaleString.call` and `String` native coercion: source `d84067cbcb8caca59c279ce229d851317b07ba15`, [Linux/Windows run 45098966591](https://github.com/FlareZ123/obfs/actions/runs/45098966591) **GREEN** for these four additional declared-graph graphs.

The conservative guard may refuse a transform when the runtime receiver is not a function. This is an intentional soundness-over-yield tradeoff; tests require the unrelated proven primitive positive to retain at least one rewrite. Broader performance/coverage effects require full mainline validation. The editable test is `test/external-instance-prototype-source.test.js` on branch `agent9-instance-locale-source-20261123`.

## Current limitations

The fixed local syntax scan is not a type-and-effect proof for arbitrary host hooks, overridden prototypes, dynamic computed properties, remote callers or unlisted modules. Source-preserving tests do not prove confidentiality against a fully controlled runtime. SCO HTTP output and real Chromium source checks have passed on pinned repair revisions, with a source-matched mainline follow-up queued. Do not promote to the established `results/` index or release on focused assertions alone.

A direct notification to the source-observation integration owner is saved in `communications/agent3/20261123T021358Z_agent9_method-tolocalestring-red-green.md`.

## Repair verification and main integration

The normative [ECMAScript 2026 §20.1.3.5](https://tc39.es/ecma262/2026/multipage/fundamental-objects.html#sec-object.prototype.tolocalestring) explicitly requires `Object.prototype.toLocaleString` to invoke the receiver's `toString`. Thus an inherited method on a function can reveal the callable's exact source text without a syntactic `.toString()` call.

A first broad `.toLocaleString()` refusal made the earlier direct source case pass but failed a known valid optimization: an untouched `Number.prototype.toLocaleString` reference with primitive format options suppressed unrelated private-field renaming. The full [Ubuntu/Windows run 45098889155](https://github.com/FlareZ123/obfs/actions/runs/45098889155) failed this expected rewrite-yield assertion. The repaired guard exempts an unshadowed native `Number.prototype.toLocaleString` member read, while other receiver source reads are refused unless a primitive is proved. [Native locale focused Linux/Windows gate 45100755067](https://github.com/FlareZ123/obfs/actions/runs/45100755067) passed on the broad repair. Ambient patched builtins remain outside any proof of absolute safety.

A second declared-graph issue appeared with `const fn=instance.read;const {toString:reader}=fn;reader.call(fn)`: the source scan guarded destructuring only when the initializer was syntactically known function-bearing. Both modes changed the source despite the declared consumer, [paired red run 45099384247](https://github.com/FlareZ123/obfs/actions/runs/45099384247). Simple aliases through `function identity(x){return x;}` were also red in [run 45099901767](https://github.com/FlareZ123/obfs/actions/runs/45099901767). The merged detector now treats unproven destructuring receivers as potentially callable and refuses source-affecting edits when a source-method key is acquired. A *fresh inline ObjectExpression* with only fixed own primitive literal data fields is one limited exemption under the native-realm contract. This exemption was explicitly tightened after comparing broader and more selective candidates; an independent private field remains rewritable in the proven-inline-record case.

- Full manual [Ubuntu/Windows run 45101078830](https://github.com/FlareZ123/obfs/actions/runs/45101078830) **SUCCESS**, pinned compiler and tests at branch commit `14a2816ab2373b3efcbb3c6420667a037baa70fa`. This included the full behavioral/adversarial suite, strict project/external JSDoc, and sampled integration/performance checks. The browser test is a separate workflow.
- [Real Chromium manual run 45100767704](https://github.com/FlareZ123/obfs/actions/runs/45100767704) **SUCCESS** for the newly expanded `test/instance-prototype-source-browser.js`, comparing real HTTP ESM native/compiled outputs under restrictive CSP for `.toString()` and `.toLocaleString()`; its source pin `3a358c66600c58fa1757d7c7406422141262f4ed` predates the final literal-only inert-proof refinement (the refined tests passed separately).
- [SCO HTTP focused Ubuntu/Windows run 45101400370](https://github.com/FlareZ123/obfs/actions/runs/45101400370) **SUCCESS** against the updated `test/sco-instance-prototype-source.test.js`, including the newly declared `.toLocaleString()` source-read path, at pin `14a2816a...`.
- Exact branch-compiled `src/ast.js` source at `14a2816a...` merged to `main` in commit `281c7a825fa3f8b5fc5a9009854478bcc216e2ab`; attached COO/SNO regression commit `873d60fe6316dc45125c8b9212b70ca637538cc3`, SCO case commit `57ef1fa1717b139a3566e34040b6ec121cc49e69`, browser script commit `10de5c65179e5d1546670e8ffb66c25df2155e82`.

### New nested observer scope under test

After this integration, a second independent branch `agent9-nested-source-pattern-20261123` demonstrated that nested destructuring `const {method:{toString:reader}}=packet` and array destructuring `const [{toLocaleString:reader}]=[instance.read]` expose source despite the merged first-level guard. Both COO and SNO on Ubuntu/Windows failed exact source parity in [red run 45101761729](https://github.com/FlareZ123/obfs/actions/runs/45101761729) at pin `598babf5e4885da1a750d91e6093e27a5007bd48`. A recursive pattern scanner on branch commit `6254d341743a5c43ef1300072971f40615892422` made these and the earlier tests pass the [Linux/Windows focused gate 45101893768](https://github.com/FlareZ123/obfs/actions/runs/45101893768); its full suite is separate and must pass before any promotion. These source-pinned results are independent of mainline integration.

This report remains intermediate evidence because the wider hostile runtime, dynamic source extraction, and protected-work yield claims remain limited by the documented threat model and the particular input graphs under test.
