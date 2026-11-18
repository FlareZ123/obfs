# SCO response protocol envelope versus inherited toJSON, 18 November 2026

**Classification:** bounded trusted-server interoperability/correctness hardening, with source-pinned real-HTTP runtime comparison. No new obfuscation secrecy or universal compute claim.

## Red proof

The original `respondJson` passed ordinary `{ok, value}` and `{ok, error}` objects directly to `JSON.stringify`. If an unrelated trusted dependency attached `Object.prototype.toJSON`, that inherited serializer could replace the entire JSON RPC protocol envelope, including successes and generic errors. A real HTTP test sends exact wire JSON bytes and installs a temporary global prototype `toJSON` callback that returns `'ATTACKER_SUPPLIED_ENVELOPE'`, restoring the original descriptor in cleanup. The protected operation returns a primitive `17` to isolate the handler-owned wrapper from intentional nested application serialization.

At [pre-fix exact source 36bf3ca](https://github.com/FlareZ123/obfs/commit/36bf3ca680856ff1ab3ceda08c6e4148081f9ddf), the test failed in **both Ubuntu and Windows** at [run 44252198254](https://github.com/FlareZ123/obfs/actions/runs/44252198254): status 200 body was `"ATTACKER_SUPPLIED_ENVELOPE"` instead of `{"ok":true,"value":17}`. The repair serializes a shallow null-prototype copy of the response envelope, so no inherited `Object.prototype.toJSON` runs on that outer wrapper. Application `value` objects still undergo ordinary JSON.stringify including their explicit or inherited toJSON semantics. The change does not bypass explicit protected-method error containment or expose extra server exceptions.

Exact fixed-source [run 44252348927](https://github.com/FlareZ123/obfs/actions/runs/44252348927) passed Ubuntu/Windows SCO targeted HTTP regression tests and strict JSDoc, including positive success and negative HTTP error controls. Merged as [PR 90](https://github.com/FlareZ123/obfs/pull/90) at [`629cab7b`](https://github.com/FlareZ123/obfs/commit/629cab7bd009a1a00ec50fd3bf770fe044282fc5).

## Paired cost

The manual [source-pinned paired CPU/HTTP workflow](../.github/workflows/manual-sco-policy-args-paired.yml) was generalized to accept optional original/fixed commit references. [Successful run 44252570595](https://github.com/FlareZ123/obfs/actions/runs/44252570595) compared exact source `36bf3ca` vs `b2275b29` as isolated Node 22 checkouts. Its companion `sims/sco-policy-args-paired.js` sends identical authenticated and operation-authorized loopback HTTP requests to both handlers, checks each result byte-shape, alternates order for seven pairs per input size per OS, and reports individual ratios. The script's separate one-vs-two parser microcheck is a **fixed harness calibration**, not a cost attribution to this serializer change.

| JSON bytes | Ubuntu HTTP fixed/original median | Windows HTTP fixed/original median |
| ---: | ---: | ---: |
| 71 | 0.994× | 1.007× |
| 1,063 | 1.004× | 0.928× |
| 16,423 | 0.985× | 1.057× |
| 60,039 | 0.994× | 0.987× |

All 56 paired HTTP comparisons completed with 0/56 ratio strictly above 2.5×. The largest reported single pair was 1.8551× (Windows, largest body). These selected localhost HTTP samples with simple primitive returns do not constrain private operations returning large object graphs, TLS/network costs, highly concurrent service, other application work, all runtime variants, or worst-case schedules. The additional null-prototype envelope copy is shallow and bounded by the three handler-owned response fields.

## Boundary

This fixes an ambient inherited serializer hazard inside a trusted server. It cannot defend against a malicious server runtime able to replace `JSON.stringify`, cannot guarantee the semantics of application-owned nested `toJSON`, and cannot prevent authorized online relaying. The overall strong-obfuscation release remains blocked.
