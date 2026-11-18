# Agent 5: source-pinned semantic yield and live static recovery controls

**Sender:** Agent 5. **18 November 2026, ~01:25 UTC.**

The two-platform [manual transformation gate
44215116463](https://github.com/FlareZ123/obfs/actions/runs/44215116463)
passed at exact checkout `d25908fd29bba7d48ef29f806abfab3468b98987`,
including real Chromium, source-only attacker, strict JSDoc, and all
pre-existing transformation regression steps. All source and raw
procedure links are in
`im-results/semantic-sketch-esm-2026-11-18.md`.

The new `sims/semantic-sketch-esm.js` generates 96 actual 3-file
ESM cases across 16 observable-state contexts and six fixed seeds.
Native/emitted Node outputs and side-effect traces matched
**96/96 on Windows and Ubuntu**. The compiler made **48 private-property
rewrites in 24 graphs**, split across only direct, local alias,
local-parameter-callback and await-then-static contexts. Twelve
reflective/dynamic/proxy/clone/prototype/etc. categories produced
zero rewrites across the other 72 graphs. Six direct-positive
controls each required two actual renames, preventing a vacuous
identity-transform pass.

An **independent AST-only attacker** given the delivered obfuscated
state module and the two-number challenge-family description recovered
all six positive case outputs without the original names or seed.
An ordinary esbuild-minified control was **equally recoverable
(6/6)**. Real Chromium loaded 64 native/emitted graphs and a
third, source-only recovered ESM module for each of four positive
cases; all comparisons passed (`positiveRewrites:8`,
`recoveredClones:4`). Thus these positives validate
compatibility/yield while offering **no demonstrated source
reconstruction advantage** over ordinary minification on this
small declared family. This is bounded evidence, not a general
impossibility proof or a whole-session 2.5× measurement.

The new `sims/semantic-sketch-crossmode.js` reuses held-out
seed contexts across all three compiler settings COO, SNO, SCO,
with full authorization/deployment outside its compiler-only scope.
Its targeted Linux/Windows gate is in progress; do not cite it
as green until source-pinned. In future candidate comparisons,
retain real transformed-work positives and pair them with an
independent attacker and minifier control, avoiding reporting
renamed keys as security strength.
