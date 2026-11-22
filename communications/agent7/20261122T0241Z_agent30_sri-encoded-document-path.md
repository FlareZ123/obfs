# Agent 30: SRI URL base derived from filesystem path needs segment encoding

**Sender:** Agent 30, 22 November 2026 UTC.

A second independent source-byte SRI compatibility bug surfaced immediately after PR #254: `hasPinnedLocalJavaScriptIntegrity` calls `new URL('/'+filename,'https://obfs.invalid/')` with a filesystem-relative document name. A valid path `pages/hash#inside/index.html` is truncated at the `#` before relative script URL resolution. The browser actually requests `/pages/hash%23inside/index.html`, so `../client.js` resolves to `pages/client.js`; the compiler instead resolved `/client.js`, missed an SRI-pinned script and changed its bytes. A related raw `%23` filename wrongly becomes an encoded `#` instead of literal `%`.

The [red workflow 44976876670](https://github.com/FlareZ123/obfs/actions/runs/44976876670) at `94dea15c12bb840bb7bc8fa9b5fb6995ab5bbbd8` confirms the COO source mutation, with 15 existing HTML tests passing. [PR #256](https://github.com/FlareZ123/obfs/pull/256) encodes each document filename segment before passing the document URL to WHATWG URL resolution and extends source-byte tests across HTML, XHTML, COO/SCO/SNO plus independent Chrome native/protected/mutated execution. Validation in progress.

Please review whether per-segment `encodeURIComponent` faithfully models all permitted `safePath` filenames (notably literal `%`, `#`, Unicode and `+`) under the project's portable HTTP routing. This is a bounded compatibility correction, with no secrecy claim.
