# Matched equal-trust native Node and SCO rank-six polynomial oracle cloning

**Agent 11, 21 November 2026. Status: two-platform behavioral attack-side comparison under the fixed exact-rank-six degree-two promise.** This report supplies a specifically matched control against over-attributing server-private polynomial predictability to the obfuscation framework. It does not establish that one service is cryptographically stronger or faster; both share the exact same mathematical oracle.

## Design and matched boundaries

Two local HTTP services independently host precisely the **same private JavaScript module source**, obtained from test fixture `privateSource()` in `sims/sco-rank6-adaptive-real-http-clone.js`. It defines a 32-bit deterministic function with six independent hidden parity masks, three disjoint nonzero quadratic polar pairs and an arbitrary affine component, so its joint quadratic polar radical has exact codimension six.

1. **SCO service:** generated public RPC facade via the actual `partitionScoSelectedAsyncExports` and `createScoHandler` APIs. The trusted server imports the private function; the attacker receives public method routing plus a legitimate credential.
2. **Plain Node control:** direct `http.createServer` endpoint exposing the same `POST /obfs/rpc` JSON request/reply wire contract and authorized secret-function evaluation. The private source is kept inside the trusted server, never returned over HTTP.

Both deny a POST without the agreed `x-demo-session` credential with HTTP 403. In either branch the attacker uses **the same unchanged implementation** `learnViaHttp` from the existing authenticated SCO rank-six attack. It makes adaptive chosen RPC requests using independent 32-bit random draws from `crypto.randomBytes`, replays them from its local tape when a missing asynchronous reply arrives, and constructs a signature-verified exact-rank-six quadratic model. After learning, both servers close, and the attacker evaluates 1,032 designated inputs offline against independent trusted private-function outputs. All learning input-output pairs are obtained through actual HTTP; no imported private source is handed to the attacker.

The private source SHA-256 is checked equal between the two services, and the test also asserts equal authorization status, output fidelity and no private RPC calls after shutdown. Because each experimental branch independently samples fresh randomness, **actual query counts and transcript SHA hashes may differ**. Those differences do not measure a structural security advantage. The theoretical confidence cap is **516 chosen queries** for each, conditional on the same exact-k=6, degree≤2 promise and uniform independent sampling.

## Reproduction evidence

Standalone CommonJS/JSDoc [`sims/sco-vs-native-rank6-matched-oracle.js`](../sims/sco-vs-native-rank6-matched-oracle.js), initial commit `0fcadbb63dee5beb6feafc72bedeb7d44265f32f`. The fixture builder is exported **solely for the test server's trusted setup**, commit `67b457d47ce35be09982aacc6e77003df0db5aad`. The source is enrolled in the existing strict JSDoc project and existing Windows/Ubuntu manual low-rank workflow without creating a new workflow.

At source SHA `20be93c2547f9f809a7005b822016ad8e4c39979`, [GitHub Actions run 44962950737](https://github.com/FlareZ123/obfs/actions/runs/44962950737) executed the named matched native/SCO control step successfully on both Ubuntu and Windows, along with strict JSDoc checks. The status of the full job should be taken from the completed run record.

The test's `MATCHED_SCO_NATIVE_RANK6_ORACLE` log includes actual authorized request counts and transcript SHA hashes for each OS. It establishes that both source-identical services were **functionally cloned with fewer than 516 authorized queries**, both rejected unauthorized requests, and both had **1,032/1,032** offline heldout matches after HTTP shutdown, with zero post-training private RPC calls.

## Interpretation

The matched control directly addresses a critical causal attribution issue: the low-degree, low-radical-rank **function** is learnable from any unlimited legitimate chosen-input oracle implementing it. Hiding the function's source with SCO does not remove this mathematical predictability. At the same time the experiment provides **no evidence that SCO creates the vulnerability**: the plain authenticated server is cloned by exactly the same method.

These are high-confidence conditional functional-clone attacks, not unauthorized credential bypasses, source-text reconstruction, generic JavaScript deobfuscation, dynamic instrumentation resistance, or a measured runtime-performance comparison. Equal-trust comparisons, source-fidelity and the 2.5× execution budget remain separate release requirements. The overall project is still **RELEASE-BLOCKED**.
