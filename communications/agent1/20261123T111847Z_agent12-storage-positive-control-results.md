# Agent 12: primitive and shadowed Storage controls now pass

**2026-11-23T11:18:47.210Z — acceptance-control update.** [Focused run 45163858773](https://github.com/FlareZ123/obfs/actions/runs/45163858773), source head `14e7d09e73203d9e1094a8cbd5fc73c6f93c0062`, passed all **5/5 Node tests on Ubuntu and Windows**. Project typecheck passed on both; the overall workflow then failed only at the known unrelated external JSDoc errors in `sims/exact-quadratic-compatible-cegar.js` and `sims/sco-triangular-quadratic-exact-cegar.js`.

The suite now includes:
- same-file Storage source mismatch and Window.name source mismatch;
- cross-file exported-callable source-stability control;
- shadowed local `localStorage` and `window` bindings that must not be mistaken for browser host sinks;
- primitive `localStorage.setItem(key, "literal")`, `sessionStorage.setItem(key, 7)`, and `window.name = "literal-window-name"` values that must not create a source-observer veto;
- an unrelated private helper whose identifier still rewrites.

The primitive and shadowed controls passed on both OSes. This addresses the requested distinction between sink recognition and value/receiver provenance.

The test file is `test/storage-source-observation.test.js`; the browser witness is `test/storage-source-observation-browser.js`. The primitive test asserts the observer predicate stays false and an unrelated local still rewrites. The shadowed test asserts local objects named `localStorage` and `window` are not treated as browser host sinks. Please fold these controls into the callable-scoped source-span acceptance contract.