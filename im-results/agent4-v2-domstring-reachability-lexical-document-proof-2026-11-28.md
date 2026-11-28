# Source-observer precision in V2: a DOMString reachability counterexample and an inert lexical-Document certificate

**Investigation:** Agent 4, 28 November 2026. **Status:** intermediate, source-pinned, **not** a product release or a general security theorem. The exact dependent branches described below are isolated from `main`.

## Causal V2 integration regression

An independently green 181-case WeakMap prototype source-observation donor at `d9987387aef3bf6b127a2aefd665b583a771d85b` lost positive obfuscation yield when Agent 1 spliced its `hasWeakMapPrototypeExposure` routine into V2 at `6e0d2eecdcd5cdf2b429c3d110f28d76cee3bf54`, despite preserving native/emitted output parity. The donor routine itself and its invocation were byte-identical. The first substantive difference is V2's browser DOMString host receiver analysis starting near `src/ast.js:5020`; its `document.title` assignment observer near `src/ast.js:6463` treats an unknown RHS as potentially string-coercing.

The 181-case matrix in `test/agent3-weakmap-cfg-matrix.test.js` appends a callback to every `mutate.mjs` fixture:

```js
const nativePrototype=Object.getPrototypeOf(carrier.instance);
const nativeSet=nativePrototype.set;
nativePrototype.set=function(key,value) {
  document.title=value;
  return Reflect.apply(nativeSet,this,[key,value]);
};
```

In a native **ordinary** instance case, this callback is not called by the supplied entry or storage module, so it does not observe `inspect` source. In a WeakMap instance case, the same callback becomes a real host source observer when the supplied storage module calls `captured.set(this,inspect)`. The integrated V2 observer conservatively reports the callback's `document.title=value` even when it is unreachable and thus globally refuses identifier renaming.

The source-pinned focused four-case three-file ESM counterexample is `test/agent4-v2-domstring-observer-yield.test.js`, branch `agent4/v2-domstring-observer-yield-proof-20261128` at `7c4ca739ff41df382732e23c07f5b0648c2e2d3a`. [Exact workflow 46146185775](https://github.com/FlareZ123/obfs/actions/runs/46146185775) reproduced **3 pass, 1 expected positive-yield failure** on Ubuntu, Windows and macOS:

- Ordinary prototype `set` callback with unknown `document.title=value`, not reached: `native={result:29,title:""}`, emitted equivalent, but `bindings=0` in all COO/SCO/SNO; expected useful protection yield was nonzero.
- The **same unreachable callback** with `document.title=42`: exact parity and **3 identifier bindings rewritten per mode**; this implicates the unknown-value DOMString rule, not the WeakMap routine.
- Actually invoked ordinary prototype callback with an original function value: source string preserved and `bindings=0` in all modes (correctly conservative).
- Actually invoked WeakMap prototype callback via a storage method replacement: source string preserved and `bindings=0` in all modes (correctly conservative).

It would be **unsafe** to make `document.title` a general exception. A separate deliberately unsafe counterfactual branch `agent4/v2-domstring-title-bypass-unsafe-counterfactual-20261128` removes only that DOM sink from the observer. This branch is a falsification control and **must not** be merged. It is now confirmed to introduce a **genuine source-byte parity violation** on [source-pinned three-OS CI 46146308907](https://github.com/FlareZ123/obfs/actions/runs/46146308907) (exact `e4a91a1d9f51f20f170c5482f893975a98d2aa82`): the previously unreached ordinary callback correctly gains **3 bindings per mode**, but the reached ordinary callback's native title `function local(){const localSecret=17;return localSecret;}` diverges from emitted title `function local(){const _v1f7f06fbe771=17;return _v1f7f06fbe771;}` under COO at the first asserted mode. All three OS runs produce **3 pass / 1 failure**, validating both the yield counterfactual and its unacceptable security/semantic cost. The shared-WeakMap case remains conservative due an independent guard, so it is not evidence that the DOMString removal is safe.

## Separate, bounded positive-yield solution: lexical-Document record proof

The above unreachable-callback case is **not** solved by this smaller proof. Instead, it identifies a distinct unnecessary refusal: a module-local binding literally named `document` is not necessarily the browser's Web IDL Document. In an ESM module whose first executable statement creates an inert private record, assignments to its own data property do not invoke native DOMString conversion or an inherited setter:

```js
const document={title:""};
function protectedFn(secretArg){return secretArg+1;}
document.title=protectedFn;
export function sample(){return protectedFn(41);}
```

The alternate literal `const document={__proto__:null}` also eliminates inherited setters. Under ECMAScript's ordinary property `[[Set]]` rules, an own writable data `title` field, or a null prototype, prevents dispatch through a hostile `Object.prototype.title` setter. This is a **source-preservation sufficient condition**, not confidentiality against a debugger.

The proposed `src/ast.js::hasInertLexicalDocument` certificate is deliberately fail-closed:

1. Only an ESM `Program`, a unique module-local `const document` binding, no lexical duplicates anywhere, no direct `eval`/dynamic-scope identifiers, and **no static imports** (which could form an evaluation/TDZ cycle).
2. The declaration must be the first executable top-level statement, not exported, with no preceding executable work; no extra declarators. This excludes a hoisted function called before initialization that could expose a source-spelled `ReferenceError` for `document`.
3. The initializer is an inert object literal, either special `__proto__:null` or containing an own primitive-literal data field named `title`. The extended experimental branch allows other **entirely literal primitive data fields**; computed keys, object spreads, accessor definitions, methods, and dynamic prototype setters fail closed.
4. Every other `document` identifier use must occur **after** initialization, as the receiver of a noncomputed direct `.title` access which is exactly the LHS of a standalone `document.title = value;` statement. Alias, export, argument escape, reflection, reads, computed keys, nested shadow, compound assignment and assignment-value observation fail closed.
5. Only the initial inferred local DOM Document name is removed from V2's native host seed. Direct `globalThis.document` and verified aliases of the real host Document retain the full Web IDL guard. Other native source detection is unchanged.

The initial 11-case COO/SCO/SNO native subprocess suite and full strict JSDoc passed **Ubuntu and Windows** at [46146464570](https://github.com/FlareZ123/obfs/actions/runs/46146464570), exact source `9d7cb25de1d62166265248fe984e24686ba8fe19`. That source predates the TDZ/ESM restriction and expanded negative controls, so **do not infer the latest candidate is green from that earlier pass**. Later candidate branches:

- Narrow proof, broader negatives and strict-CSP Chromium: `agent4/v2-null-document-provenance-20261128`; `test/agent4-v2-inert-lexical-document.test.js` and `test/agent4-v2-inert-lexical-document-browser.js`.
- Expanded all-literal multi-field record grammar: `agent4/v2-literal-record-generalization-20261128`; test-only positive and hostile-prototype counterexamples, work in progress.

## Multi-field literal-record refinement, first three-platform gate

The isolated multi-field branch `agent4/v2-literal-record-generalization-20261128` at exact source `f9971c5c61e185cbfc2cdee545e89fb6fab5a09e` passed the focused `test/agent4-v2-inert-lexical-document.test.js` native/emitted/JSDoc [**46147308119**](https://github.com/FlareZ123/obfs/actions/runs/46147308119) on **Ubuntu, Windows and macOS**. This test includes four additional multi-field literal positive shapes and three negative shapes: getter, spread getter with actual source output, and nonliteral prototype initialization. It also retains original single-field, hostile inherited-title setter, reflective, global-alias, computed-key and TDZ controls. **Actual 2.5× runtime budget, crossfile source-veto and browser CSP checks are separate, queued tests, not established by this pass.**

The baseline `agent4/v2-null-document-red-20261128`, source `5930c763b0497286248ba9d167287bcf636e04a3`, [46146589125](https://github.com/FlareZ123/obfs/actions/runs/46146589125) failed exactly two positive-yield assertions and passed ten controls on every OS without the proof, supporting the claim that the candidate adds actual transformation coverage rather than just test scaffolding. The narrow positive with early TDZ safeguard also passed [46146530841](https://github.com/FlareZ123/obfs/actions/runs/46146530841), source `131341f119e71914922d55b0c500f92e93307cb7`.

**Independent Web IDL workflow caveat.** [46147311802](https://github.com/FlareZ123/obfs/actions/runs/46147311802) failed before executing our new browser step because a preexisting `test/agent1-dom-nodelist-real-browser.test.js` passed `CHROMIUM_BIN=google-chrome` as an unqualified Puppeteer `executablePath` (requires absolute path). Preceding native Web IDL, Blob, URL Chromium steps on the same Ubuntu runner passed. This is a **harness failure, not proof of functional parity or mismatch** for this branch; an isolated focused Chromium wrapper on the same test file was dispatched to avoid conflation.

## Cross-module source retention and ESM-cycle evidence

A **separate tested precision extension** on branch `agent4/v2-acyclic-local-record-import-precision-20261128`, exact source `98dd83901798ac2899a71b572a3c4ea8bd3024f4`, allows a module-local private-record proof to coexist with **static side-effect-only imports if the private-record module has no exports**. The static dependency executes before the record declaration, but cannot obtain a reference to the unexported private lexical binding or to its unexecuted module body through ordinary ESM evaluation, even in an import cycle. A counterpart **exported function** can be called from a dependency before initialization and yield a spelling-sensitive TDZ `ReferenceError`, and is deliberately refused. A genuine real-DOM source observer in a cyclic dependency is also refused. Four cross-module native subprocess comparisons in COO/SCO/SNO passed **all three OS** on [CI 46148005612](https://github.com/FlareZ123/obfs/actions/runs/46148005612). This is a bounded, test-supported claim within an import-free/private-variable grammar otherwise; exotic hosts and dynamically injected module state are not covered.

The **four-fixture cross-file function-source differential**, source `523b42c20620ffaa3b927cdea2445e0c86cfe67e`, passed all three OS on [CI 46147543249](https://github.com/FlareZ123/obfs/actions/runs/46147543249): independent module records retain nonzero identifier yield, while direct named-import functions and functions returned by an imported helper handed to a real `globalThis.document.title` sink are conservatively protected at zero bindings. The file is `test/agent4-v2-inert-lexical-document-crossfile.test.js`. Its later expanded optional-property-renaming differential has an independent run and must be verified separately.

A direct **global-function-escape** challenge using `globalThis.sharedSource` across three ESM files passed all three OS on [CI 46148695512](https://github.com/FlareZ123/obfs/actions/runs/46148695512), exact source `cbe81a870912983008107b35dd43d3aac75f9581`: without a consumer, two producer bindings were obfuscated in each mode; with direct real Document, named alias and computed global Document alias source sinks in a consumer, producer binding yield became zero and original function text was preserved. The private-receiver proof alone does **not** authorize globally exposed functions; the existing distributed source guard is essential.

## Real Chromium strict-CSP and DOMString keyset evidence

The isolated, **corrected** Chromium focused test `test/agent4-v2-inert-lexical-document-browser.test.js` at `b8b5cf63fc84bc2c18b732e292da5f7b90233cff` passed [**46149024509**](https://github.com/FlareZ123/obfs/actions/runs/46149024509), including a genuinely executed Ubuntu Chromium browser with **six cases, zero skip**, strict Content Security Policy, native and emitted ESM imports, polluted `Object.prototype.title` and a real `document.title` Web IDL setter. Four private local literal/null-prototype records retained two identifier rewrites and exact output; a local record that also writes to the actual global Document correctly refused transformations, as did an ordinary `{}` record whose inherited title setter captured original function source. The first browser wrapper [46148133029](https://github.com/FlareZ123/obfs/actions/runs/46148133029) produced a **false green** because an empty `skip:''` caused Node's test harness to mark an asserted failure as skipped. The correction sets `skip:false` on Ubuntu and distinguishes inherited setter source capture from actual host Document title mutation. **Only the corrected exact-source run is claimed as browser validation.**

An **independent DOMString keyset extension** on branch `agent4/v2-local-document-keyset-proof-20261128`, production `ae988caaee710040c8878b257a16c37de2c05aca` and eight-case fixture `6c5bb35310724721a9b204868c445bcb672e9981`, passed **8/8** cases across COO/SCO/SNO and three OS on [**46148868571**](https://github.com/FlareZ123/obfs/actions/runs/46148868571). The invariant generalizes from local `.title` to local `.cookie` and `.domain`: *each written key* must have its own writable data property or the record must have null prototype. Missing-key writes and the genuine global Document setter are negative controls and preserve original source, including under a hostile inherited key-specific setter. The optional `properties:true` pass was exercised but these particular fixtures renamed zero object properties; they do **not** establish a property-name-yield improvement, only safe identifier-yield under that option.

The consolidated branch `agent4/v2-local-document-integrated-candidate-20261128` combines the independently validated keyset and no-export ESM import predicates with the broader field grammar and tests; its one-source integrated acceptance gate is `test/agent4-v2-local-document-integrated.test.js`. **Until that exact branch passes, only the individually source-pinned results above are established.** The base V2 release is still NO-GO for unrelated failures.

## Reproduction and acceptance boundary

From an exact branch checkout with Node 22 and installed dependencies:

```sh
node --test test/agent4-v2-domstring-observer-yield.test.js
node --test test/agent4-v2-inert-lexical-document.test.js
CHROMIUM_BIN=google-chrome node test/agent4-v2-inert-lexical-document-browser.js
npm run typecheck
npm run typecheck:external
```

The first command intentionally fails one positive-yield assertion on unpatched V2; later commands are meaningful only on the proof branches. The browser harness uses a genuine Chromium document, an inherited title setter, strict CSP and external ESM modules.

**Unproved and deliberately excluded:** whole-program reachability for detached method callbacks; ESM cycles and dynamic imports; runtime source extraction by a hostile inspector; global mutable intrinsic attacks; source-map/stack-sensitive outputs beyond existing gates; any general guarantee of static unreadability or anti-debugger strength; and a universal 2.5× runtime limit. The rest of the full release suite remains **RELEASE-BLOCKED/NO-GO**. A green focused proof would establish only an additional **safe positive-yield grammar**, not release acceptance. The correct next integration decision is a source-pinned cross-OS/real-Chromium/full-suite retest against Agent 1's evolving V2 branch, with no unconditional exception for unknown DOMString setters.
