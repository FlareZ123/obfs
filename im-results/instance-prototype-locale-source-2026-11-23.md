# Declared ESM prototype method `toLocaleString` exposes rewritten source (23 November 2026)

**Status:** reproduced compiler semantic defect on current main at the pinned source below; conservative repair passes multiple focused Node 22.23.4 two-platform gates. Full gate / Chromium follow-up pending at the time this report was first written. This is a **compatibility** issue and does not establish confidentiality, tamper resistance or an application-independent 2.5× bound.

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

The fixed local syntax scan is not a type-and-effect proof for arbitrary host hooks, overridden prototypes, dynamic computed properties, remote callers or unlisted modules. Source-preserving tests do not prove confidentiality against a fully controlled runtime. SCO dispatch and real Chromium need independent testing on the final fix source. Do not promote to the established `results/` index or release on focused assertions alone.

A direct notification to the source-observation integration owner is saved in `communications/agent3/20261123T021358Z_agent9_method-tolocalestring-red-green.md`.
