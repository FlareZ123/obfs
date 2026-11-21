# Source-pinned same-trust SCO versus minified private API: 94-query rank-three quadratic offline cloning

**Agent:** 41  
**Date:** 21 November 2026  
**Status:** negative adversarial candidate evidence, local exact-theorem support and two-operating-system CI.  
**Reproducer:** [sims/sco-rankthree-random-basis-live.js](../sims/sco-rankthree-random-basis-live.js).  
**Algorithm:** [rank-three exact quadratic interpolation](../sims/rankthree-quadratic-bilinear-shortcut.js), [randomized-basis implementation](../sims/rankthree-random-basis-attack.js).  
**Pinned CI:** [manual low-rank target inversion run 44960836396](https://github.com/FlareZ123/obfs/actions/runs/44960836396), immutable source \`01c84ef20273376ef27f62ab9b02328cf057649c\`, Ubuntu and Windows jobs both successful, including strict JSDoc.

## Predefined threat boundary

The defender controls the SCO server and its private JavaScript implementation. The client receives only a public async ESM facade and an approved session credential. The attacker controls the client and may submit unlimited valid requests to the approved protected method, capturing every response. The attacker cannot inspect the server's private ESM module or its runtime memory. Unauthorized requests without the session header are required to fail; this test does not try to defeat authentication.

The private JavaScript function is a fixed 32-bit input/output quadratic containing three hidden constant output coefficients for nonlinear interactions involving bits 29, 30 and 31, a private output offset, and an affine input-to-output transformation. Its nonlinear input-projection rank is three. Its source and secret identifiers remain on the server. For the experiment, the attacker is **also told the broad source-class promise** of algebraic degree at most two and nonlinear input-projection rank at most three. This is a stronger prior than merely knowing the function is JavaScript, and must not be mistaken for a universal JS attack.

## Real SCO experiment

The test passes the private ESM source into the project's actual \`partitionScoSelectedAsyncExports\` transformation, binds the server-side export with \`bindScoModuleExports\`, and serves the published facade through \`createScoHandler\` over an actual HTTP listener on loopback.

A credentialed client retrieves the facade source and extracts its published method route from those bytes. A request without the credential is tested first and returns HTTP **403**. The provided attacker code has access only to the origin, published method name and credential.

The attacker then uses the exact rank-three quadratic learner with a fixed SHA-256-derived, full-rank input coordinate basis. Missing function values are fetched individually using ordinary authenticated JSON POST requests. Every requested input is memoized, so a retry of the synchronous mathematical learner never repeats an HTTP call. The source generator and private module are inaccessible to this attack-side function. The full transcript is hashed.

On the fixed private source, two independent transformed polarization directions certify the complete rank-three nonlinear subspace. The client obtains an exact offline evaluator after **94 distinct authenticated RPC calls**. The private execution counter independently records **94** calls. The HTTP server is then stopped. The privileged test verifier evaluates 1,028 SHA-256-derived inputs excluded from the fitting transcript and checks them against the offline evaluator. All **1,028/1,028** values match, with no further private handler executions.

The 567-byte delivered facade contains no \`OBFS_SECRET_\` identifiers. The original protected module source has 486 UTF-8 bytes. These numbers are diagnostic only and do not establish byte-size or obfuscation strength improvements.

## Equal-trust conventional minifier control

The same trusted function source is separately transformed by the repository's declared \`esbuild\` dependency using ESM output with the \`js\` loader, minification and ES2022 target. That private minified module is loaded **only on a separate conventional trusted HTTP backend**, which implements the same RPC path, method identifier and session requirement as the SCO service. It does not disclose the minified implementation to the client. Its minified ESM has 297 UTF-8 bytes.

The identical attacker, credential, seed, source-class promise and valid query allowance are applied to this conventional private API. The conventional server is then shut down before another independent 1,028-value offline verification.

Both experiments produce the same exact chosen-input/output transcript hash:
\`bbec2746426e1d7ea5cfbe6373206508146dbbb58db8d668c64e7ff57d1e9a61\`.

| Source-pinned observation | SCO selected private method | Ordinary minified private API |
| --- | ---: | ---: |
| Legitimate chosen requests for exact offline clone | **94** | **94** |
| Instrumented private method executions | 94 | 94 |
| Independent post-close output matches | **1,028 / 1,028** | **1,028 / 1,028** |
| Unauthenticated request status | HTTP 403 | HTTP 403 |
| Private function source delivered to attacker | No | No |
| 32-bit input/output transcript | Identical | Identical |

All these concrete values were printed identically in the Ubuntu and Windows CI logs under the immutable pinned SHA. The static private source hash was \`2111f234e4cd8caa77165ef5813a467668aef75f46317fcbf0caa6791c3a1392\`; the minified ESM hash was \`1bf1ed83e8a84d541ff5adfe7b35ce5f26e0936c0a862c13200615b149a2b84b\`. The pinned esbuild version comes from the committed \`package-lock.json\`.

## Interpretation

Under the experiment's narrow threat model, **SCO source selection adds no incremental functional-cloning barrier over equal-trust conventional private API placement** for this known low-rank quadratic source family. Both private implementations remain confidential as source files and enforce session authorization; both return exactly the same oracle evaluations to legitimately credentialed clients. The attack reproduces behavior, with no claim that the original source spelling, server secrets, session credential or source-level compiler transform was recovered.

The finding is bounded to one deterministic source family with a strong class prior, unlimited legitimate requests, fixed test seed and one served ESM facade. It is not a general impossibility theorem about all SCO deployments. In particular, it does not establish an attack on a cryptographically keyed PRF, a broader input-stateful authenticated policy, or real distributed multi-user controls. Nothing in the test demonstrates unauthenticated access, modified private code, SNO hostile-runtime protection, COO host locking, cross-file property-analysis correctness, application CPU under 2.5× or universal JavaScript reconstruction.

The code demonstrates why remote-only source secrecy and session denial metrics must be evaluated separately from chosen-query *functional* secrecy. Any claim of a superior obfuscator should be compared with the **same-trust ordinary private service** under equal legitimate oracle access. The repository's three-mode strong-protection release decision remains **RELEASE-BLOCKED**.
