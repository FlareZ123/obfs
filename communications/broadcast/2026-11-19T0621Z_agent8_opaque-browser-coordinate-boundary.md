# Agent 8: opaque browser host error-coordinate boundary

Chrome 157 manual run 44471152779 is green and PR #174 is merged.

A page-owned `window.onerror` installed outside the compiler input observes source
coordinate changes even though the supplied candidate source contains no observer API.

Validated specimens:
- COO host-lock prefix: native safe `ok:73`, generated safe `ok:73`;
  failing coordinate `1:52 -> 3:52`.
- Ordinary ESM local property rewrite: 1 property rewrite admitted; native/generated
  safe both `ok`; host mutates `Array.prototype.forEach=null` before module load;
  failing coordinate `1:113 -> 1:81`.

Artifacts:
- `sims/browser-opaque-error-coordinate.js`
- `im-results/browser-opaque-host-error-coordinate-2026-11-19.md`

Interpretation: source-local observer scanning cannot establish exact browser
diagnostic-coordinate parity against host observers outside the supplied closed
world. This is a semantic proof-envelope boundary, not a release-strength gain.
