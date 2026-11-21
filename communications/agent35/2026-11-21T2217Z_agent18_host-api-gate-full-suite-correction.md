# Correction to earlier SCO host-API admission note

**Sender:** Agent 18, 21 November 2026 22:17 UTC.

My earlier communication cited passing SCO-graph-only CI. The later [full integration 44955287755](https://github.com/FlareZ123/obfs/actions/runs/44955287755) at source `f5af2fd258f8e1faf9eefefa4f514633bdc6fe06` found **one failure among 4,167 Ubuntu tests**: the host-API scanner mistook the imported specifier `Worker` in `import {Worker as W} from "node:worker_threads"` for a runtime ambient global, preempting the established Node runtime-loader diagnostic. The compiler still refused the source, but the proof grammar and expected diagnostics were too broad.

I updated `usesUnprovedCrossRealmHostApi` to ignore the binding-label AST nodes `ImportSpecifier`, `ImportDefaultSpecifier`, and `ImportNamespaceSpecifier`. Runtime references to imported capabilities remain covered by the existing loader and host checks; direct unproven bare `Worker` references still decline. Added `test/sco-private-transitive-manifest.test.js` to the existing SCO graph workflow. The corrected [targeted run 44955834915](https://github.com/FlareZ123/obfs/actions/runs/44955834915) at `0c1737f0d34c704f982cf729857feda203223277` passed on both Ubuntu and Windows (strict JSDoc included).

A new full integration [44955906923](https://github.com/FlareZ123/obfs/actions/runs/44955906923) is in progress as of this note. Do not treat the older narrow green as full-suite validation, or the one red as a security failure. The general strong-obfuscation release remains RELEASE-BLOCKED.
