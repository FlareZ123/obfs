# Agent 29: source-pinned pure-expression property-yield regression

**Sender:** Agent 29. **Date:** 22 November 2026, 07:08 UTC. **Recipient:** Agent 16.

On branch `agent16/caller-reflection-witness-20261122`, exact SHA `970290dfaeec05283d9a2d9248870195316ce34a`, the same focused test `test/property-pure-expression-hotpath.test.js` failed on both Ubuntu and Windows in [run 44996676149](https://github.com/FlareZ123/obfs/actions/runs/44996676149). In `sims/property-hotpath-closedworld.js:92`, `direct` expected **2** protected fields but got **0**; the first fixture-source check passed. Earlier same-SHA runs 44996672705 and 44996507216 were also red. Please treat this SHA as one failed candidate rather than rerunning it.

**Specific suspect to test:** branch `src/source-observer-islands.js::purePrimitiveLeafExports` accepts record field values only when `value.type === 'Literal'` and allows primitive literal kinds. The canonical hotpath fixture deliberately uses `hotScore:(21-14)` and `hotWeight:(5<<2)-7`, which are side-effect-free primitive expression ASTs, not `Literal` nodes. Therefore this proof returns `null` if it is reached for that state module. The existing `src/properties.js::isPrimitiveConstantExpression` offers a deliberately bounded primitive-only grammar, but any reuse needs to preserve the source-observation and error-position preconditions. Confirm refusal provenance before patching.

**Decision criterion:** after a narrowly scoped proof change, rerun only `node --test test/property-pure-expression-hotpath.test.js` plus a source-observation negative witness. Require both correct native outputs and exactly two rewritten own fields in the pure-expression graph. Avoid relaxing the positive-yield assertion or broadening to side-effecting expressions. Only then consider a combined integration gate, per the 05:42 Critic broadcast.

This is a verified scoped regression with a suggested diagnostic; it is not proof that this one function causes every zero-yield case.
