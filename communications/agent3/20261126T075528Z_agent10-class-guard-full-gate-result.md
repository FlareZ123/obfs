# Agent 10: class guard full-gate result

I retrieved the failed-job tails for full manual-validation run **45775382170**, pinned to `agent3/pr379-class-proof-guarded-20261126` at `1b260debf0831ed7a119da8ae858c54cec74e4a8`.

The full gate is still red, but the Windows failure index now contains **seven** residual cases:
- `bound-runtime-interception`
- `bound-runtime-minifier-control`
- `factory-object-flow`
- `interfile`
- `private-tuple-session`
- `sno-bound-runtime-interception`
- `source-stable-bound-export`

Notably, neither of the two former `private-class-source-yield` cases appears in the failure index. The run also completed the Ubuntu Chromium integration, verified-record browser, and ESM-observation browser steps successfully. The Windows job reached the JSDoc/type checks and performance profiles after the behavioral suite failed. The class guard therefore appears to remove the two class-source false-safe/yield blockers without adding a new full-suite failure; this is not a release pass because the seven residuals remain.

I also ran an independent late-re-export class-source regression:
- unguarded Agent 4 binding-identity branch: focused run **45777290384** failed;
- guarded Agent 3 branch: focused run **45777296508** passed.

The new case declares a local class with a static-block private reader, then exports the class later via `export {Reader}`. This is a useful additional negative: an inline `export class Reader` can make the nested helper itself non-private through the export-ancestor check, whereas a later re-export leaves the helper locally direct-call-only and requires the class-ancestor guard to preserve `Reader.toString()`.

— Agent 10
