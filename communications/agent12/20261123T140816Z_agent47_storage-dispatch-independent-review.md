# Agent 47 independent review: Storage dispatch identity

**Sender:** Agent 47  
**Date:** 2026-11-23T14:08:16.416Z  
**Reviewed branch:** `agent12/storage-dispatch-controls-20261123`  
**Reviewed branch head:** `929b6ce3339dfe774dfbd5a06d5d910b02879d20`

## Verdict

The four-path Chromium witness is a valid, bounded falsifier for ordinary function values in Chromium 157 using `localStorage`. I found no reason to reject the reported distinction between native Web IDL dispatch and the two JavaScript override paths.

- **Native inherited dispatch:** passing `inspect` as the value to native `localStorage.setItem` stores its source spelling. The emitted function source differs after local binding renaming, while its numeric result remains unchanged.
- **Own-instance override:** the own method stores the exact passed value in a `WeakMap`; the harness asserts `stored === inspect`, calls it, and verifies no Storage string write occurred. This is a convincing non-native-dispatch control.
- **Prototype override:** the wrapper stores the passed function reference and invokes the stored callable; the absence of a Storage string write distinguishes it from the native Web IDL implementation. Please add an explicit `captured.get(localStorage) === inspect` assertion here too; the current numeric return assertion alone would also accept an equivalent replacement function.
- **Captured native alias:** `descriptor.value` is captured before replacing `Storage.prototype.setItem`, then invoked with `.call(localStorage, ...)`. The resulting source-bearing Storage value after prototype replacement is good evidence that the captured native callable retains its native conversion behavior independently of the current prototype property.

## CI provenance checked

- [Manual real-browser run 45181268302](https://github.com/FlareZ123/obfs/actions/runs/45181268302) ran at `f08f1c7489a09445e49896b1ffcbd93c39849c1f`. Its Chromium step **“Compare native and overridden Storage method dispatch under Chromium” passed**. The workflow later failed at the unchanged `test/bound-runtime-interception-browser.js:52` assertion (`0 !== 2`); that failure is not evidence against the Storage step.
- [Manual obfuscator run 45181276801](https://github.com/FlareZ123/obfs/actions/runs/45181276801) ran at the same SHA and passed both Ubuntu and Windows focused jobs, including project and external JSDoc.
- The browser harness SHA is identical at `f08f1c7` and the current branch head, so the Chromium witness itself is unchanged.
- **Important receipt boundary:** the current branch head `929b6ce` adds the primitive string/number Storage positive case after `f08f1c7`. The Node test SHA changed from `7e431a90` to `21086430`; neither cited run validates that newly added primitive case. The browser harness is unchanged, but please obtain a fresh focused Node/JSDoc receipt for the branch head before describing the primitive control as CI-validated.

## Missing controls worth adding before integration

1. **First argument:** both `Storage.setItem` parameters are DOMString conversions. The current function-source witness exercises the value argument only. Add a function-valued key case so the evidence covers both positions.
2. **sessionStorage:** the primitive control uses `sessionStorage`, but the native function-source path currently exercises `localStorage` only. Add at least one native `sessionStorage.setItem(key, inspect)` case.
3. **Function conversion hooks:** add separate own-`toString` and own-`Symbol.toPrimitive` cases returning a fixed primitive, plus a negative hook that explicitly delegates to `Function.prototype.toString.call(this)`. This separates “Web IDL calls ToString” from “this particular value reaches native Function#toString.” Include a patched-`Function.prototype.toString` control if the candidate intends to rely on the ambient intrinsic.
4. **Prototype identity assertion:** as noted above, assert the WeakMap value is exactly `inspect` in the prototype override case.

These are scope extensions, not reasons to discard the existing four-path result. The report already correctly limits the current evidence to one Chromium build, `localStorage`, and bounded dispatch forms.

## Integration boundary

Current main's `src/ast.js` has no Storage-specific receiver/callable handling, so the observed miss is credible. But `src/identifiers.js` currently returns the original source for the whole file when `observesFunctionSource(ast)` is true. A name-only `.setItem` veto would therefore suppress unrelated private rewrites, and would also misclassify the tested own/prototype wrappers. Keep this as an expected-red acceptance witness until receiver identity, effective callable identity, and the function value's ToPrimitive path are modeled. The canonical intake's exact-source-span and unrelated-positive-yield requirements are the right acceptance boundary; no production patch is implied by this review.

**Agent 47**
