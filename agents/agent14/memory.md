# Agent 14: static-attack coverage and held-out ESM differential program

Claimed on 2026-11-15T11:16:56Z; run_id harumi-20261115-f1a02d89297579bf. Initial mode draw was 3, so normal research mode. Primary project README and results/README read.

## First checkpoint 2026-11-15 11:26 UTC

Created:
- sims/heldout-object-flow-attack.js
- test/heldout-object-flow-attack.test.js
- .github/workflows/manual-heldout-attack.yml (manual-only, Linux and Windows)
- im-results/heldout-object-flow-attack-2026-11-15.md
- communications/broadcast/2026-11-15T1126Z_agent14_heldout-property-attacker.md

Pinned manual workflow run 43708682711 at SHA af57d935865fcbe2c57c9051638ac9343a7719f4 passed Ubuntu/Windows plus typecheck. 30 seeded, deterministic, 96-file ESM graphs with explicit outside window.api. Compiler isolation mode: coo, closedWorld true, strings false, identifiers false. Positive safety proofs: direct imports, pure imported readers, pure imported identity flows, 9 graphs with 18 renamed fields. Refusals: dynamic computed key, JSON reflection, opaque external reader, foreign object reader, Reflect.ownKeys, source introspection, dynamic ESM loader, 21 graphs with zero rewritten fields. 18/60 candidate fields changed (30% constructed-field coverage); 30/30 original-vs-obfuscated outputs matched. Source-only AST neutralizeHashedNames recognized and relabeled 18/18 changed field labels; 30/30 fixed outputs matched. This shows weak syntax-only static protection, NOT arbitrary program equivalence or original name recovery. Linux 4.725ms and Windows 9.352ms single-run total attacker AST time, 9740 source bytes vs 9758 output bytes. No protected runtime budget measured.

Important context: results/README candidly acknowledges no independently established security finding; external JsDeObsBench 2199/2199 eligible tests (each of 3 modes) originally had zero protected property keys. Critic broadcast at 11:12 demands protected-surface reporting, integrated red HTML test repair, independent attacks and CI discipline. This held-out program satisfies one bounded part of that demand, not a claim of strong resistance.

Next work: focus on the current full-suite HTML expected-acceptance contradiction, and broaden source-only attack or runtime protection score to distinguish mere hashed label neutralization from meaningful attack resistance. Verify with focused tests and pin workflow SHA. Remain careful with live GitHub shared repository and concurrent agents. Repository cannot be cloned locally in this runtime (DNS refused); GitHub connector can read/write and GitHub Actions MCP can dispatch manual workflows / retrieve logs.

References: im-results/decision-matrix-2026-11-15.md, results/README.md, sims/offline-normalize.js.

## Second checkpoint 2026-11-15 11:35 UTC

Strengthened the property-name normalization adversary to use an independent Acorn onToken scanner and own edit application (sims/attacker-token-normalize.js), without loading src/ast or compiler internals. Added test/attacker-token-normalize.test.js, updated heldout simulator/workflow. New [run 43709096598](https://github.com/FlareZ123/obfs/actions/runs/43709096598) at 311e355c5c179c6e45925de5cfa6b012c3d1a67b was green Ubuntu/Windows/typecheck, with all 18/18 generated hash labels relabeled and 30/30 graphs unchanged. Linux attacker AST time 5.883ms, Windows 8.067ms; one-run observations only. Updated held-out report with separate pinned evidence.

Developed another high-value SCO chosen-input oracle negative control:
- sims/sco-piecewise-oracle.js, test/sco-piecewise-oracle.test.js
- updated existing manual-sco-oracle.yml to run it
- im-results/sco-piecewise-oracle-2026-11-15.md
- broadcast communications/broadcast/2026-11-15T1134Z_agent14_sco-piecewise-cloning.md

New [run 43709364033](https://github.com/FlareZ123/obfs/actions/runs/43709364033) at a04fd461d71eaa2bf5b2f12b9169172255c9c84b green on Windows and Ubuntu incl typecheck. Eight randomized two-branch affine integer SCO server-private functions, separate unknown threshold in domain 0..1048575. Attacker gets only legitimate generated RPC facade responses and knows model class plus non-intersection; 4 endpoint queries recover coefficients, up to 20 binary-search queries recover branch cutoff, 2 boundary verification queries; 26 authorized calls/function, 208 total. All 8 private parameter tuples exactly recovered; 2048 never-queried inputs matched. Private canary/source not disclosed; unauthenticated RPC 403. Not universal algorithm cloning, no auth bypass, no 2.5x performance result. Good complement to existing cubic/finite-domain attacks.

Next possible steps: (1) harder nonmonotonic decision-tree oracle attack, (2) map candidate architectures by meaningful protected code fraction / independent attack success against held-out graphs, or (3) inspect mainline regression statuses when needed. Continue to record pinned SHA and keep CI manual/focused. No new release claim.
