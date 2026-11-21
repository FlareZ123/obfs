# Full-rank server-private quadratic functionality cloned with 529 legitimate SCO HTTP calls

**21 November 2026. Intermediate adversarial evidence. The three-mode primary release remains RELEASE-BLOCKED.**

## Boundary and test

The trusted server loads an original, randomly parameterized 32-bit quadratic JavaScript function, then generates a public ESM facade through partitionScoSelectedAsyncExports, bindScoModuleExports and createScoHandler. A separate public identity export keeps the partition real. The attacker has an ordinary authorized credential, sees only the HTTP-served facade and can make unlimited legitimate requests. The private constant names are absent from the public text. An unauthenticated RPC receives HTTP 403.

The attacker derives the opaque method identifier directly from the served public ESM. It makes **529 authenticated HTTP POST** requests: one all-zero input, all 32 single-bit inputs and all 496 distinct two-bit inputs. The existing bounded-degree Boolean ANF learner interpolates all coefficients of the private 32-bit-output function. All query responses are checked for correct unsigned 32-bit shape and the fitting transcript is hashed.

The server is then **closed**. An offline model is checked against the original trusted function on four high-weight fixed inputs and 1,024 deterministic SHA-256-derived held-out inputs. Exactly 529 trusted RPC invocations are permitted; no subsequent RPC serves a held-out answer. The candidate has genuine degree-two terms and the 496 quadratic coefficient vectors have full GF(2) output rank **32**, explicitly checked by the learner and a separate basis routine.

A cubic negative control matches all training answers but diverges on input seven, showing that the global degree-at-most-two promise is indispensable. The specific randomly parameterized two-rotation private function belongs to a smaller family than unrestricted quadratic functions. The **529-query budget is an upper bound for generic quadratic interpolation, not a minimal attacker cost for this particular small family**. Successful functional cloning is not source-text recovery or private-key recovery.

## Source-pinned validation

The implementation is in sims/sco-quadratic-529-live-clone.js, with regression test test/sco-quadratic-529-live-clone.test.js, using the already existing sims/bounded-degree-oracle-functional-clone.js and sims/quadratic-radical-target-inversion.js. Both are included in strict external JSDoc checks via jsconfig.external.json.

- Initial source-pinned Linux/Windows complete validation: [run 44953727646](https://github.com/FlareZ123/obfs/actions/runs/44953727646), SHA 9d186813adf84f950cb578032fa773ec7a262570, **both OS jobs succeeded**. It covered 529 HTTP calls, 1,028 offline holdouts, 403 denial and cubic-negative controls, but it predates the later explicit full-rank and public-byte-method-extraction assertions.
- Final stronger source-pinned Linux/Windows validation: [run 44954316491](https://github.com/FlareZ123/obfs/actions/runs/44954316491), executable SHA 9f8e6e716470ddc09d719c2c273556cc24777842. **Pending at report authoring; verify its outcome before claiming those additional assertions passed.**

Fresh secure random numeric parameters are generated on every run; the result emits source and transcript SHA-256 values, RPC count, output-rank evidence and held-out match counts. Exact random parameters are not emitted, preventing byte-identical reconstruction of a given CI sample while preserving reproducibility of the method and invariants.

## Independent decisions and limitations

**Static protection:** The private original implementation is withheld, as checked by absence of its three private identifiers in the HTTP-served client. Nothing here proves general resistance to a compromised server.

**Dynamic reconstruction:** An already authorized client completely reproduces the function after legitimate selected queries and can run its model with the server unavailable. A similarly trusted ordinary HTTP service exposing the same function has the same mathematical limitation.

**Integrity and host lock:** Unauthorized RPC remains denied. No bypass of authentication, domain locks, source integrity or server-side controls is demonstrated.

**Compatibility and performance:** Only the scalar uint32 JSON-wire contract is tested. The attack has **no** matched native-versus-compiled, client-inclusive, or worst-case 2.5x compute-performance result. It makes no claim about browser operation, non-JSON JavaScript values, stateful functions, latency or tenant contention.

**Decision:** This bridges the existing degree-two interpolation theorem to real authenticated SCO transport. It is an intermediate negative candidate-selection finding and does not justify promotion to an established new theorem or a stronger obfuscation release.