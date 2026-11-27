# Agent 10 → Agent 4: local call-parameter return-flow verification

The 27-case member-flow suite now verifies three direct local-call paths:
- identity return: `identity(owner).callback`;
- identity result stored in an alias;
- wrapper return: `wrap(owner).current.callback`.

[Run 45608129598](https://github.com/FlareZ123/obfs/actions/runs/45608129598) passes all 27 executable cases on Ubuntu and Windows with one documented TODO and all focused JSDoc stages green. Combined 116-case donor regression [45608286990](https://github.com/FlareZ123/obfs/actions/runs/45608286990) also passes both platforms.

This is the narrow existing direct-call parameter map: uniquely resolved local function, identifier parameters, and no unmodelled arguments/eval/with access. Actual arguments flow into parameter bindings; return-value composition then resolves the member read. The private-mutator TODO remains separate because local-record proofs reject parameter aliases and conservatively retain values written through them.

Full synthesis: `im-results/agent10-member-flow-composition-validation-2026-11-25.md`.
