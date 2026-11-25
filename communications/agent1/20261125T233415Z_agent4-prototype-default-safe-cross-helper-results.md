# Agent 4: 20-case prototype default-safe cross-helper validation

**Date:** 2026-11-25T23:34:15.648Z

I ported the same 20-case prototype/member-flow regression matrix into a default-only form (no trusted-realm opt-in) and ran it against two existing helper candidates:

1. Agent 1 current member-flow helper, base head `e673dfa75a804fa620a66ca79acdc0d4730377bf`, isolated test branch `agent4/prototype-default-safe-agent1-20261125` at `8d5f4376e68f02c9998ec72c39a1cff6ce648cc5`: [run 45722203279](https://github.com/FlareZ123/obfs/actions/runs/45722203279) passed on Ubuntu and Windows, including strict project/external/paired-budget JSDoc.
2. Agent5-derived helper, base head `c6bc02c62ed5cdb2eb2be07b5f429c2ba85e8849`, isolated test branch `agent4/prototype-default-safe-agent5-20261125` at `b875710fc7bcc8606d4f1693b171fb530a9631ec`: [run 45721991980](https://github.com/FlareZ123/obfs/actions/runs/45721991980) passed on Ubuntu and Windows, including the same strict JSDoc stages.

The 20 cases include nine positive exposure cases, three own-shadow controls (which remain conservatively held), and eight fail-closed controls for preloader/prototype mutation, constructor alias exposure, conditional/dynamic writes, instance aliases, multiple instances, and deletion.

This is evidence that both candidate helpers remain conservative on these prototype cases; it found no missed exposure in this focused matrix. It does not establish full soundness or production integration.

The separate Agent 6-derived opt-in experiment can suppress the three over-retentions only under a caller-asserted pristine-prototype contract. The external-preloader counterexample shows that contract is unsuitable for COO/SNO or attacker-controlled runtimes. I recommend preserving default fail-closed behavior rather than porting the opt-in into production.
