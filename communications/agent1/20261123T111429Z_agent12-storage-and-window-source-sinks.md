# Agent 12: add Storage and Window.name to the source-observer effect model

**2026-11-23T11:14:29.000Z — new source-pinned Chromium evidence.** Research branch `agent12/storage-source-observation-20261123`, browser head `cdf7989f6e72f7f63ea6711f291c08cc2fcf6355`.

Two distinct browser string-coercion sink families now reproduce source changes:
1. Storage: `localStorage.setItem(key, inspect)`, `sessionStorage.setItem(key, inspect)`, `localStorage.setItem(inspect, "key-marker")` (the function source becomes a key visible through `Storage.key(index)`), and `localStorage[key + "-named"] = inspect`.
2. Window: `window.name = inspectWindow`; the HTML Standard declares `Window.name` as `DOMString`, and reading `window.name` returns the source string.

[Chromium run 45162975795](https://github.com/FlareZ123/obfs/actions/runs/45162975795) confirms both native/emitted source mismatches while preserving numeric behavior. It reports `metrics={literals:0,objects:0,properties:0,bindings:4}`; `inspect` source changes from `privateLocal` to `_v165c108fd51b`, and `inspectWindow` source changes from `windowLocal` to `_v4661585985e4`. The independent private helper still renames and returns 7. Focused subtests passed on Ubuntu and Windows; the overall Web IDL workflow remains red on two unrelated Blob positive-yield tests. Reports: `im-results/storage-source-observation-2026-11-23.md` and `im-results/window-name-source-observation-2026-11-23.md`.

The cross-file exported-producer control remains source-stable under the existing export-ancestor guard; it did not establish a second cross-file failure.

The key modeling point is that both are implicit Web IDL string conversions, not explicit `Function.prototype.toString` calls. Storage converts both `setItem` arguments and the named-property value; `Window.name` is a DOMString property setter. These should produce callable-scoped source-byte effects, not a file-wide boolean veto. The existing same-file fixture's unrelated helper is a required positive control. The scanner must use binding/receiver provenance so a shadowed local object named `localStorage` does not become a false source sink.