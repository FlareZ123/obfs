# Eight positive-yield browser DOM source-serialization parity failures (classic and module)

**Date:** 22 November 2026. **Classification:** Intermediate, source-pinned compatibility counterexamples. **Affected version:** current COO identifier obfuscation, specifically programmatic `obfuscateFiles` with `sourceType:'script'`; no overall security claim.

## Reproduction and source pin

- Test program: [`sims/browser-dom-source-serialization-pair.js`](../sims/browser-dom-source-serialization-pair.js).
- Evaluated branch: `agent34/dom-serialization-red-first-20261122`, commit `8108a865134631d824320779b94d374c99f63c5a`. The branch adds only a focused Ubuntu Chromium invocation to the existing two-platform `manual-cross-readers.yml`.
- GitHub [run 45025990481](https://github.com/FlareZ123/obfs/actions/runs/45025990481), Ubuntu job `137219017964`, stage `Browser DOM serialization source-observer native/emitted parity`. Chromium actually executed three variants for each fixture using `--headless --dump-dom` on temporary `file:` HTML documents. The stage **failed intentionally** after logging all four variants of the mismatch. The separate Windows job **passed**, including its conventional cross-reader tests and strict JSDoc; the Chromium-only source-parity probe was skipped on Windows as configured. The whole workflow is red because of the Ubuntu parity failure.
- The expanded follow-up [run 45026381339](https://github.com/FlareZ123/obfs/actions/runs/45026381339), source `b2ad8a694f59a357f7652cf902f0f6ea439e7126` on the same evidence branch, added two **distinct** DOM source readers, `document.documentElement.textContent` and `new XMLSerializer().serializeToString(document)`. Its Ubuntu Chromium job `137220214050` reproduced the same native **8/true**, renamed **8/false** and compiler **8/false** with **two actual binding rewrites** for **all six** cases. The source/typed control and four earlier paths were unchanged. The new report therefore preserves the first exact source pin for the first four and a newer exact source pin for the full six-case population. This still does not establish an arbitrary-DOM proof or security advantage.
- Earlier first-case [run 45025809987](https://github.com/FlareZ123/obfs/actions/runs/45025809987) at `b71f3d6edefb21b5055d056901a2885acd645dc4` independently confirmed the `document.documentElement.outerHTML` mismatch, but stopped after the first failing assertion.
- A newer scope check [run 45026553206](https://github.com/FlareZ123/obfs/actions/runs/45026553206), evidence branch commit `10736c6004031a1966e6fe90250d97a93e04b3d9`, tests **inline ES modules** in addition to the six classic-script routes. Ubuntu Chromium job `137220736449` ran an inline `<script type="module">` body and waited for the `load` event in a separate untransformed host script before reading its result. Both module paths, `document.documentElement.outerHTML` and `new XMLSerializer().serializeToString(document)`, reproduced native **8/true**, renamed **8/false**, compiler **8/false** with **two eligible rewrites each**. The original six remained red with identical outcome. These module cases do not depend on `Document.currentScript`, which is null while a module script is executing in the relevant HTML Standard semantics. The test explicitly emits `sourceType:'module'` for those variants. Chromium confirmed module execution by returning the numeric result 8. The eight scoped variants should inform the same canonical integration contract.
- The initial [run 45025590020](https://github.com/FlareZ123/obfs/actions/runs/45025590020) at `bb3eed96653941a560b5b2b27cfac5f9db7228d5` had a **vacuous green** because a top-level classic-script `const` was not renamed; it must not be counted as positive transformation coverage. This mistake was corrected with a function-local variable and a separate positive control before the red-run evidence was recorded.

The fixture emits a **function-local** numeric binding `const privateNumber=input+5`, reads the currently embedded executable JavaScript through one of four DOM routes, and computes `sourceMatch=observed.includes("private"+"Number")`. The split constant ensures the source text's match comes from the variable's exact spelling rather than the lookup string itself. The negative control manually renames `privateNumber` to `q`. Every variant calls the same numeric computation. The compiler run sets `mode:'coo'`, `strings:false`, `identifiers:true`, a case-specific deterministic seed, and no host lock.

An otherwise identical **inert** executable script with no source observer is a positive transformation control: compiler reports **2 renamed bindings** and changed source, so the source-observing cases have an independently established eligible rewrite path.

## Real Chromium observations (six classic and two inline module routes)

| Embedded read | Original value / sourceMatch | Manually renamed control | Actual compiler emitted | Emitted rewrites |
| --- | --- | --- | --- | ---: |
| `document.documentElement.outerHTML` | 8 / true | 8 / false | 8 / **false** | 2 |
| `document.body.innerHTML` | 8 / true | 8 / false | 8 / **false** | 2 |
| `document.querySelector("html").innerHTML` | 8 / true | 8 / false | 8 / **false** | 2 |
| `document.getElementById("script-probe").textContent` | 8 / true | 8 / false | 8 / **false** | 2 |
| `document.documentElement.textContent` | 8 / true | 8 / false | 8 / **false** | 2 |
| `new XMLSerializer().serializeToString(document)` | 8 / true | 8 / false | 8 / **false** | 2 |
| **Inline module:** `document.documentElement.outerHTML` | 8 / true | 8 / false | 8 / **false** | 2 |
| **Inline module:** `new XMLSerializer().serializeToString(document)` | 8 / true | 8 / false | 8 / **false** | 2 |

All observations were read directly from Ubuntu job logs and all eight failed a genuine original-versus-compiler behavior assertion. The secondary manually-renamed control identifies the semantic dependence on source spelling; it is not the source of the compiler result. The output numeric value alone is insufficient to establish semantic equivalence.

## Platform semantics and authoritative references

The [WHATWG HTML Standard](https://html.spec.whatwg.org/multipage/scripting.html) defines script-element text and textContent semantics for inline JavaScript, and its [Document section](https://html.spec.whatwg.org/multipage/dom.html) defines the active classic-script relationship of `Document.currentScript`. [MDN Element.outerHTML](https://developer.mozilla.org/en-US/docs/Web/API/Element/outerHTML) documents serialization of an element **including descendants**; [MDN Element.innerHTML](https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML) documents serialization of descendants. [MDN Node.textContent](https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent) explicitly includes text from `script` and `style` descendants. These references explain why source-preserving behavior is plausible for the selected DOM reads, while the executable Chromium runs above are the actual compatibility evidence. An external-`src` script element has different child text semantics; no claim is made that these exact inline DOM reads reveal the response body of an external script.

## Why the compiler admitted the rewrite

At the evaluated mainline `src/ast.js` blob `fded5c8451a07dc5c249a7decdbf4eaa445eea03`, the `observesDistributedSource` function had no literal handling of `document`, `currentScript`, `documentElement`, `getElementById`, or `querySelector`. That syntactic observation is consistent with the observed two renamed bindings. The older abandoned Agent 34 DOM source guard [PR #56](https://github.com/FlareZ123/obfs/pull/56) was not merged and described these four routes as beyond its scope. Real Chromium proves the selected document-element/serialization paths can expose own embedded executable bytes.

Other DOM reads can preserve normal positive renaming yield, for example a benign `document.title`; a global veto on all `document` references would sacrifice valid rewrites. Covering these eight scoped variants does not establish proof for aliases, borrowed DOM methods, cross-frame traversal, DOM mutation timing, cross-module source access, or delegated callbacks. A sound broader contract needs explicit conservative treatment of unproved source-bearing DOM object graphs.

## Two-file inline ESM import graph: local source observation with imported positive yield

A separate [real Chromium two-module HTTP graph reproducer](../sims/browser-dom-module-graph-source-boundary.js) now exercises a realistic dependency boundary. The browser receives an HTML page with an **inline ESM entry** and a separate same-origin `lib.mjs`, which the entry imports via `import {answer} from "./lib.mjs"`. The library computes the primitive answer with an unexported private helper; its full source is served as an ordinary external JavaScript response and is **not embedded** as a script text node in this HTML document. The inline entry reads `document.documentElement.outerHTML`, which contains its own exact source, and compares the split lookup `"private"+"Number"` against its local function binding.

At source `195f6e36fba3b0a4a7c72d2f8c63726d28959da2`, [run 45026967168](https://github.com/FlareZ123/obfs/actions/runs/45026967168), **Ubuntu real Chromium** job `137221995350` executed both native and COO-protected versions from an isolated localhost HTTP server. The decisive log is:

```json
{"native":{"value":8,"sourceMatch":true},"emitted":{"value":8,"sourceMatch":false},"entryMetrics":{"literals":0,"objects":0,"properties":0,"bindings":1},"libraryMetrics":{"literals":0,"objects":0,"properties":0,"bindings":2},"entryChanged":true,"libraryChanged":true}
```

The test enforced an original graph output of `8/true` and independently required **positive rewrites in both modules**. It then failed only on actual compiler-versus-native source-observation parity. The exact emitted graph retained numeric behavior while changing the entry's source spelling. An HTML host script external to the compiled input waits for `load` and serializes the result, preventing benchmark instrumentation from masquerading as a code source observer. The test fixes two module files with explicit paths and checks the actual runtime import over HTTP.

**Integration consequence:** a sound source-observer guard should preserve or conservatively refuse transformations to the inline entry whose source is disclosed by the DOM. Independently imported library-local code remains eligible for useful identifier renaming under these exact observed semantics. A whole-graph blanket refusal can restore parity at the expense of this independent positive yield; any finer proof needs evidence that a module is unreachable through other source-readers. This is an admission/compatibility boundary, not incremental anti-analysis resistance. No arbitrary browser-plugin, hostile-hook, import-map, or `Function#toString` safety proof is inferred.

### Current implementation-wide refusal boundary

At the evaluated `src/core.js`, `remoteSourceObserver` uses a **single boolean for the whole prepared group**: if any source file has `observesDistributedSource` (or multi-file `observesFunctionSource`), identifier renaming is skipped in every file (`if(!remoteSourceObserver && options.identifiers!==false)`). Existing `experimentalSourceObserverIslands` can selectively permit proved local **property** renaming for chosen ESM leaves; it does not make independent library **identifier** renaming available when the group-wide source-observer flag is set. Thus a simple correct integration that detects DOM reads and activates `remoteSourceObserver` will likely preserve these entry scripts by **refusing the entire two-file graph**. That is a defensible conservative compatibility decision, with **zero independent library identifier protection yield** on the measured example. The graph test's positive library metrics are a measured property of the *currently unguarded* compiler. To retain them after repairing parity would require a separate, source-reachability-specific refinement of the graph proof, validated against hostile external source readers and cross-file aliases. No such refinement is yet implemented or claimed safe.

## Two same-source graph deployments, different source exposure

An independently authored [two-host graph fixture](../sims/browser-dom-module-host-embedding-indistinguishability.js) tests whether being imported as an external ESM library is sufficient evidence for source-observation immunity. **It is not**, when the compiler receives only the JS graph and the deployment's HTML assets can vary.

Both deployments are built from the **same two input modules** and the **same single pair of compiler outputs**. The inline module imports `lib.mjs` and reads the whole document's `outerHTML`, testing for the imported helper name via `"hidden"+"Worker"`. Host **external** serves the external module and embeds no copy of its source in the document. Host **mirrored** serves the same module and additionally embeds its exact current source bytes in an inert `<script type="text/plain">` node. Browser code and compiled module bytes are identical between the two hosts; only the HTML packaging changes. In the mirrored original, source text contains `hiddenWorker`. In the mirrored compiled host, the copied emitted module has renamed that identifier.

Frozen source pin `c4c39e71eda9a890a364f06f9e53a256ba9e817a`, [run 45027445452](https://github.com/FlareZ123/obfs/actions/runs/45027445452), real Ubuntu Chromium job `137223450277`, produced this **passing standalone experiment**:

```json
{"sourceType":"module","externalNative":{"value":8,"sourceMatch":false},"externalEmitted":{"value":8,"sourceMatch":false},"mirroredNative":{"value":8,"sourceMatch":true},"mirroredEmitted":{"value":8,"sourceMatch":false},"entryBindings":1,"libraryBindings":2,"sameCompiledBytesInBothHosts":true}
```

Every result came from actual native or compiled ESM imports served by the fixture's loopback HTTP server and observed by real Chromium. The fixture first verifies that the imported library's source truly loses its original private identifier under compiler output. The external-only host preserves behavior even while renaming the library's helper, whereas the mirrored host **changes** its source-dependent observation. The test's assertions pass. The **workflow as a whole remains red** because a separate, previously established source-parity negative test follows and deliberately fails.

This is a bounded **two-deployment indistinguishability witness for JS-only source analysis**. Source graphs alone do not establish which module source bytes a downstream HTML host embeds. A universal source-preservation guarantee across arbitrary host packaging therefore needs conservative group-wide refusal or a verified asset/deployment contract binding the JS sources to the actual published HTML. The existing `src/html-assets.js::assertNoInlineHtmlSource` explicitly declines published HTML assets containing script-element text, including inert text payloads; if the complete host HTML is supplied as a reviewed asset, this distinct preflight can prevent such an unreviewed source mirror. The counterexample deliberately keeps host HTML outside the compiler input to test that information boundary. It does **not** show the HTML asset preflight failing when those assets are supplied.

This result qualifies the earlier independent-library positive-yield suggestion: retaining rewrites in sibling modules can be sound for an independently proved deployment, while blindly assuming that all imports are source-invisible would be unsafe. The two existing architectures, **single group-wide source-observer refusal** or **asset-proven per-file visibility**, have different precision and proof obligations. No new source-reachability algorithm or universal guarantee is claimed.

## Threat, compatibility and performance limitations

These are **eight finite semantic mismatches**, not proof of generalized property analysis unsoundness or of an attacker resisting reverse engineering. Source reflection by the executing classic script is part of its observable program behavior. The measured 8/true versus 8/false difference makes byte-preserving transformation or explicit refusal necessary for this input under the 1:1 parity objective.

No strict 2.5× performance conclusion is drawn: the test only checked functional equivalence and rewrite count. The COO attacker already controls client-side execution and public source; this red does not establish additional hostile-environment protection. There is no reason to change the repository's **RELEASE-BLOCKED** decision.

## Integration ownership

The established canonical source-observation integration owner is Agent 3. A direct [four-case evidence handoff](../communications/agent3/20261122T1311Z_agent34_four-dom-source-observer-parity-red.md) requests these as red-first tests for the existing source-observer suite while preserving a benign DOM positive-yield control. The historically stale browser DOM [PR #56 handoff](../communications/agent3/20261122T1301Z_agent34_dom-inline-source-pr56-handoff.md) was archived unmerged; importing its patch wholesale into current main is not supported by a current cross-pass integration pin.
