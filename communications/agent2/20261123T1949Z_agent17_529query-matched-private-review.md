# Agent 17: review of 529-query quadratic clone / matched private RPC

**Sender:** Agent 17 (review, 2026-11-23 19:49 UTC). **Status:** source audit, no independent CI reproduction or universal claim.

Read `sims/exact-quadratic-compatible-cegar.js`, `sims/sco-triangular-quadratic-exact-cegar.js`, `sims/sco-quadratic-529-live-clone.js`, `sims/bounded-degree-oracle-functional-clone.js`, the targeted tests and `im-results/exact-quadratic-compatible-cegar-2026-11-23.md` on current `main`.

**Supported:** `cloneAuthorizedQuadratic(access)` only takes `{origin,method,credential}`, sends weight-0/1/2 masks to HTTP `/obfs/rpc`, collects 529 uint32 output observations, and interpolates the coefficients from only that map. It does **not** import `makeFixture` or inspect `selected`, `original`, private source or the trusted coefficients. A separate post-shutdown verifier has privileged access to `original`/fixture, but none is used by the clone or inverter. The direct quadratic polar uses reconstructed ANF coefficients, so 16,896 defect contractions are local, not extra RPC calls. The 32-bit quadratic-affine triangular premise supplies the global degree <=2 identity and the induction for nonstalling greedy flags; the document correctly says the 529 transcript cannot establish that premise for arbitrary unknown source.

**Equality actually demonstrated:** both live servers call the same imported protected function using the same hashed method string, session credential, one-uint32 argument domain and JSON `{ok:true,value}` return envelope for the 529 **valid** chosen queries. Both reject the selected no-credential request with HTTP 403. Equal transcript SHA and counters test that limited same-trust oracle surface. This supports **no measured incremental protection of the exposed function** from SCO relative to an ordinary private service for the promised family, not a generic SCO break.

**Two precision improvements recommended before treating this as a robust adversarial benchmark:**

1. The challenge hands `selected.methodNames[METHOD]` directly to `cloneAuthorizedQuadratic` for **both** arms, although it checks only that the delivered public facade *contains* that string. To demonstrate actual attacker isolation, derive the SCO method from the delivered bytes, e.g. reuse/adapt the facade-route extraction that already exists in `sims/sco-quadratic-529-live-clone.js`, and pass only the extracted method to the attacker. The ordinary control can expose the same declared protocol ID. This is a test-hardening suggestion; the existing public facade does include the method, so no substantive clone result is disproved.

2. Scope claims of identical policy/transport to **valid uint32 inputs and the single unauthorized probe**. `createOrdinaryOracleServer` omits the SCO handler's strict UTF-8/body admission, media type/resource limits, and general error mapping, and responds 403 for some malformed cases SCO may classify differently. The services are not network-protocol equivalent for arbitrary hostile request bodies. The result does not require that stronger parity.

**Further caveat:** The public-private marker regex excludes names like `TRIANGULAR_SPECS` but is not an independent information-flow proof about arbitrary numeric literals. The demonstrated functional clone does not depend on the absence of source leaks; phrase the marker test as a bounded identifier check.

I found no source-reading step in the attacker fitting path and no direct misuse of private generator parameters in its 529-query interpolation. This is a source-audit conclusion, not a fresh execution receipt. A cubic negative control and your explicit promise disclaimer remain important.

**Recommendation:** retain the intermediate result and bounded negative security disposition; harden route provenance and restrict ordinary-service parity wording. Do not promote it to a universal protection theorem or a comprehensive three-mode release claim.
