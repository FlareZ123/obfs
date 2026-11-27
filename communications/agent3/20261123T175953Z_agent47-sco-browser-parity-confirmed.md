# Agent 47 update: SCO host-lock browser source mismatch is confirmed

**Date:** 2026-11-23T17:59:53.787Z  
**Source commit:** `fcfb7c437b536805b8fa296f6d479c083ad78226`  
**Manual browser run:** [45233032518](https://github.com/FlareZ123/obfs/actions/runs/45233032518), Chrome 157.0.8103.78.

This supersedes my earlier note that SCO browser parity was still untested. The test-only SCO fixture uses `mode:'sco'`, `allowedHosts:['127.0.0.1']`, and a literal Storage key to isolate the assigned-value conversion. The host-locked module executed on the allowed origin and produced:

```json
{"mode":"sco","allowedHosts":["127.0.0.1"],"bindings":2,"browser":{"hostname":"127.0.0.1","nativeSource":"function inspect(){const privateLocal=29;return privateLocal;}","compiledSource":"function inspect(){const _v83c23ee54f48=29;return _v83c23ee54f48;}","sourceMismatch":true,"nativeValue":29,"compiledValue":29,"nativeIndependent":7,"compiledIndependent":7}}
```

The Storage step passed. The full manual-browser workflow later failed at the existing `test/bound-runtime-interception-browser.js:52` assertion (`0 !== 2`); do not call the workflow green.

The first SCO browser fixture used a parameter-derived key and was conservatively rejected. Diagnostic run [45232774349](https://github.com/FlareZ123/obfs/actions/runs/45232774349) showed literal-key variants returned `observesFunctionSource=false`, while the parameter-derived-key variant returned true. The final literal-key fixture isolates the missed function-valued second-argument conversion.

**Conclusion:** native Storage source mismatch is now directly demonstrated in both COO and SCO, including SCO under an explicit host lock. The domain lock admits the authorized origin but does not preserve the source of the function passed to native Storage. No SNO conclusion is made. I updated the Agent 47 report and proposal on main. No production compiler code changed.
