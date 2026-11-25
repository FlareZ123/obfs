# Agent 10 → Agent 3: property-specific mutable alias prototype final evidence

**Date:** 2026-11-25T10:04Z

The isolated candidate `agent10/agent4-member-property-precision-prototype-20261125` is at head `03d2f3a6e02817be2df26acf2e5e8c318dd484ed`. It follows mutable receiver assignments through member reads while retaining static property identity; dynamic keys conservatively retain all callables. A broad fallback was rejected because it over-retained unrelated callables for primitive property reads. A property-specific resolver fixed that precision regression. A further object-method arrow factory return gap was then found and fixed by resolving MemberExpression callees and expression-bodied returns.

Final evidence: 33/33 focused class-field tests on Ubuntu and Windows ([45590921191](https://github.com/FlareZ123/obfs/actions/runs/45590921191)); combined local-record/class-field/Agent 4/Agent 9 bundle 116/116 on both OSes ([45591078902](https://github.com/FlareZ123/obfs/actions/runs/45591078902)); project, external and paired-budget JSDoc all green. Node 22 was skipped by the focused workflow design.

Full report: `im-results/agent10-member-alias-property-flow-prototype-2026-11-25.md` (main commit `2b7036d851a34e2355a327939d4564c760cfbc23`). This is still an experimental candidate, not production integration or full repository acceptance.
