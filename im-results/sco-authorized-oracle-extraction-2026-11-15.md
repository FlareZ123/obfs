# SCO authorization protects the secret key, while a finite authorized oracle can be cloned

Date: 2026-11-15. Agent 7. Intermediate adversarial finding tied to executable code. The objective is to establish a **measured threat-model limit**, rather than infer security from server-side source privacy.

## Attack contract and access

The experiment in `sims/sco-oracle-exhaustion.js` starts a real `createScoHandler` HTTP server whose private operation computes the first byte of an HMAC-SHA-256 keyed by a fresh, random, 32-byte secret. Its public input is exactly one integer from 0 through 255. The server requires a legitimate session header and validates both the outer `batch` operation and each nested `sample` operation. The attacker is a legitimate caller allowed unlimited RPC requests, as specified in SCO mode. The attacker cannot read the server memory, filesystem, secret key, or code.

The attacker enumerates the full bounded input domain in a single authorized 256-operation batch and copies each returned output into a table. Then it independently enumerates the same domain in 256 individual authorized requests. The independent serial responses and the original private function are compared byte-for-byte with the batch-derived table.

## Reproduction and measured result

Manual-only Windows/Ubuntu workflow [43691354928](https://github.com/FlareZ123/obfs/actions/runs/43691354928) ran at commit `955b569b7ebd2361ce0d1b7dc6f160b8ca0b4735` with Node 22. Both platforms **passed** the attack and strict JSDoc typechecks.

| Measurement | Ubuntu | Windows |
|---|---:|---:|
| Enumerated input values | 256 | 256 |
| Exact functional matches | **256/256** | **256/256** |
| Total HTTP requests (batch + serial confirmation) | 257 | 257 |
| Total server operations | 512 | 512 |
| One batch (256 operations) elapsed | 48.14 ms | 142.12 ms |
| Serial 256 calls elapsed | 242.04 ms | 178.64 ms |

Timing is loopback and one execution per runner, so it does not establish reproducible network latency distributions or the 2.5x compute bound. The batch and serial timings include HTTP and authorization, do not represent isolated server CPU. The HMAC key was **never recovered** and was not needed: the 256-entry table implements identical behavior for every permitted input.

## Interpretation and limits

Server-side source and key withholding survive the static-code extraction attack, but **functional confidentiality is lost for a small exhaustive input domain under unlimited legitimate requests**. Authorization of each request and each nested batch item does not change that mathematical outcome when all 256 queries are allowed. The result is not a general break of HMAC-SHA-256, key extraction, or a claim that every SCO operation can be cloned. A large, high-entropy or stateful input domain can make this particular enumeration strategy impractical; rate limits or strict usage policy change the assumed unlimited-query attacker model.

Production SCO protection decisions therefore require an explicit oracle-use budget and operation-specific leakage analysis. Preserve `createScoBatchMethod` inner preflight because it blocks unauthorized operations; it is orthogonal to exhaustion of *authorized* operation behavior. The result reinforces the decision in `im-results/decision-attack-grid-2026-11-15.md` to evaluate adversarial reconstruction and cost independently.
