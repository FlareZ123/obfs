# SCO matched ratchet: hostile Account A load versus Account B session budget

**Agent 7, precommitted 18 November 2026 UTC. Status:** adversarial resource-isolation falsification of the existing mainline SCO ratchet, not a proposed universal resource-hardening solution.

## Trust and workload

Reuse the same implementation in `sims/sco-ratchet-batch-candidate.js::makeServer` with its 256-bit private HMAC root, 8,388,608-byte fixed per-event computation, actual `createScoHandler`, verified Account A and Account B bearer credentials, strict sequential per-principal state, per-principal FIFO and total pending limit. A and B are independently authorized. A is the attacker in the prompt's unlimited legitimate-request model, while B is an innocent distinct principal.

The original B workload is 16 sequential local HMAC events (one native batch). Its baseline trusted RPC is the identical 16-event batch in a quiet server. The adversarial condition is one valid 64-event A batch already being executed while a B client starts its valid next batch; the server's own event loop executes A's synchronous CPU-heavy HMAC work. A is allowed to issue this call. The test uses a separate child-process B HTTP client and a server-side test-only synchronizing signal at the start of A private work, so the child can submit B's request while the parent Node event loop is busy. No forged B credentials or artificial service delay. The same B inputs, principal identity, key and state-machine code are used for quiet and attacked runs.

## Predeclared checks and decision

Verify actual A and B status 200, original/native output equality, A cannot claim B's identity via request data, and 16 B events execute exactly once. Record at least seven independent quiet and loaded B elapsed wall times, native B times, and every strict loaded B to native B ratio >2.5×. Observe whether A's admitted work blocks B's HTTP request from being accepted, even with per-principal isolation. Use an explicit independent child-start synchronization signal. If there is no verified overlap (B submitted while A's private batch is executing), reject the measurement rather than infer fairness.

Hypothesis: synchronous server-side 64×8 MiB private HMAC on the single Node main thread can cause a *cross-account* latency budget failure for an unrelated B session, notwithstanding per-account FIFO isolation. It is a workload/configuration-specific resource-fairness counterexample. If all loaded B/native pairs stay <=2.5×, report the contrary and preserve timings. A genuine multi-worker isolated service or server-enforced CPU quotas could change the result and should be treated as an untested alternative, not silently assumed.

This is **server compute contention**, not static deobfuscation or B account takeover. Protecting source/private keys from A is unaffected. An attacker with unlimited legitimate A requests can create traffic and a server without resource controls cannot promise B latency across arbitrary load; this test gives concrete evidence for one bounded burst only. Do not claim a universal impossibility theorem or a general 2.5× performance result.

Publish raw source hash, event counts, exact Node version/OS, all paired ratios, predeclared code, negative quiet control, and same-key native output parity. Work belongs to `im-results/` until independently confirmed.
