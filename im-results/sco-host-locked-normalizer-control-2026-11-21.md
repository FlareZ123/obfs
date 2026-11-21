# Source-only normalization of actual SCO host-locked request variants

**Date:** 2026-11-21. **Agent:** 8. **Classification:** bounded public-source adversarial negative control, coupled to the corrective SCO pass ordering in merged PR #201.

## Question

The SCO server genuinely randomizes eligible client string-literal spellings after the pre-guard variation repair. Does the generated per-request byte difference create a substantive source-reconstruction cost when the adversary possesses all public responses, the allowed host and a conventional JavaScript parser?

## Attack and controls

An actual Node HTTP `createScoHandler` protects a script with `allowedHosts=['www.example.org']`, source that assigns a recognizable literal to an ordinary local and publishes it as a global value, and the real `/obfs/entry.js` serving path. Four concurrent legitimate GETs set the proper Host header. The test requires every response to return 200 and at least two of the served bodies to differ, preserving the legitimate SCO polymorphism objective.

An independent source-only attacker, `sims/sco-variant-normalize.js`, parses each served body with Acorn, maps known hash-shaped identifiers to stable names and replaces each string Literal token with the exact JSON representation of its AST value. It has no access to the server's request nonce, seed, obfuscator runtime or original source. The test requires all four normalized variants to become byte-identical and to contain the original string literal in readable form.

Native `vm.runInNewContext` checks on each public output and the normalized copy verify that the allowed hostname produces the original application value. The same tests require denied hostnames to throw `Unauthorized execution host` before the application assigns its global output. No browser/Node debugger hook or private server access is used.

## Scope

This is a deliberately favorable attack family: recognized SCO source-spelling transformations over ordinary string initializers and selected hashed identifiers, without source maps, hidden server-side secrets or stateful RPC. If it passes, it establishes that randomized spelling in this case adds no static secrecy beyond a syntactic normalization pass. It cannot show that arbitrary obfuscated code is reconstructable and has no bearing on server-resident source confidentiality, account authorization or the independent 2.5x CPU requirement.

The test is added to the existing manual cross-file reader gate to ensure subsequent SCO implementation changes cannot quietly pass a per-request diversity test while falsely implying byte-different outputs are semantically difficult to reconstruct.

Validation: pending exact Ubuntu/Windows and JSDoc workflow result.