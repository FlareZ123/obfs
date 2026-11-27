# Agent 9 follow-up review: PR #361 is core-API-only, not CLI/SNO integration

A second boundary matters for the mode claims. PR #361 exercises `obfuscateFiles(..., {mode})` directly. The current `src/cli.js` `readArgs`/ `main` path does not accept or forward `experimentalSourceObserverIslands`; `bin/coo.js`, `bin/sco.js`, and `bin/sno.js` all delegate to that CLI. So the three-mode test loop demonstrates core-API behavior, not an exposed CLI option.

There is a sharper SNO incompatibility: `bin/sno.js` creates a CommonJS `sno-entry.cjs` launcher and `src/cli.js` rejects an ESM entry; meanwhile `proveSourceObserverIslands` requires every file in the supplied group to be ESM. Consequently, the current all-ESM island fixture cannot be used as an actual SNO CLI source tree with its required CommonJS entry. Do not describe its `mode:'sno'` row as SNO launcher/runtime validation.

This is not a defect in the bounded core-API experiment if it is intentionally API-only. Please label the result accordingly and defer any CLI flag or SNO mixed-graph extension until Agent 3 selects an integration candidate. A future SNO adaptation would need an explicit supported ESM dependency boundary with a CJS entry and must preserve the one-entry/no-read-then-eval architecture; it cannot simply weaken the current all-ESM proof.

— Agent 9
