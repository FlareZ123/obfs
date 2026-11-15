# SCO private two-branch oracle reconstruction under unlimited authorized queries

Date: 2026-11-15. Agent 14. Status: **intermediate computational attack**, not peer-reviewed general reconstruction.

## Executable evidence

- Scenario and attacker: [sims/sco-piecewise-oracle.js](../sims/sco-piecewise-oracle.js)
- Three focused regressions: [test/sco-piecewise-oracle.test.js](../test/sco-piecewise-oracle.test.js)
- Manual Linux/Windows verification: [run 43709364033](https://github.com/FlareZ123/obfs/actions/runs/43709364033), pinned commit **a04fd461d71eaa2bf5b2f12b9169172255c9c84b**
- Workflow: [.github/workflows/manual-sco-oracle.yml](../.github/workflows/manual-sco-oracle.yml)

Both Node.js 22 Ubuntu and Windows jobs passed the three unit/integration tests and the JSDoc typecheck. A separate simulator run on each OS attacked eight newly randomized functions. Each function lived in a private ESM implementation and was exposed only as an authenticated, generated SCO RPC proxy. The public proxy did not contain the private random canary or the hidden implementation's right-offset identifier. A request lacking the authorized session cookie received HTTP 403.

## Attacker model and bounded function class

The attacker is assumed to know the allowed domain of integers 0 through 1,048,575 and the hypothesis class of a two-branch integer affine function. The unknown private parameters are two slopes, two offsets and an interior threshold. In these fixtures the second slope and intercept are strictly larger than the first, so the two branches never intersect in the valid domain. That nonintersection assumption is important: comparison against the left branch then yields a monotonic threshold test.

The attacker initially queries the two lowest and two highest inputs, inferring the two affine equations from finite differences. It then binary-searches the first point whose output deviates from the left equation, locating the unknown threshold, and verifies its two adjacent outputs. This uses 26 legitimate single-operation RPC calls per function. The attack accesses only the generated public ESM facade and HTTP responses. It neither reads private module bytes nor modifies the server, and it does not bypass authentication.

## Cross-platform outcome

| Metric | Ubuntu | Windows |
|---|---:|---:|
| Random private functions | 8 | 8 |
| Recovered full parameter tuples | 8/8 | 8/8 |
| Total authorized oracle evaluations | 208 | 208 |
| Evaluations per function | 26 | 26 |
| Withheld unqueried inputs verified | 2,048 | 2,048 |
| Withheld predictions matched | 2,048/2,048 | 2,048/2,048 |
| Private canary found in public proxy | 0 | 0 |
| Unauthorized status | 403 | 403 |
| Focused Node test failures | 0 | 0 |

The evaluator separately checks that recovered parameters exactly equal the hidden parameters, beyond the sampled agreement on withheld inputs. Within the precisely specified two-piece affine class, exact parameter equality establishes full functional equality for every allowed input. The 2,048 samples serve as additional differential verification.

The random secrets vary between runs; the exact recovered and hidden parameters, SHA-256 fingerprint of each server-private module, and per-attack elapsed loopback request time are printed in each run's logs. These are evaluator disclosures made after the attack. The attacker function itself receives only an interface capable of legitimate score calls.

## Security and performance interpretation

This illustrates functional reconstruction without private source disclosure: a relatively complex branch location is recovered from a small number of permitted queries even when the server enforces cookie-based authentication and source compartmentalization. This does not recover the exact original source text, is not a generic attack on arbitrary code, and makes no claim about high-entropy keyed functions or stateful nonstationary models.

The source-private boundary and unauthorized HTTP rejection worked in the tested setup. Authorization did not limit the information provided by **authorized** queries, as permitted by the original threat model. No authorization bypass was found or claimed.

Runtime loopback request durations in the raw logs measure an attack collection scenario. They are not the protected application's end-to-end 2.5x performance ratio, and no TLS, real browser or WAN measurement was attempted. This experiment tests the information-theoretic model surface, not production network resistance.

## Next experiments

Analyze decision-tree ensembles or finite-state functions whose observable branches do not form a single monotonic mismatch predicate. Evaluate request adaptivity, counterexample discovery, and input entropy separately; compare with large-domain keyed PRF oracles where prediction of unqueried values should be fundamentally different. A protective design needs to control the information released to permitted users or employ outputs that cannot feasibly be generalized from chosen samples. A quota alone is outside the unrestricted-legitimate-query threat model unless it is part of the explicitly revised application contract.
