# Selected SCO Base64 host exception text: real browser/server semantic counterexample

**Agent 8, 23 November 2026.** Status: source-pinned bounded compiler compatibility witness and narrow fail-closed repair. **Intermediate result**, not a claim of strong obfuscation, arbitrary JavaScript equivalence, or a 2.5× runtime bound.

## Actual trust and runtime boundary

A selected-SCO asynchronous export that originally executes in Chromium can be relocated to Node through a generated same-origin HTTP facade. The relocation changes which host's global `atob` and `btoa` handles malformed input. Browser-facing code is allowed to observe `DOMException.name` and `DOMException.message`. Node 22's global `atob`/`btoa` are legacy aliases for `node:buffer` helpers; Chromium's `Window` routines provide browser-specific native failure messages. These strings can differ under the same source and argument.

The [Node 22 global-object documentation](https://nodejs.org/download/release/latest-jod/docs/api/globals.html) identifies the aliases and legacy status. MDN documents the browser `[atob](https://developer.mozilla.org/en-US/docs/Web/API/Window/atob)` and `[btoa](https://developer.mozilla.org/en-US/docs/Web/API/Window/btoa)` exception categories. The measured exact messages below come from **real execution**, not documentation inference.

## Red-first generated-SCO/browser HTTP differential

Test-only branch `agent8/sco-atob-host-error-20261123`, source `3860e0394eb71d544dc37e8b897917f4a31d69b1`, [Actions run 45247360172](https://github.com/FlareZ123/obfs/actions/runs/45247360172), Node **22.23.4** and real Chrome **157.0.8103.78** in Ubuntu:

| Selected private operation | Original Chromium | Generated SCO facade via Node server |
| --- | --- | --- |
| `try { atob('%') } catch(e) { return e.name+':'+e.message }` | `InvalidCharacterError:Failed to execute 'atob' on 'Window': The string to be decoded is not correctly encoded.` | `InvalidCharacterError:Invalid character` |
| `try { btoa('\\u0100') } catch(e) { return e.name+':'+e.message }` | `InvalidCharacterError:Failed to execute 'btoa' on 'Window': The string to be encoded contains characters outside of the Latin1 range.` | `InvalidCharacterError:Invalid character` |
| `Math.imul(17,19)` | `323` | `323` |

The two discrepancies were **assertion failures as intended**; the unrelated arithmetic returned the same value in native Chromium, emitted client facade and trusted Node server. A real local HTTP `createScoHandler` denied unauthenticated requests with HTTP403 and served the emitted artifact to an authenticated Chromium tab. The Windows browser fixtures were skipped; the browser differential is a single-version-pair Ubuntu witness.

## Minimal repair and positive yield

The narrow compiler patch adds `atob` and `btoa` to the preexisting `usesUnprovedCrossRealmHostApi` observational set in `src/sco-selective-partition.js`. A selected private source referencing either unproved ambient global is now refused before relocation. This applies to direct references and first-class identifier aliases and to private transitive static module inspection, while the existing proof for a uniquely owned, unmodified same-named local function remains eligible. Public functions continue executing locally, retaining their original `atob` source. Independently selected arithmetic stays eligible and executes over the actual authenticated browser HTTP path.

Source `3df12d74c01ce79942cb0b209abc3949694e8783` had the complete compiler guard; [focused run 45247730385](https://github.com/FlareZ123/obfs/actions/runs/45247730385) proved **both host-dependent candidates refused**, and safe arithmetic `323` still traversed the live Chromium→Node facade. That run was red on both platforms solely because a new public-source positive assertion accidentally used a double-escaped regular expression instead of matching literal generated text. The generated client text actually retained `atob('%')`; the test assertion was corrected without touching compiler code.

Exact final code/test source `13f67fba3df38083d1ff95d803a97976a42c1749` completed [focused run 45247936037](https://github.com/FlareZ123/obfs/actions/runs/45247936037) **SUCCESS on Ubuntu and Windows**, including strict project/external/paired-budget JSDoc. Ubuntu executed **4 passes, 0 failures**: two host-sensitive refusals, live authenticated arithmetic with original=emitted=server=323, and static local-shadow/public-client positives. Windows ran Node static assertions and skips browser-only cases; its focused and JSDoc gates succeeded. The full project test suite was skipped by this focused workflow.

## Limits and next decision

- This is a demonstrated **compatibility defect and conservative admission repair** in one selected-SCO relocation architecture, not arbitrary browser API equivalence. Other ambient values, reflective aliases, host states and customer-modified globals are outside the proof.
- The source contains a specific **positive protected-work** witness. Refusal of the unsafe cases does not justify asserting greater static/dynamic attacker-cost, confidentiality, authorization completeness or any universal performance ceiling.
- An equal-value native error name (`InvalidCharacterError`) still accompanied a different message, so checking only an exception class would have missed the behavior change.
- A later exact-current-main merge requires its own source pin and must preserve broad red status: comprehensive acceptance remains **RELEASE-BLOCKED** under the project's stronger requirements.
- Reproduction: run the source-pinned focused `test/sco-atob-host-error-browser.test.js` with the repository's existing `manual-validation.yml` focused workflow. Unpatched test-only source and repaired test source are explicitly listed above.
