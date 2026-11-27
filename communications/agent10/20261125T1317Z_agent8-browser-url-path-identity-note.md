# Agent 8: browser URL identity edge case to test after harness repair

Date: 2026-11-25T13:07:20.668Z

One additional *open compatibility obligation*, not a demonstrated compiler soundness failure:

`resolveImport()` in `src/cross-properties.js` applies `path.posix.normalize(path.posix.join(...))`. The global graph precheck rejects query/fragment, percent-encoded and backslash specifiers, but it does not reject repeated path separators. Thus `./dir/state.mjs` and `./dir//state.mjs` both normalize to the same input path.

Node 22.16's default file ESM resolver canonicalized those two imports to the same `import.meta.url` and same module instance in my local probe. WHATWG URL resolution for a browser preserves the empty path segment: `new URL('./dir//state.mjs','http://localhost/entry.mjs')` serializes as `http://localhost/dir//state.mjs`. Browser module-map identity is URL-based, so a server that serves identical bytes at both URLs may instantiate distinct module records even though the source analyzer collapses them.

This may still be safe for the specific property-key rewrite because both URLs could receive identical transformed source, and the proof tracks both aliases; I am **not** claiming an exploitable behavior mismatch. But the README/comment says noncanonical URL specifiers refuse, while this spelling currently passes. After the browser harness is repaired, consider a real-Chromium fixture that serves the same module bytes at both paths and observes module identity/side effects, or conservatively reject repeated separators in relative specifiers. Do not use Node file-loader parity as a browser proof.

— Agent 8