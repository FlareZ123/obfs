# SCO static private graph: browser-only global admission parity (22 November 2026)

**Status:** reproducible compiler admission counterexample and bounded repair. This is
an intermediate source-compatibility finding, not a new anti-extraction claim or a
release approval.

## Boundary and counterexample

In selected SCO, the original static private ESM graph is executed in the
trusted Node process while a generated facade runs in the browser. An
application can observe browser-origin state through unqualified globals such
as `localStorage` and `sessionStorage` without mentioning `window`.
Those objects are scoped to the browser document/origin and do not have
an equivalent guaranteed value in the Node server. The direct selected-private
export scanner already recognized thirteen browser-owned roots, but the
transitive `privateModuleSources` collector recognized only
`window`, `self`, `document`, `navigator`, and `location`.

A real prepatch compiler run accepted a private dependency containing:

```js
export function compute() {
  return localStorage.getItem("session");
}
```

despite migration to Node. The same dependency can be one static import
from the entry, or a transitive leaf. A local Node 22.16 two-context
observation evaluated that expression as `"client-only"` when the source
realm supplied a `localStorage.getItem` capability and raised
`ReferenceError: localStorage is not defined` in an empty realm.
This is a deliberately isolated host-state witness, not a full browser
versus remote-service differential.

## Repair and safeguards

`src/sco-selective-partition.js` now stores the existing browser-root
admission set once at module scope and uses it in both direct selected
private exports and transitive static modules. The newly covered transitive
roots include `localStorage`, `sessionStorage`, `indexedDB`,
`history`, `screen`, `customElements`, `DOMParser`, and
`XMLHttpRequest`. The existing separate host-API guard may reject
`XMLHttpRequest` earlier under its own accurate diagnostic.

`test/sco-private-host-effect-closure.test.js` now runs eight browser-root
examples through both direct-child and transitive-leaf graph shapes.
The positive control ensures the identical spellings remain valid inert
record property labels. Rejection happens at **build time**; the patch
adds no client execution branch and does not modify the emitted code path
for admitted inputs.

## Source-pinned red and validation

- [Red-first run 44996091348](https://github.com/FlareZ123/obfs/actions/runs/44996091348),
  `b9220ef5f5e3bec33205f732562bd21dc471fd39`:
  Ubuntu and Windows each failed exactly the new browser-root refusal test.
  The first missing exception was `return localStorage.getItem("session")`
  in the direct-child graph. The inert record-key positive control passed.
- [First patch run 44996146559](https://github.com/FlareZ123/obfs/actions/runs/44996146559),
  `cbd62af955990f020859a5dc677a7cdebce48280`:
  both platforms reached a test assertion expecting the new browser-root
  diagnostic for `XMLHttpRequest`, already rejected by the earlier
  cross-realm host-API guard. The test matcher was corrected without
  weakening the compiler.
- [Corrected source run 44996229894](https://github.com/FlareZ123/obfs/actions/runs/44996229894),
  `5e176b4da746c51b0dad7d033972bb2cf67d7c7d`:
  Windows completed the targeted SCO suite, support simulations and
  strict JSDoc checks successfully. Ubuntu completed the targeted
  SCO suite and support simulations, then failed an unrelated real
  Chromium IPv6 smoke test at
  `test/sco-host-ipv6-browser.js:65`. This assertion tests the
  **unprotected native HTML/script** before the SCO-generated variant.
  The native DOM remained `pending` rather than `[::1]|42` on both
  initial and repeat attempt; do not count the Linux job as green.

Focused local reproduction: `node --test test/sco-private-host-effect-closure.test.js`
with declared npm dependencies. The existing
`.github/workflows/manual-sco-authorization.yml` runs it in the
cross-platform SCO integration matrix.

## Limits and decisions

This fix adds a conservative static admission restriction. Lexical shadow
cases can be declined even when safe; hidden host capabilities and opaque
dynamic loaders remain outside a fully proven source-migration contract.
The literal `globalThis.externalBridge` class is separately rejected by
the collector's known-standard global-member check. This does not prevent
a fully authorized client from relaying SCO outputs, prove general source
secrecy, or establish the 2.5x execution budget. The overall release
decision remains **RELEASE-BLOCKED**.

References: [MDN Web Storage](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
and [Node.js 22 global objects](https://nodejs.org/download/release/latest-jod/docs/api/globals.html).
