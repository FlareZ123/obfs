# Storage API function-source observation: localStorage and sessionStorage

**Status:** reproducible intermediate finding; not a release result.

## Summary

The current-main-pinned source-observer scanner does not classify `Storage.setItem` as a function-source observer. The HTML Standard declares:

```webidl
interface Storage {
  getter DOMString? getItem(DOMString key);
  setter undefined setItem(DOMString key, DOMString value);
};
```

A function passed as the `value` argument undergoes Web IDL `DOMString` conversion. The resulting native function source is stored and can be read back using `getItem`. Both `localStorage` and `sessionStorage` expose this behavior.

Normative source: [WHATWG HTML Standard, Web Storage, Storage interface](https://html.spec.whatwg.org/multipage/webstorage.html#the-storage-interface).

## Source pin and reproduction

Research branch: `agent12/storage-source-observation-20261123`

Branch head at the browser run: `0f9453957fd3c1c3e62e4849c1e38decc5a37551` (based on main `ca137356713babb6cff4d63feb838f9181e2f4db`).

Relevant source blobs:
- `src/ast.js`: `c227e6e604635a42663af745fd0cfb194b215a67`
- `src/identifiers.js`: `c7e2ed1469381c5bc6dc42cef9a6ca8bfa347f0f`

The scanner source contains no `Storage`, `localStorage`, or `sessionStorage` sink recognition. `renameLocalIdentifiers` returns unchanged only when `observesFunctionSource(ast)` is true; the Storage call is not recognized, so local binding edits proceed.

The focused fixture is `test/storage-source-observation.test.js`; it verifies the scanner returns false and that identifier rewriting proceeds. The real-browser fixture is `test/storage-source-observation-browser.js`. Its module contains:

- `inspect()`, whose local `privateLocal` binding is passed to both `localStorage.setItem` and `sessionStorage.setItem`;
- `independent()`, whose `independentLocal` binding is a safe positive-yield control;
- calls to both functions whose numeric results are compared native versus emitted.

The browser page reads the stored values back from both Storage areas.

## Evidence

### Focused Node and JSDoc run

[Manual validation run 45160222206](https://github.com/FlareZ123/obfs/actions/runs/45160222206), source `0f9453957fd3c1c3e62e4849c1e38decc5a37551):

- Ubuntu Node 22.23.4: **2/2 focused tests passed**.
- Windows Node 22.23.4: **2/2 focused tests passed**.
- Project `npm run typecheck`: passed on both platforms.
- The subsequent external JSDoc gate failed on unrelated existing errors:
  - `sims/exact-quadratic-compatible-cegar.js` lines 222, 223, 266, 267: implicit-any `outputMasks` and `inputToggles`.
  - `sims/sco-triangular-quadratic-exact-cegar.js` lines 157–158: unresolved `publicMethod`.
- The workflow conclusion is therefore failure; do not describe the complete focused workflow as green.

### Real Chromium run

[Manual Web IDL run 45160250172](https://github.com/FlareZ123/obfs/actions/runs/45160250172), same source pin. The newly added browser step ran before the existing Web IDL Node matrix and succeeded. Its exact emitted record was:

```json
{
  "browser": "Chromium",
  "metrics": {
    "literals": 0,
    "objects": 0,
    "properties": 0,
    "bindings": 2
  },
  "sourceMismatch": true,
  "nativeSource": "function inspect(){const privateLocal=29;return privateLocal;}",
  "emittedSource": "function inspect(){const _v45acf5f7243d=29;return _v45acf5f7243d;}",
  "valuesPreserved": true
}
```

Thus the emitted `inspect` function's source changed, while its numeric result remained 29. The independent helper also retained a nonzero identifier transformation and returned 7. Both local and session Storage readbacks contained the same respective native/emitted function source.

The overall manual Web IDL workflow subsequently failed its pre-existing 239-test Node matrix on both OSes in two unrelated Blob positive-yield assertions:
- `bound Blob constructor with primitive input retains private property rename`;
- `primitive Blob options preserve genuinely renamed private fields`.

The Storage browser step itself passed. Do not attribute those two Blob failures to this fixture.

## Interpretation and limits

This is an implicit Web IDL string-coercion source observer, not an explicit call to `Function.prototype.toString`. It currently bypasses the AST source-observer guard and changes a function's source through identifier mangling. The witness exercises COO ESM in one real Chromium environment; it does not establish Firefox/WebKit behavior, cross-tab `storage` event behavior, actual HTTP SCO partition behavior, or a universal browser compatibility claim.

The immediate correctness requirement is to classify `Storage.setItem` and equivalent Storage named-property assignment as source-observing when the value is not proven primitive. The source-observed callable must retain exact source spelling. A future fix should also preserve useful yield in the unrelated `independent()` helper; a whole-file veto would repair parity but would lose that positive control. Property metrics were zero in this experiment: the demonstrated failure is identifier mangling.

This finding belongs in `im-results/` until the sink model, selective positive control, browser coverage, and cross-platform acceptance are integrated and independently reviewed. It is not evidence of confidentiality, anti-instrumentation, tamper resistance, or 2.5× performance compliance.
