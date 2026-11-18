# Node 22 URL static parser source-observation boundary (Agent 11, 2026-11-18)

## Decision and scope

**Result: scoped semantic-compatibility repair.** Node 22.16.0 native `URL.parse(functionValue, "https://example.test/").href` embeds the function's original `Function#toString` text as an encoded URL pathname. Obfuscating an otherwise private property or binding within that function can change returned URL bytes. The existing AST source-observer admission gate handled `new URL(...)` and instance setters, but did not recognize native static `URL.parse`. `URL.canParse` applies related string conversion; its boolean return does not by itself constitute equivalent source-extraction evidence.

The new `src/ast.js::observesFunctionSource` handling conservatively declines source rewriting when a native URL static parser receives an operand that cannot be proved primitive. It tracks direct access, a global receiver, constructor and static method aliases, destructuring, an owned local object property, bound methods, `Function#call/apply`, `Reflect.apply` and a runtime-computed method key. The native static parser does not need generated helper instructions at runtime. Other opaque method receivers, external monkey patches, and arbitrary interprocedural forwarding are outside the finite syntax proof.

## Reproducible red/green

- Exact red workflow: [44256744881](https://github.com/FlareZ123/obfs/actions/runs/44256744881), source `d2a6f02d80dd634c9eccececb5397d07e4175f72`. Both Ubuntu and Windows fail **all 11 URL.parse source-observer assertions**, each because `observesFunctionSource` returned `false` for real native source-changing counterfactuals. The overall red workflow had 12 failed tests on each OS; do not attribute the twelfth to this URL fix without independent triage.
- Implementation commit: [99152dad109942f6bf7430611e2142992ea9df08](https://github.com/FlareZ123/obfs/commit/99152dad109942f6bf7430611e2142992ea9df08).
- Exact green workflow: [44257275339](https://github.com/FlareZ123/obfs/actions/runs/44257275339), evaluated source `441c59a9b363238ba96765a411987f5c78301612`. It is two commits ahead of the implementation, including unrelated fixture/research changes. Both Node22 Linux and Windows jobs pass the focused test command and strict JSDoc; Ubuntu also passes two real Chromium integration steps. The ancestry comparison confirms the implementation commit is included.
- Focused test: `node --test test/url-static-function-source.test.js`. Its **16 source-bearing negative cases** execute unmodified and emitted COO/SNO/SCO CommonJS against real Node `URL`, assert native source visibility, and check refusal metrics. **13 primitive positive cases** check output equality and that one unrelated private property is still really rewritten. The separate workflow executes the test alongside the existing Web IDL suites. Use `npm run typecheck` for static checking.

**Owned URL constructor follow-up (same day).** Five more native cases exercised an owned `URL` constructor, its local record alias, destructuring the constructor, a prebound source argument, and method destructuring. Four additional primitive controls verify real private-key rewriting. The exact [red run 44257734785](https://github.com/FlareZ123/obfs/actions/runs/44257734785) at source `150780c4b4053a15ad3fa97473a11c20b1b0b7bc` failed exactly the three owned-constructor source assertions on **both OS**, while all other new cases passed. Fix [35c027f01372bf046f927d3788047476d5985158](https://github.com/FlareZ123/obfs/commit/35c027f01372bf046f927d3788047476d5985158) adds a monotone record-property map for native `URL` constructor provenance and follows local aliases and destructuring. Exact [green run 44257861813](https://github.com/FlareZ123/obfs/actions/runs/44257861813) at that same source passed both Node22 OS, strict JSDoc and both Ubuntu Chromium regression checks. This preserves the same narrow source-observer scope and leaves unproved opaque interprocedural flows outside admission.

The test's `replaceAll('secretField','renamedField')` counterfactual is essential: it demonstrates an actual native output change before measuring scanner behavior. This is stronger evidence than a textual API classification alone.

## Cross-module source observation and selected Wasm counterexample

The original nonselected three-module ESM fixtures passed because the directly exported function was left unchanged for existing export-boundary reasons. A deliberately added test asserting this fixture must transform failed identically on both OS ([run 44258714068](https://github.com/FlareZ123/obfs/actions/runs/44258714068)); **that was a poor positive fixture**, not a compiler defect. It was replaced with a stronger selected-backend falsification rather than weakening a source guard.

A three-file static ESM graph now explicitly selects `inspect(a){return a^17;}` for Wasm lowering in `logic.mjs`, exports `URL.parse` through immutable aliases in `parser.mjs`, and imports both functions in `observer.mjs`. An actual standalone `lowerWasmI32Functions` counterfactual emits one Wasm function and changes the observed native URL string; the selected `obfuscateFiles` previously *accepted* the same input. Pinned [red 44258973320](https://github.com/FlareZ123/obfs/actions/runs/44258973320) at `c00c28ab98cdab0e992f3f4756d0c95cd60fe8eb` reproduced both unsafe selected-admission cases on **both OS**.

The repair adds `collectVerifiedImportedUrlStaticAliases` in `src/cross-properties.js`, a finite monotone alias collector restricted to exact named/default ESM imports from files in the supplied group, uniquely bound immutable exported constructors and native parser aliases. `observesFunctionSource` now accepts this proof as an optional sixth argument and bypasses cached opaque-import decisions when proof exists. `src/core.js`, `src/sco.js`, and the closed-world property pass all feed native-parser import proof into group-wide source observation *before* emitted code changes.

Pinned [green 44259457333](https://github.com/FlareZ123/obfs/actions/runs/44259457333) at `be42fbf36f9a300e5fa10a414148166aa8941519` passed the two targeted Wasm-refusal cases on both OS, together with the primitive-URL selected-Wasm positive, 16 local native URL observers, 13 local primitive positive controls, strict JSDoc, and the existing two Chromium regression steps. The exact red→green source interval comprises commits `0071417`, `bc7ae3b`, `ed53936`, `77b20bb`, and `be42fbf`.

**Scope:** direct ESM exports and simple immutable aliases with canonical local imports, plus existing same-module URL aliases. Dynamic import specifiers, runtime-computed reexports, opaque external library methods, hostile URL monkey patches and arbitrary interprocedural return flows are not analyzed. The repaired backend *refuses* selected Wasm rather than silently publishing output with a changed source-observation contract. It does not make the WASM backend more confidential or satisfy a workload-wide performance budget.

## Tradeoff and limitations

- **Semantic preservation:** verified for enumerated source-bearing and primitive fixtures on the pinned OS/Node combination; not a proof for arbitrary reflective, distributed or hostile-host programs.
- **Static reconstruction and dynamic analysis:** not improved. Source-observer refusal can leave more original code visible, so it may reduce obfuscation coverage for affected programs.
- **Tampering and unauthorized execution:** no new resistance.
- **Performance:** the fix adds compile-time analysis and no runtime instruction. The tests validate normal output parity, but there is no universal 2.5× application-cost result for this change.
- **Browser scope:** the native source-extraction differential uses Node 22's URL implementation. The integrated Chromium checks passed as regressions; a new browser-specific `URL.parse` native/emitted witness was not established by this test.

## Next falsification targets

Test methods detached through opaque runtime records, cross-file imported static-method aliases, and the exact browser implementation's API support. Prefer counterexamples demonstrating changed emitted output plus primitive controls. For a release decision, prioritize independent equal-trust attacker-cost and strict paired workload budgets over expanding this source-observer list alone.
