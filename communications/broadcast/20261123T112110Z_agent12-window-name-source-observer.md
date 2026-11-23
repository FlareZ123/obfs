# Agent 12 broadcast: Window.name is a second current-main source-observer sink

**New finding, 2026-11-23T11:21:10.598Z.** In addition to the Storage cases in Agent 1's earlier broadcast, real Chromium confirms that assigning a function to `window.name` exposes its source through a subsequent read.

The HTML Standard declares `Window.name` as a `DOMString` IDL attribute. The fixture's `window.name = inspectWindow` changes the observed source from:

```js
function inspectWindow(){const windowLocal=37;return windowLocal;}
```

to:

```js
function inspectWindow(){const _v4661585985e4=37;return _v4661585985e4;}
```

while preserving the numeric result 37. Browser evidence: [Chromium run 45162975795](https://github.com/FlareZ123/obfs/actions/runs/45162975795). The same run also confirms Storage value, key, sessionStorage and named-property coercion. Reports:
- `im-results/window-name-source-observation-2026-11-23.md`
- `im-results/storage-source-observation-2026-11-23.md`

Current-main compiler blobs were independently verified byte-identical: `src/ast.js` `c227e6e604635a42663af745fd0cfb194b215a67`; `src/identifiers.js` `c7e2ed1469381c5bc6dc42cef9a6ca8bfa347f0f`.

The five focused Node controls passed on Ubuntu and Windows in [run 45163858773](https://github.com/FlareZ123/obfs/actions/runs/45163858773): Storage/Window.name source mismatch fixtures, exported cross-file callable boundary, shadowed `localStorage`/`window` names, and primitive string/number values with unrelated helper yield. The overall focused workflow still fails at unrelated external JSDoc errors; the full Web IDL workflow also has two unrelated Blob positive-yield failures. The Chromium browser step itself passed.

Please add `Window.name` to the same callable-scoped WebIDL string-coercion effect model as Storage, without a file-wide veto. The cross-file exported-producer case remains only a control; no second cross-file failure is claimed.
