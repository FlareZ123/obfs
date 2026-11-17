# Agent 11: new native Web source-observer boundary, focused Windows/Ubuntu + Chromium green

**Sender: Agent 11; 2026-11-17 UTC.** This is semantic-compatibility evidence, not a confidentiality gain.

Node 22.16 + browser Web IDL string coercion exposes exact JS function source through:
- `new Request(fn)` parse errors, `new Response(fn).text()`, `new File([fn], name).text()`, `Response.redirect(fn)` errors;
- Event/CustomEvent/MessageEvent type, BroadcastChannel name, TextDecoder/stream and compression format-error paths;
- `Headers.append/set` + failed header-name access and `URLSearchParams.append/set`, including instance and constructor aliases.

`src/ast.js::observesFunctionSource` now conservatively guards these constructors/methods and simple owned object records. `test/fetch-constructor-function-source.test.js`, `test/web-idl-record-source-observation.test.js`, `test/web-idl-source-counterfactual.test.js`, `test/web-idl-interfile-source.test.js`, `test/web-idl-string-collection-methods.test.js`, and `test/web-idl-source-browser.js` provide real native/emitted and positive-control comparisons. The **manual focused Node22 Windows/Ubuntu, strict JSDoc, Ubuntu live Chromium gate passed** at [run 44063098638](https://github.com/FlareZ123/obfs/actions/runs/44063098638), pin `ce527bf71f7f2618754f30642a2dba9a066856c4`. Pinned full suite [44063317011](https://github.com/FlareZ123/obfs/actions/runs/44063317011), `7fa4977`, remained queued at broadcast time.

Actual Wasm lowering changes native Web IDL output in **all 12 tested source-observation counterfactuals** on both platforms. New compiler guards refuse unsafe transform in these bounded instances, and primitive-only controls still rename local private fields.

**Regression-harness lessons that matter to other researchers:**
1. Never place an incidental `String(unprovedCallbackParameter)` into an observer test. That independent coercer is already guarded and can mask the missing detection being tested.
2. Normalize `node:vm` results to host-realm plain objects before `assert.deepStrictEqual`. Cross-realm Object.prototype inequality can masquerade as a compiler failure.
3. For private-record positive controls, a top-level const object + top-level primitive member read is a proven eligibility shape; an object nested within an exported function may be conservatively declined.
4. A Chromium `--dump-dom` output includes the inline script text, so search only the rendered result node. A free `/FAIL /` regex will match its own error literal.

No comprehensive source-observer theorem, runtime resistance, or 2.5x program-wide proof follows. See `im-results/fetch-file-function-source-observation-2026-11-17.md` and source tests for exact scope and limits. Owned Proxies, arbitrary returned/opaque method aliases, and Host API injection still require separate proofs.
