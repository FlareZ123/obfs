# Agent 7: Browser-native DOM function-source observation through text setters, URL properties, token-list exceptions, and canvas

**Evidence classification:** local Chromium empirical findings plus test/patch donor branches, as of 2026-11-28 09:33 UTC. **Not** an established anti-analysis or protection-strength advantage; release remains blocked. Source parity is part of 1:1 behavioral compatibility.

## Browser and method

Environment: Linux, `/usr/bin/chromium`, **Chromium 144.0.7559.96**, Playwright Python synchronous API, headless with `--no-sandbox`. Every probe constructs the ordinary callable:

```js
function inspect(){const privateSourceMarker=17;return privateSourceMarker;}
```

`inspect.toString()` is exactly 76 characters. The probes pass the function **itself**, never an explicit `String(inspect)`, into native Web IDL DOMString/USVString conversion. The observation is a DOM reflected property, text node, native exception `message`, or canvas text metrics.

### Local exact source-string readbacks

All 18 representative cases produced source strings byte-for-byte equal to `inspect.toString()` in Chromium 144:

- Native Node insertion: `element.append(inspect)`, `.prepend`, `.replaceChildren`; `child.before(inspect)`, `.after`, `.replaceWith`; `element.insertAdjacentText('beforeend', inspect)`. All returned the exact string through parent `textContent`.
- String-valued element fields: HTML anchor `.href`, image `.src`, form `.action`, input `.value`/`.placeholder`, image `.alt`, input `.name`, element `.role`, anchor `.download`, iframe `.srcdoc` yielded original source verbatim via corresponding property/attribute readback.
- Native constructors `new Text(inspect).data`, `new Option(inspect).text` yielded original bytes.
- `Range.createContextualFragment(inspect).textContent` yielded original bytes. `DOMParser.parseFromString(inspect,'text/html').body.textContent` also returned original bytes but overlaps Agent 37's work; not counted as an independent new finding.

Additional local source readbacks: `input.setCustomValidity(inspect)` -> `input.validationMessage`, `input.setRangeText(inspect)` -> `input.value`, `element.setHTMLUnsafe(inspect)` -> `element.textContent`, `document.createProcessingInstruction('safe',inspect).data`, and `document.write(inspect)` into a detached HTML document's body. `canvas.getContext('2d').measureText(inspect).width` exposes source text numerically (original source 640.58203125 canvas px at 14px monospace; synthetic renamed function with 40 source characters produced 337.1484375 px, showing non-byte observability). Canvas text source changes must therefore be treated as potential behavioral changes even without string readback.

### Native DOMTokenList exceptions also leak the source

Chromium `element.classList.add(inspect)`, `.remove(inspect)`, `.toggle(inspect)`, `.replace('safe',inspect)`, and `element.part.add(inspect)` throw native `InvalidCharacterError`. **Each error's `message` includes the exact original 76-character function source**: the attempted token contains whitespace. This is an observable exception-message compatibility boundary even if application catches the exception. Assigning `element.classList.value=inspect` also reflects exact source as `className`. By contrast `classList.contains(inspect)` returned false and `supports(inspect)` produced a generic error without the source; these are not evidence of source readback.

## Source-pinned obfuscator evidence and candidates

- Existing direct WebIDL browser negative [CI 46128295131](https://github.com/FlareZ123/obfs/actions/runs/46128295131) showed 18/18 source mismatches (6 initial native sinks x 3 modes) against frozen PR #384; numeric computation stayed 17. Existing direct-source repair [CI 46129253094](https://github.com/FlareZ123/obfs/actions/runs/46129253094) passed its Linux/Windows focused native-browser source test at `0eed1940e67fdf0df3cbf71833257a301e511082` (independent pure-private positive control retained a rename).
- New baseline-red donor `agent7/webidl-domstring-extended-red-20261128`, test `test/agent7-domstring-extended-native-sinks.test.js` at `45b4bafb31240021b6ceb8eda016695d1ee015c5`, checks 18 new browser native readbacks across COO/SCO/SNO.
- New baseline-red donor `agent7/domtokenlist-source-red-20261128`, `test/agent7-domtokenlist-native-source-parity.test.js` at `f978a0e4b67fcdfdaf243beb0938524bcdae29b5`, checks 6 native classList/part source paths across COO/SCO/SNO via real HTTP+nosniff+CSP Chrome, not an ungrounded browser mock.
- Integrated **draft** [PR #396](https://github.com/FlareZ123/obfs/pull/396), source head `84c83424bb01e3d9dcdba6ad689e300cd5f8d52d`, adds DOM receiver provenance and direct/aliased function-return tracing, named imported ESM receivers, native text/URL fields, `Text`/`Option`, Range, DOMTokenList; together with the original 6 native sink tests and pure-private controls. **Its newest additions have no exact-SHA green CI as of 09:33, and the interprocedural/ESM test branches are red.** Do not infer correctness from proposal.
- A separate follow-on branch `agent7/webidl-more-native-methods-20261128` at `e0bd568d7f99fa1391b49ec56def7f30b979efab` adds `setCustomValidity`, `setRangeText`, `setHTMLUnsafe`, `createProcessingInstruction`, `document.write`/`writeln` and 2D canvas context `measureText`/text drawing guard, with `test/agent7-native-dom-canvas-source-sinks.test.js` source `7d8d49599e5c8bd68eda21584558e43fd90a210c`. Local native effect is verified, but **candidate compiler differential and CI are not**. Do not merge it blindly.

## Reproducibility and limitations

To replicate the local findings without repo access, launch Chromium with Playwright, navigate to `about:blank`, define the function exactly as above, call each native binding with the **function value** (not `inspect.toString()`), then compare `JSON.stringify(reflectedValue)` with `inspect.toString()`; for the token-list cases catch DOMException and compare `error.message`; for canvas compare 14px monospace `measureText` widths. The real-HTTP CI tests differ from local `about:blank` by using loopback HTTP with nosniff and CSP; they are the appropriate source-pinned publication receipts once green.

Native DOM interfaces and browser versions vary. A local Chromium observation does not prove the same behavior on Firefox, Safari, Windows, or an arbitrary host shim. No static source-observer can generally prove that an opaque external function or a hostile runtime will not stringify/capture an argument. Conservative source-preservation veto trades away obfuscation yield; it is not a new security strength. The appropriate integration task is evidence-driven and should preserve positive-transform controls, 2.5x runtime envelope, and independent resistance dimensions.

Related primary report: `im-results/agent7-select-browser-insertion-and-domstring-source-parity-2026-11-28.md`; active parent PR #384 is release-blocked.
