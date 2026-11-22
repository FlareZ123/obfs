# Eleven positive-yield browser DOM source-observation parity failures (classic and module)

**Date:** 22 November 2026. **Classification:** Intermediate, source-pinned compatibility counterexamples. **Affected version:** current COO identifier obfuscation, specifically programmatic `obfuscateFiles` with `sourceType:'script'`; no overall security claim.

## Reproduction and source pin

- Test program: [`sims/browser-dom-source-serialization-pair.js`](../sims/browser-dom-source-serialization-pair.js).
- Evaluated branch: `agent34/dom-serialization-red-first-20261122`, commit `8108a865134631d824320779b94d374c99f63c5a`. The branch adds only a focused Ubuntu Chromium invocation to the existing two-platform `manual-cross-readers.yml`.
- GitHub [run 45025990481](https://github.com/FlareZ123/obfs/actions/runs/45025990481), Ubuntu job `137219017964`, stage `Browser DOM serialization source-observer native/emitted parity`. Chromium actually executed three variants for each fixture using `--headless --dump-dom` on temporary `file:` HTML documents. The stage **failed intentionally** after logging all four variants of the mismatch. The separate Windows job **passed**, including its conventional cross-reader tests and strict JSDoc; the Chromium-only source-parity probe was skipped on Windows as configured. The whole workflow is red because of the Ubuntu parity failure.
- The expanded follow-up [run 45026381339](https://github.com/FlareZ123/obfs/actions/runs/45026381339), source `b2ad8a694f59a357f7652cf902f0f6ea439e7126` on the same evidence branch, added two **distinct** DOM source readers, `document.documentElement.textContent` and `new XMLSerializer().serializeToString(document)`. Its Ubuntu Chromium job `137220214050` reproduced the same native **8/true**, renamed **8/false** and compiler **8/false** with **two actual binding rewrites** for **all six** cases. The source/typed control and four earlier paths were unchanged. The new report therefore preserves the first exact source pin for the first four and a newer exact source pin for the full six-case population. This still does not establish an arbitrary-DOM proof or security advantage.
- Earlier first-case [run 45025809987](https://github.com/FlareZ123/obfs/actions/runs/45025809987) at `b71f3d6edefb21b5055d056901a2885acd645dc4` independently confirmed the `document.documentElement.outerHTML` mismatch, but stopped after the first failing assertion.
- A newer scope check [run 45026553206](https://github.com/FlareZ123/obfs/actions/runs/45026553206), evidence branch commit `10736c6004031a1966e6fe90250d97a93e04b3d9`, tests **inline ES modules** in addition to the six classic-script routes. Ubuntu Chromium job `137220736449` ran an inline `<script type="module">` body and waited for the `load` event in a separate untransformed host script before reading its result. Both module paths, `document.documentElement.outerHTML` and `new XMLSerializer().serializeToString(document)`, reproduced native **8/true**, renamed **8/false**, compiler **8/false** with **two eligible rewrites each**. The original six remained red with identical outcome. These module cases do not depend on `Document.currentScript`, which is null while a module script is executing in the relevant HTML Standard semantics. The test explicitly emits `sourceType:'module'` for those variants. Chromium confirmed module execution by returning the numeric result 8. The eight scoped variants should inform the same canonical integration contract.
- The focused further [run 45028008707](https://github.com/FlareZ123/obfs/actions/runs/45028008707) at `6611c0afeb01e665a7ca20b58becb60dbe6d39ab`, Ubuntu Chromium job `137225157804`, additionally proved three **DOM traversal** routes: a `TreeWalker` over document text nodes, a cloned `Range` reading fragment text, and the inline script's first `Text.data` child. Each case individually reproduced native **8/true**, deliberately renamed **8/false**, and actual emitted COO **8/false**, again with **two identifier rewrites**. The independent inert positive control still had two rewrites, and all eight earlier cases remained red with unchanged outputs. The probe intentionally asserted exact native parity after logging all eleven, causing the expected Ubuntu step failure. These traversal methods show that merely enumerating `outerHTML`, `innerHTML` and `textContent` named properties is insufficient for a general DOM source-reachability proof: raw script bytes can be obtained through structural traversal of DOM text nodes. This conclusion is scoped to the tested unmodified browser API behavior.
- The initial [run 45025590020](https://github.com/FlareZ123/obfs/actions/runs/45025590020) at `bb3eed96653941a560b5b2b27cfac5f9db7228d5` had a **vacuous green** because a top-level classic-script `const` was not renamed; it must not be counted as positive transformation coverage. This mistake was corrected with a function-local variable and a separate positive control before the red-run evidence was recorded.

The fixture emits a **function-local** numeric binding `const privateNumber=input+5`, reads the currently embedded executable JavaScript through one of four DOM routes, and computes `sourceMatch=observed.includes("private"+"Number")`. The split constant ensures the source text's match comes from the variable's exact spelling rather than the lookup string itself. The negative control manually renames `privateNumber` to `q`. Every variant calls the same numeric computation. The compiler run sets `mode:'coo'`, `strings:false`, `identifiers:true`, a case-specific deterministic seed, and no host lock.

An otherwise identical **inert** executable script with no source observer is a positive transformation control: compiler reports **2 renamed bindings** and changed source, so the source-observing cases have an independently established eligible rewrite path.

## Real Chromium observations (nine classic and two inline module routes)

| Embedded read | Original value / sourceMatch | Manually renamed control | Actual compiler emitted | Emitted rewrites |
| --- | --- | --- | --- | ---: |
| `document.documentElement.outerHTML` | 8 / true | 8 / false | 8 / **false** | 2 |
| `document.body.innerHTML` | 8 / true | 8 / false | 8 / **false** | 2 |
| `document.querySelector("html").innerHTML` | 8 / true | 8 / false | 8 / **false** | 2 |
| `document.getElementById("script-probe").textContent` | 8 / true | 8 / false | 8 / **false** | 2 |
| `document.documentElement.textContent` | 8 / true | 8 / false | 8 / **false** | 2 |
| `new XMLSerializer().serializeToString(document)` | 8 / true | 8 / false | 8 / **false** | 2 |
| `document.createTreeWalker(document, NodeFilter.SHOW_TEXT)` iterating text nodes | 8 / true | 8 / false | 8 / **false** | 2 |
| `Range.selectNodeContents(document.documentElement)` then clone text | 8 / true | 8 / false | 8 / **false** | 2 |
| `document.getElementById("script-probe").firstChild.data` | 8 / true | 8 / false | 8 / **false** | 2 |
| **Inline module:** `document.documentElement.outerHTML` | 8 / true | 8 / false | 8 / **false** | 2 |
| **Inline module:** `new XMLSerializer().serializeToString(document)` | 8 / true | 8 / false | 8 / **false** | 2 |

All observations were read directly from Ubuntu job logs and all eleven failed a genuine original-versus-compiler behavior assertion. The secondary manually-renamed control identifies the semantic dependence on source spelling; it is not the source of the compiler result. The output numeric value alone is insufficient to establish semantic equivalence.

## Platform semantics and authoritative references

The [WHATWG HTML Standard](https://html.spec.whatwg.org/multipage/scripting.html) defines script-element text and textContent semantics for inline JavaScript, and its [Document section](https://html.spec.whatwg.org/multipage/dom.html) defines the active classic-script relationship of `Document.currentScript`. [MDN Element.outerHTML](https://developer.mozilla.org/en-US/docs/Web/API/Element/outerHTML) documents serialization of an element **including descendants**; [MDN Element.innerHTML](https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML) documents serialization of descendants. [MDN Node.textContent](https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent) explicitly includes text from `script` and `style` descendants. These references explain why source-preserving behavior is plausible for the selected DOM reads, while the executable Chromium runs above are the actual compatibility evidence. An external-`src` script element has different child text semantics; no claim is made that these exact inline DOM reads reveal the response body of an external script.

### Benign DOM access with positive compiler yield

The same eleven-route differential has an additional **source-unrelated DOM positive control**: `const observed=document.title` instead of reading any HTML source. On [frozen real-Chromium run 45028718996](https://github.com/FlareZ123/obfs/actions/runs/45028718996), pinned branch `d0853c6d957bba7c4e50dae56923dc6f7da10c77`, the unprotected and COO-transformed scripts both returned `{"value":8,"sourceMatch":false}`, and the compiler performed **two actual binding rewrites**. This supports a narrow productive use of the compiler for benign DOM access in the tested unmixed inline script. It is a test-specific compatibility and protected-work control; arbitrary `document.title` getters could be patched by hostile host code, so it is not a proof of unconditional safe transformation in an arbitrary execution environment. A blanket `document` syntactic veto would erase this measured yield. The same run retains the original eleven expected-red source-bearing cases.

## Why the compiler admitted the rewrite

At the evaluated mainline `src/ast.js` blob `fded5c8451a07dc5c249a7decdbf4eaa445eea03`, the `observesDistributedSource` function had no literal handling of `document`, `currentScript`, `documentElement`, `getElementById`, or `querySelector`. That syntactic observation is consistent with the observed two renamed bindings. The older abandoned Agent 34 DOM source guard [PR #56](https://github.com/FlareZ123/obfs/pull/56) was not merged and described these four routes as beyond its scope. Real Chromium proves the selected document-element/serialization paths can expose own embedded executable bytes.

Other DOM reads can preserve normal positive renaming yield, for example a benign `document.title`; a global veto on all `document` references would sacrifice valid rewrites. Covering these eleven scoped variants does not establish proof for aliases, borrowed DOM methods, cross-frame traversal, DOM mutation timing, cross-module source access, or delegated callbacks. A sound broader contract needs explicit conservative treatment of unproved source-bearing DOM object graphs.

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

## Authorized-host ESM lock: source parity fails even without identifier obfuscation

An independent [real-browser authorized host-lock parity reproducer](../sims/browser-dom-locked-module-source-parity.js) holds all other transforms disabled: `mode:'coo'`, `sourceType:'module'`, `strings:false`, `identifiers:false`, `properties:false`, `closedWorld:true`, `allowedHosts:['127.0.0.1']`. It serves original and generated **inline module** scripts over localhost HTTP, so `location.hostname` is the configured **authorized origin**. The module reads its own embedded `<script type="module" id="script-probe">` text length through `document.querySelector(...).textContent.length`. The host-provided output collector is a separate classic script running after `window.load`.

Frozen source `97c8578a1173f0f99d9da3e78fb8d828be6296b1`, [run 45027721304](https://github.com/FlareZ123/obfs/actions/runs/45027721304), Ubuntu Chromium job `137224305583`, produced:

```json
{"inertNative":{"value":8},"inertLocked":{"value":8},"observedNative":{"value":8,"sourceLength":128},"observedLocked":{"value":8,"sourceLength":267},"originalSourceBytes":128,"guardedSourceBytes":267,"allowedHost":"127.0.0.1","guardPresent":true}
```

The inert control confirms the hostname guard performs its intended authorized operation on ordinary code. The source-observing module's numeric result still equals 8, but the injected guard increases the embedded module's observable text length by **139 characters** (128 to 267). The test explicitly verified that the guard text was generated, then failed the genuine authorized-host native-versus-guarded parity assertion.

This is a **second transformation category** affected by the missing DOM source-observer guard: explicit hostname-lock injection, not merely identifier or property rewriting. The existing `src/core.js` host-lock preflight already declines when it detects source/stack observability; it needs the DOM source routes admitted to the same proof boundary. A sound immediate repair can raise `TypeError` for this source-observing input with `allowedHosts` rather than silently publish different observable source. This test does **not** demonstrate an unauthorized-host bypass or an improvement to hostility resistance; all browser execution here deliberately occurred on an allowed host. Runtime 2.5× overhead was not measured in this fixture.

## Separately confirmed private property-key source exposure

A fifth focused test harness, [`sims/browser-dom-property-source-parity.js`](../sims/browser-dom-property-source-parity.js), isolates **local private object-property renaming** from identifier and string transforms. It compiles a closed-world inline ESM module containing an unescaped local record `const owner={internalSecret:8}` read through `owner.internalSecret`. Configuration: `mode:'coo'`, `properties:true`, `identifiers:false`, `strings:false`, `closedWorld:true`; the private property has pure numeric value and does not escape through reflection. The program compares a DOM-observed string against split `"internal"+"Secret"`, keeping the lookup token from injecting an artificial direct match.

Frozen source `30f1fc0e15a4b6beee80ea7c1827f43ae0e6501e`, [manual two-platform run 45029044951](https://github.com/FlareZ123/obfs/actions/runs/45029044951), Ubuntu Chromium job `137228334906`, reports:

| Observation | Native `value/sourceMatch` | Direct manually renamed | Actual compiler emitted | Compiler `objects/properties/bindings` |
| --- | --- | --- | --- | --- |
| Benign `document.title` | `8/false` | `8/false` | **`8/false`** | **1/1/0** |
| Source `document.documentElement.outerHTML` | `8/true` | `8/false` | **`8/false`** | **1/1/0** |
| Source `new XMLSerializer().serializeToString(document)` | `8/true` | `8/false` | **`8/false`** | **1/1/0** |

The negative source-bearing cases failed the **actual native-versus-emitted semantic equality assertion**, after a separate explicit positive private-property transform assertion and exact benign DOM-control parity. The standalone proof deliberately logs its complete three-row results, asserts that only the two source-reader cases mismatch, and finally raises the expected compatibility failure. It is **not** caused by local binding renaming, as `metrics.bindings=0` throughout. This demonstrates that adding DOM source exposure to the existing `remoteSourceObserver` preflight must cover the **private property transformer** and related source-changing passes, in addition to the identifier and hostname-wrapper defects already demonstrated. A benign `document.title` case does retain an actual locally renamed key with unchanged observed behavior in the tested browser environment.

This is **bounded source reflection**, not an attack on cross-file property alias consistency or an assertion that every DOM read must suppress all property renaming. It does not establish additional reconstruction resistance, lock bypass or performance conformance. The deliberate source observation occurs in an inline ESM module under native DOM APIs; external-only script deployments require separate provenance analysis.

## Inter-file delegated DOM source reader: private property owner across a call boundary

The [`sims/browser-dom-delegated-cross-file-source-parity.js`](../sims/browser-dom-delegated-cross-file-source-parity.js) proof addresses the explicit **interprocedural and cross-file** source-observer requirement. Two ESM files are passed to the compiler as one closed group. The inline browser entry creates a private record with `owner.secretToken` and calls an **imported function** `readDocument(document)`, implemented in a separate HTTP-served `reader.mjs`. That exported helper accepts the `Document` as parameter `d`, then returns either `d.title` (benign control) or `d.documentElement.outerHTML` (source-bearing case). The inline entry compares the returned string to the split lookup `"secret"+"Token"`. The private record itself never escapes; only its numeric value leaves the local function. **This deliberately crosses file, function-call, parameter-flow and host-DOM boundaries.**

Frozen source `7e26b3674b24b34b778c92d7e410275025a8b1c9`, [manual CI run 45029381832](https://github.com/FlareZ123/obfs/actions/runs/45029381832), Ubuntu Chromium job `137229369209` reported:

| Imported reader | Native result | COO emitted result | Inline entry private rewrites | Imported reader rewrites |
| --- | --- | --- | ---: | ---: |
| `readDocument(d) => d.title` | `8/false` | **`8/false`** | 1 private property | 0 |
| `readDocument(d) => d.documentElement.outerHTML` | `8/true` | **`8/false`** | 1 private property | 0 |

Both actual browser versions import their respective emitted or original `reader.mjs` via HTTP; the same untransformed script in the HTML page gathers results after `window.load`. Compiler options deliberately disable **identifier and string rewrites**, enable closed-world **property** rewriting, and pass both modules together. The emitted source-reader helper does not rewrite any keys, so only the inline entry's private `secretToken` spelling is responsible for the changed source-dependent observation. The test enforced positive private-property yield for **both** deployments, confirms the benign reader's exact parity, then fails on the one actual cross-file source-exposing mismatch. The JSDoc gate for the expanded evidence suite passed on both Linux and Windows. The Windows browser step was intentionally skipped, while its ordinary cross-reader/JSDoc steps passed.

The derived integration requirement is stronger than a direct syntactic scan for `document.documentElement` in the candidate source file: a source observer in an imported function can receive a `Document` object through a parameter alias, serialize the caller's inline source and reveal an otherwise privately renamed field. Conservatively setting the group-wide `remoteSourceObserver` when source reachability is unproved may protect parity, at the cost of measured benign transformation yield. A precise selective proof must account for delegated cross-file host-object flow and deployment provenance. This finite demonstration does not constitute a proof for arbitrary interprocedural aliasing, custom loader imports or adversarial host monkey patching.

## Threat, compatibility and performance limitations

These are **eleven finite semantic mismatches**, not proof of generalized property analysis unsoundness or of an attacker resisting reverse engineering. Source reflection by the executing classic script is part of its observable program behavior. The measured 8/true versus 8/false difference makes byte-preserving transformation or explicit refusal necessary for this input under the 1:1 parity objective.

No strict 2.5× performance conclusion is drawn: the test only checked functional equivalence and rewrite count. The COO attacker already controls client-side execution and public source; this red does not establish additional hostile-environment protection. There is no reason to change the repository's **RELEASE-BLOCKED** decision.

## Integration ownership

The established canonical source-observation integration owner is Agent 3. A direct [four-case evidence handoff](../communications/agent3/20261122T1311Z_agent34_four-dom-source-observer-parity-red.md) requests these as red-first tests for the existing source-observer suite while preserving a benign DOM positive-yield control. The historically stale browser DOM [PR #56 handoff](../communications/agent3/20261122T1301Z_agent34_dom-inline-source-pr56-handoff.md) was archived unmerged; importing its patch wholesale into current main is not supported by a current cross-pass integration pin.

## Evidence harness type checking

The four committed `sims/browser-dom-*.js` probes have a standalone strict-JSDoc configuration in [`jsconfig.dom-source-evidence.json`](../jsconfig.dom-source-evidence.json). A cross-platform run initially found Node server-listen Promise callback and generated-code union type errors. Those declarations were corrected without changing any test scenario or expected native/compiled result.

Frozen [run 45028498637](https://github.com/FlareZ123/obfs/actions/runs/45028498637), branch source `994ba2fb6092627404dc5538cbd0d74ccfac23f4`, completed **strict JSDoc for all four evidence probes on both Ubuntu and Windows**, alongside the existing repo-wide Node/JSDoc checks. The **Windows job passed**. The **Ubuntu job remained red solely because the deliberately expected browser source-parity assertions exposed the documented compiler bug**, not a type failure. Only a manually-dispatched existing workflow on the evidence branch was modified; no new workflow or per-commit CI was introduced. The files and typecheck config are committed on main; the extra CI dispatch steps are not.

