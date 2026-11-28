# Closed-world own-property rewrite through inert nullish/truthy owner selection

**Agent 5, 28 November 2026; provisional; no accepted compiler proof or strong-security claim.** Exact candidate branch agent5/private-logical-owner-proposal-20261128, production/test source head 97c1e6fd963d1f3e44b1f1cf8e160ca3493ee54a. Focused cross-platform CI remains queued at writing. This entry is an intermediate falsifiable hypothesis, not a result in results/.

## Candidate and proof boundary

Given an ordinary object literal bound as a private, unique, non-reassigned lexical owner, JS nullish coalescing and logical OR both return that non-null/truthy left operand without evaluating the right-hand expression. Consequently, a simple alias initializer such as "const alias=owner??foreignFallback" or "const alias=owner||foreignFallback" retains the same object identity and own keys, even when the fallback would throw if evaluated. This relies only on the ECMAScript truthiness of ordinary objects and the existing local alias/escape proof, not on guessing across arbitrary expressions.

The candidate modifies src/properties.js to inventory LogicalExpression declarations, derive dependencies **only from direct left Identifiers** of operator ?? or ||, and admit the original owner's logical-left occurrence **only** when the entire expression initializes a separately proven private alias variable. Unknown left member calls, logical &&, host/export escapes, reflective Object.keys, dynamic scope and external source observation remain outside the proof and must refuse property renaming. The preexisting proof's reverse dependency and TypeError-source-spelling guards are not relaxed.

The source-pinned test/agent5-private-logical-owner-proof.test.js requires native/emitted JSON parity and positive actual protected-property rewrite yield under COO/SCO/SNO for: nullish owner alias, truthy owner alias, nullish alias with optional-chain own-field read, and nullish owner plus an unreachable JSON.parse invalid fallback. Negative cases must preserve the original key: reflection through Object.keys after either alias operator, unknown owner && null, and an alias exposed to globalThis.

An independent broader baseline-only branch agent5/private-optional-owner-proof-20261128 tests six optional owner flow shapes, and is likewise queued; do not conflate these source pins or classify a missing rename as runtime misbehavior.

## Threat model and next validation

The observation that local property renaming is possible says nothing about resistance to source reconstruction, instrumentation, run-time integrity bypass or authorized SCO oracle cloning. There is no 2.5x full hot-work performance proof, no cross-file/ESM generalization, and no evidence of incremental protection over an equally trusted minifier. The established results/README.md stays NO-GO/RELEASE-BLOCKED. If CI succeeds, request Agent 1/7 peer analysis before proposing integration and run full exact-head Node/Chromium/source-observer negative controls; if red, preserve the exact failing input and disambiguate native/output mismatch from a simple positive-yield refusal.
