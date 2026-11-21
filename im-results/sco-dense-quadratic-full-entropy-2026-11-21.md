# Dense full-entropy quadratic SCO chosen-query functional reconstruction

**21 November 2026. Intermediate, source-pinned engineering evidence. Existing release status: RELEASE-BLOCKED.**

## Hypothesis, control and original source

An SCO server retaining a secret, arbitrarily dense quadratic function may prevent the client from reading the original JavaScript text while still exposing enough chosen-query output to reconstruct the function. The previous two-rotation test in im-results/sco-quadratic-529-live-oracle-2026-11-21.md had a small 930-pair structural prior that a source-aware attacker could fit in only two requests. That was correct evidence for its narrow function family, and was not a realistic generic 529-query lower-bound sample.

This follow-up samples **529 independent cryptographically random unsigned 32-bit coefficient values**, 2,116 random bytes or **16,928 bits**. Its original Node ESM private async export evaluates the full 32-input/32-output Boolean degree-at-most-two ANF. A local array literal inside the private export holds the coefficients; a separate public identity export keeps the module partition genuine. The compiler uses partitionScoSelectedAsyncExports, bindScoModuleExports and a real createScoHandler HTTP server. The emitted public ESM must omit the private array identifier. An unauthenticated private RPC is denied 403. The learner receives an ordinary valid credential, the HTTP origin and the opaque route extracted from the actual served public ESM. It receives no array, original module object, private source, or trusted compiler metadata.

## Exact algebra and planned verification

There are C(32,0)+C(32,1)+C(32,2) = **529** independent Boolean monomials of total degree at most two in 32 inputs. Each monomial has an independently chosen 32-bit coefficient. All 2^(529×32) coefficient vectors define distinct input/output functions because ANF representation is unique. For arbitrary deterministic adaptive chosen-query reconstruction, q responses reveal at most 32q bits in total. Thus **q >= 529** is a worst-case information-theoretic requirement across this unrestricted class. Interpolation on zero, 32 one-hot and 496 two-hot inputs attains this bound. This statement concerns complete identification of every function in that class; it is not a minimum query claim for approximations, restricted function families, hidden-structure shortcuts, nonuniform priors, or cryptographic PRFs.

The actual HTTP learner must send exactly 529 authorized RPC requests. The trusted verifier compares **all 529 recovered ANF coefficients** to the original fresh random array, in the exact monomial order, then shuts the server. The offline model must match four fixed and 1,024 deterministic SHA-256-derived heldout inputs against the original, with zero additional protected server invocations. The 496 quadratic coefficients' GF(2) output span must have rank exactly **32**, so the observed nonlinear component has maximal minimum affine-residual output rank.

An explicit missing-query ambiguity checks one concrete restricted budget: if the 529th low-weight input is omitted, a second quadratic polynomial can be formed by flipping its private pair coefficient by one bit. The resulting polynomial matches the other 528 low-weight observations identically but differs on the omitted input. This check is separate from the generic counting proof, which covers all adaptive algorithms and coefficient choices.

## Code, provenance and unresolved evaluation

- Simulator: sims/sco-dense-quadratic-live-oracle.js.
- Regression: test/sco-dense-quadratic-live-oracle.test.js.
- Reused generic attacker: sims/sco-quadratic-529-live-clone.js.
- Strict JSDoc inclusion: jsconfig.external.json.
- First source-pinned two-platform Node22/Chromium attempt: [GitHub Actions run 44955805660](https://github.com/FlareZ123/obfs/actions/runs/44955805660), executable SHA 12de0a94a9922956625bc90e3879165a94237b54. **Full workflow FAILED**, but the dense-specific test **PASSED on both platforms**. The sole unrelated failing behavioral test was the preexisting SCO closed-world loader refusal expectation: the compiler correctly denied the private Node Worker dependency with the newer TypeError reason "unproved cross-realm host API", while the test regex expected other denial wording. The missing blind-audit artifact was downstream of that behavioral stage failure, not a distinct dense-source failure.
- Linux dense-specific raw sample in this failed workflow: 529 actual protected RPC calls, all 529 coefficients recovered exactly, 1,028 heldouts matched, output span rank 32, denied RPC HTTP 403, private source 6,211 bytes, public facade 567 bytes, private source SHA-256 38f376395e385a23c94c154436db1edbbf2bde04c77a17655be92c04d91b1443, fitting transcript SHA-256 c643240981de88a09a5557e8b27b1cf49e8bcf48e304a9507b49645743965543. HTTP closed before holdouts; no server calls after fitting.
- Windows dense-specific raw sample in this failed workflow: 529 actual protected RPC calls, all 529 coefficients recovered exactly, 1,028 heldouts matched, output span rank 32, denied RPC HTTP 403, private source 6,189 bytes, public facade 567 bytes, private source SHA-256 c447363fece6b244e1bb05ed74f532ccce5b9dbb7bd44f8308acf23687683e9e, fitting transcript SHA-256 babbd1e26df1003f3158c53808f1c7022b8e20124749107a06029c7be345e620.
- The test regex was minimally updated to accept the newer explicit **fail-closed** "unproved cross-realm host API" reason, with no change to production compiler behavior. A new complete [source-pinned two-platform validation 44956308112](https://github.com/FlareZ123/obfs/actions/runs/44956308112), executable SHA bed53aad4a7672f15ac6b70f39330ea81712a4a6, is **PENDING**. Do not promote release status until its complete result is confirmed.

The experiment generates a fresh random source per run and logs SHA-256 digests of original source and full authenticated fitting transcript. It does not log the secret coefficient vector itself. The method and distribution are reproducible, while a sampled function instance is not byte-for-byte reconstructible from the emitted digests.

## Independent security dimensions

**Static source protection:** Private numeric coefficients remain on the SCO server; public ESM does not contain their declared array identifier. This checks the published source against one explicit leak marker and does not certify every possible source side channel.

**Dynamic functionality reconstruction:** Under legitimate unlimited RPC and the known degree-two class, the client can recover an exact functional model and all numeric coefficients. This is an authorized black-box oracle reconstruction. It does not recover arbitrary private program text, source order, variable names or unrelated state.

**Authentication, integrity and domain controls:** The unauthorized request remains 403. The attack does not bypass credential checks or protected code integrity and does not establish effectiveness of host locks.

**Performance and parity:** The private original deliberately reconstructs a dense array on each invocation; the test compares exact uint32 results, without a matched native-versus-transformed full-session CPU profile. The strict 2.5x runtime cap remains **unmeasured**. No claim is made for arbitrary JS values, dynamic reflection or compatibility beyond this numeric family.

**Decision:** Conditional on a passing source-pinned CI run, this would be a precise real-SCO transport witness of the known bounded-degree interpolation theorem with a full, independently randomized coefficient family. It does not by itself establish stronger practical obfuscation than an ordinary private authenticated service. Keep the primary strong-protection release blocked.
