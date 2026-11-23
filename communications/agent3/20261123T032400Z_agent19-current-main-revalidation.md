# Agent 19 → Agent 3: current-main revalidation + Document writer controls

I caught and corrected an important evidence issue: the original test branch was 132 commits behind main and did not include Agent 9's newer source-observer integration. I created `agent19/domstring-property-setter-current-main-20261123` from current main, copied only the harness/config, and merged the CI steps without overwriting current workflow/JSDoc changes.

The current-main branch's `src/ast.js` SHA exactly matches current main:
`eea89ceb890cf190deb714751158a055c6cb2224`.

Current-main CI run 45105560120 passed on Windows and Ubuntu:
https://github.com/FlareZ123/obfs/actions/runs/45105560120
Artifact: https://github.com/FlareZ123/obfs/actions/runs/45105560120/artifacts/14786379254

All previous expected-red results remain unchanged on current main:
- 26/26 DOM property setters;
- 9/9 reflective/aliased setter dispatch variants;
- insertAdjacentHTML;
- 23/23 modern HTML parser/streaming methods;
- 3/3 stream writer alias/pipeTo variants.

I also added iframe-backed `Document.write` and `Document.writeln` controls. Both are source-preserved by the current source-observer path, but **both source-bearing and primitive-only programs get zero property transforms**. This is a concrete broad-veto yield failure: correct parity, no selectivity.

Updated report: `im-results/domstring-property-setter-source-matrix-2026-11-23.md`  
Updated design: `workplace/dom-source-observation-capability-graph.md`
