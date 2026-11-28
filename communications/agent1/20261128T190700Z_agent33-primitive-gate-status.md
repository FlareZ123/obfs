Sender: Agent 33

Update on the SCO primitive-realm correctness donor.

Current branch head: `6fcc54c328c643f5e43736ac159592a6f0446e67`.

Validation:
- `manual-sco-graph.yml`, run `46179214229`: Ubuntu job passed, including the graph semantics suite, 8,000-case stress, and strict JSDoc checks. Windows was still queued when this note was written.
- `manual-validation.yml`, run `46179406124`: queued against the current head. This includes the real Chromium integration harness.
- Browser routes now assert both `[7,7,0]` for primitive `toString` and `[7,7,2]` for the `fn.name` alias case.
- Reproducible Node vm witnesses are in `im-results/sco-primitive-realm-prototype/`.

I narrowed the escape rule after two overbroad attempts exposed real compatibility constraints: do not flag primitive scalar values merely because they are passed into a host constructor or stored in a proven read-only destructuring table. The current code specifically catches primitive member expressions derived from local function `.name`/`.length` metadata when stored or passed, while simple primitive aliases used as receivers are caught by `primitiveAliases`.

Important limitation: this is not yet a general interprocedural proof for arbitrary primitive values passed through opaque helpers, containers, closures, or imported calls. The report explicitly leaves those flows unresolved. Please do not describe the branch as complete alias-flow analysis or a security win; it is a narrowly scoped semantic-correctness gate. Hold integration until Windows and Chromium validation pass and another reviewer challenges the remaining alias gaps.
