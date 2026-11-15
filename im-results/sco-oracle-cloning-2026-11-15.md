# Exhaustive authorized SCO oracle cloning of a finite input domain

Date: 2026-11-15. Researcher: Agent 8. Status: reproducible, intermediate **negative security result**, deliberately limited to one finite-domain, deterministic operation.

**Prior-art note (within this repository):** Agent 18 had already demonstrated complete 8-bit HMAC-oracle enumeration in `im-results/sco-oracle-exhaustion-2026-11-15.md` with independently measured Windows/Ubuntu CI, and Agent 7 repeated the challenge in `im-results/sco-authorized-oracle-extraction-2026-11-15.md`. This work supplies an independent bounded-batch and standalone-clone reproduction for a different private function. It does not establish a novel attack class. Prefer stronger nonexhaustive functional-reconstruction probes for future SCO research.

## Reproducibility

- Source and attacker: `sims/sco-oracle-clone.js`.
- Pinned CI head: `32f7f3b52189dde47b9b1242c324903eb5136556`.
- [Manual cross-platform run 43692057154](https://github.com/FlareZ123/obfs/actions/runs/43692057154), successful on Node 22.23.4 Windows and Ubuntu.
- Private source SHA-256: `c499ca7cb36edb4c18d30d85f328b1e7de10d515acccd15d20dddafd2331fc0d`; 328 private source bytes. `partitionScoAsyncModule` with `serverOnlyInitialization:true` withholds the private salt and implementation, exposing an authenticated public facade of 1,142 bytes.
- Protected operation: async `classify(value)`, accepting only integer inputs 0 through 255. The internal key, salt array, and five rounds of integer mixing remain server-resident. Its output is another integer 0 through 255.

The attacker observes public source and HTTP responses and may submit any authorized call. The operator's private module and runtime remain inaccessible. The authorization callback is a deterministic test session and a strict method/argument whitelist, sufficient to exercise the route but not production-grade session security. Negative tests returned HTTP 400 for an unknown method, 403 for missing session and 403 for out-of-range input; none of these requests executed the protected method.

## Concrete source-free attacker

The attacker enumerates the **entire permitted input domain** and sends 16 batches of 16 legitimate `classify` calls. It constructs a 256-entry lookup table from the returned values, then builds a self-contained ordinary JavaScript function. That function uses only the table, independently of the server, to answer every permitted input. The validation runner has access to the original module for a final independent correctness check; the attacker lookup constructor does not.

| Result | Windows | Ubuntu |
|---|---:|---:|
| Authorized HTTP requests | 16 | 16 |
| Protected operations queried | 256 | 256 |
| Allowed domain coverage | 256/256 | 256/256 |
| Exact cloned outputs on complete domain | **256/256** | **256/256** |
| Independent clone source bytes | 1,079 | 1,079 |
| HTTP request payload bytes | 13,986 | 13,986 |
| HTTP response payload bytes | 6,371 | 6,371 |
| Legitimate oracle elapsed (loopback) | 29.92 ms | 19.84 ms |
| Internal secret or protected source in client stub | Absent | Absent |

The recovered table's SHA-256 is `0578ea413e97e2032a415b958e2f459ffbda2622ac4dd50c5d9bd44f998b36c4` on both platforms, demonstrating deterministic reproducibility. The 1,079-byte clone is larger than the original source but reproduces all in-scope behavior without further network use.

**Security interpretation:** this is a successful functional-cloning attack, even though server-private source withholding and the tested authorization checks worked as designed. A protected deterministic finite-domain algorithm can be learned by tabulating authorized outputs when query limits permit full enumeration. The attacker did **not** reconstruct private source, recover its hidden key, generalize to unqueried inputs, bypass access controls, or compromise server memory. A larger input domain, stateful functions, secret-dependent responses and rate-limited authorization change practical attack cost and possibility. In the supplied threat model the adversary may make unlimited legitimate requests, so hiding only the JavaScript implementation does not prevent behavior reconstruction for an exhaustible operation.

## Independent dimensions

1. **Static code exposure:** private source was absent from the public SCO facade; no static client-side recovery attempted beyond checking withheld literal strings.
2. **Dynamic/black-box extraction:** authorized behavior was cloned for the entire 256-input domain, after exactly 256 legitimate oracle calls and 16 HTTP requests.
3. **Tamper and authorization:** route policies rejected the three invalid tests, with no unauthorized protected execution. Valid calls nevertheless revealed the finite behavior map.
4. **Semantic compatibility:** 256 out of 256 cloned outputs matched an independent reference implementation, with no side-effect or nondeterminism claims.
5. **Performance:** attack-time cost was 19.84–29.92 ms in a favorable same-process loopback. The clone is local and hence avoids repeated RPC overhead after collection; this experiment was an attack benchmark, not a 2.5× protected-work evaluation.

## Implications

Use SCO server-controlled computation when private source and server-held secrets matter, accompanied by method-specific authorization and abuse controls. Analyze *what outputs reveal*, how large or continuous the permitted input domain is, whether the attacker can cache responses, and whether query frequency is restricted. Claims of resistance to program reconstruction must specify whether the target is original source recovery or functional equivalence via unlimited oracle requests. For finite domains, unrestricted oracle access is a decisive counterexample even without source disclosure.

Companion evidence: [SCO authorization and runtime cost](sco-trust-challenge-2026-11-15.md), [local algorithm/VM recovery grid](decision-grid-2026-11-15.md), and [four-file ESM normalization](multifile-decision-grid-2026-11-15.md).
