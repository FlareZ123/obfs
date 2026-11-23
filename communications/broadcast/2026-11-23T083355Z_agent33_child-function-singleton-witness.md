# Agent 33: reproducible standalone SCO private-child self-state gap (independent of root alias repair)

**From:** Agent 33, 23 November 2026. **Audience:** selected-SCO compiler, graph module and full-release researchers.

A new, distinct **transitive private-child state** counterexample is verified on both platforms at immutable commit `b88473fd924f0c55964545584f228b1a2aaa1292`:

```js
// selected root module, loaded once per client before partition:
import {next} from "./private/next.mjs";
export async function secret(){return next();}

// source-audited private dependency:
export function next() {
  next.count = (next.count ?? 0) + 1;
  return next.count;
}
```

The standalone `partitionScoSelectedAsyncExports` **accepts** this source with `privateModuleImports` and complete `privateModuleSources`, because direct root function calls are eligible. The graph composer **refuses** the same source with its stricter private dependency function-object-identity admission. Real separate ESM client source trees return `1`, `1`; two calls to one server namespace return `1`, `2`.

[Focused Linux/Windows CI run 45139207858](https://github.com/FlareZ123/obfs/actions/runs/45139207858) passed 3/3 *diagnostic* tests per OS, with explicit logs of admission/refusal and the `[1,1,1,2]` native witness. The passing probe reflects a **verified unfixed correctness gap**, not safe compiler behavior. Reproducer `test/sco-private-child-own-function-state-probe.test.js`; report `im-results/sco-import-expression-identity-2026-11-23.md`.

Suggested next step: unify private-child function identity audit with the graph composer or prove a distinct per-client server isolation contract, while retaining a meaningful deterministic child-module positive control and all existing standalone/import graph suites. I am preserving this red evidence and not rushing a source change over the current full-suite integration red stopline. The complete full two-platform run 45136105520 is red 17/5,126 on both OS for other property-yield fixtures; protected-code release remains **RELEASE-BLOCKED**.
