# Window.name function-source observation

**Status:** reproducible intermediate finding; not a release result.

## Mechanism

The current HTML Standard declares `Window.name` as an IDL attribute of type `DOMString`:

```webidl
attribute DOMString name;
```

Assigning a function object to `window.name` therefore performs Web IDL string conversion. Reading `window.name` returns the resulting string. When the function has no custom string-conversion override, that string is its native function source.

Normative source: [WHATWG HTML Standard — Window object](https://html.spec.whatwg.org/multipage/nav-history-apis.html#the-window-object).

## Source pin and test

Research branch: `agent12/storage-source-observation-20261123`.

Browser test head: `cdf7989f6e72f7f63ea6711f291c08cc2fcf6355`; expanded focused Node test head: `0f35ae3ea8dfdaf39e5bba9005e45f25ed27021e`.

Compiler source blobs:
- `src/ast.js`: `c227e6e604635a42663af745fd0cfb194b215a67`
- `src/identifiers.js`: `c7e2ed1469381c5bc6dc42cef9a6ca8bfa347f0f`


Agent 1 independently fetched the current-main blobs and verified they are byte-identical to these pins: `src/ast.js` `c227e6e604635a42663af745fd0cfb194b215a67`; `src/identifiers.js` `c7e2ed1469381c5bc6dc42cef9a6ca8bfa347f0f`. The research branch base is older, but the tested compiler files match current main exactly, so this source-mismatch evidence applies to current main.

The scanner has no `Window.name` sink rule; its `browserReaders` set does not include `name`. The focused fixture is part of the same five-test suite. The browser test includes:

```js
function inspectWindow(){const windowLocal=37;return windowLocal;}
window.name=inspectWindow;
return window.name;
```

The source-observer predicate returns false for the module. Identifier mangling then changes the local binding inside the function.

## Real Chromium evidence

[Manual Web IDL run 45162975795](https://github.com/FlareZ123/obfs/actions/runs/45162975795), Chromium headless, Ubuntu 26.04, Node 22.23.5.

The browser step succeeded and emitted:

```json
{
  "browser": "Chromium",
  "metrics": {
    "literals": 0,
    "objects": 0,
    "properties": 0,
    "bindings": 4
  },
  "windowSourceMismatch": true,
  "nativeWindowSource": "function inspectWindow(){const windowLocal=37;return windowLocal;}",
  "emittedWindowSource": "function inspectWindow(){const _v4661585985e4=37;return _v4661585985e4;}",
  "valuesPreserved": true
}
```

The numeric return remained 37. The unrelated private helper still had identifier yield and returned 7. In the same run, the Storage witnesses also succeeded; see `im-results/storage-source-observation-2026-11-23.md`.

The five focused Node tests, including shadowed-host and primitive-value controls, passed on Ubuntu and Windows in [manual validation run 45166218960](https://github.com/FlareZ123/obfs/actions/runs/45166218960). Project typecheck passed; its overall conclusion is failure only at the unrelated external JSDoc errors in the two CEGAR simulation files.

The full Web IDL workflow subsequently failed its Node matrix on two unrelated existing Blob positive-yield assertions:
- `bound Blob constructor with primitive input retains private property rename`;
- `primitive Blob options preserve genuinely renamed private fields`.

The Chromium browser step itself passed. The Storage/Window.name Node subtests also passed on both Ubuntu and Windows within the matrix.

## Interpretation and limits

This is a distinct implicit Web IDL source observer from Storage methods and ordinary DOM element setters. It does not require an explicit `Function.prototype.toString` call: assigning a callable to the Window's `DOMString` attribute exposes its source through a subsequent property read.

The witness covers one Chromium version on one runner image and same-context readback. It does not establish Firefox/WebKit behavior, cross-origin browsing-context behavior, or actual HTTP SCO partition behavior. The experiment is an identifier-source-parity finding, not evidence of confidentiality, anti-instrumentation, tamper resistance, or 2.5× performance compliance.
