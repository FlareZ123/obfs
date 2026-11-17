# SCO scoped opaque capability: five-axis experimental evaluation

**Date:** 17 November 2026. **Status:** provisional branch-only security
candidate and engineering evidence. **Do not merge as security release.**
Source candidate: draft PR #65, `src/sco-capabilities.js`.
Working design: `workplace/sco-private-capabilities-candidate-2026-11-17.md`.
The phrase *private* refers to trusted-server execution and storage. It
does not imply an undecipherable client-side JavaScript artifact.

## Threat and competing control

The experiment is restricted to SCO. The attacker can retrieve and alter
every served public JavaScript file, debug and instrument its browser,
capture arbitrary handles, execute direct RPC calls, and make unlimited
legitimate authenticated requests. The trusted server, its session verifier,
private source, private values and Node runtime remain uncompromised.
The application intentionally publishes selected values through reviewed
remoteMethods. Server-side policy may revoke access, and a stable
non-reassignable principal ID is necessary to segregate handles.

The future competing control must be a **frozen working minified
application** that necessarily distributes the corresponding private
computation and state; both versions must exercise identical public
work. The strongest preexisting SCO control is *also* allowed to retain
server-private state, so this handle abstraction must not be credited for
general server-side confidentiality that was already present. That
relative-to-existing-SCO comparison has not yet been performed.

## Independent axes

| Axis | Supported observation | Unverified or known failure |
| --- | --- | --- |
| Static reconstruction | Handle IDs use 32 random bytes from Node's crypto RNG, and values are stored only in the server's in-memory Map. The new public object representation contains an opaque token, not the stored object, subject to the server operator's publication policy. | Real generated response and actual public artifact have **not** been inspected by an independent public-only attacker. A method returning the original object would intentionally defeat this boundary. Existing COO/SNO emitted transforms remain recoverable in prior frozen demonstrations. |
| Dynamic extraction | Six local unit cases confirm cross-principal access refusal, expired/revoked refusal, and inaccessible detached asynchronous scope for the proposed helper. | A legitimate same-account attacker can relay any authorized operation through the server, and instrument all responses. This is explicitly **expected success** in the stated model; no protected-state confidentiality can be inferred from publicly revealed outputs. The new real HTTP and compiled-facade tests are committed but not yet run on the full project. |
| Modification and integrity | Public source modifications do not directly mutate the private Map. Policy enforcement is designed to occur server-side inside the existing keyed RPC isolation boundary. | Client JS is freely modifiable and a compromised server can bypass the helper. Atomicity outside the per-principal request queue, storage persistence, and cryptographic attestation are not supplied. There is no positive tamper-resistance proof. |
| Unauthorized environment execution | The helper requires an active verified-principal request context. Server-side callers can bind tokens to the principal resolver, and HTTP operation authorization remains independent. | The helper itself verifies no cookie, session or domain. The integrator must supply verified, non-reassignable principal IDs and every required policy gate. SNO's fully compromised server and COO's cloned hosting environment have no corresponding protection from this design. |
| Performance and compatibility | Six local Node 22 unit tests pass using the repository's actual keyed-isolation module, and the new API passes a strict local JSDoc check. Reproduction: `node --test test/sco-capabilities.test.js` and `node sims/sco-private-capability-cost.js`. | One observed local 1-round 1,000-call pair is **3.04140×**, exceeding the hard 2.5× limit. The three-trial single-process probe excludes HTTP/network/import and is not a full budget demonstration. Windows and real browser, short and sustained sessions, plus complete actual generated ESM equivalence remain unverified. |

## Joint release decision

**RESEARCH-INCONCLUSIVE, RELEASE-BLOCKED.** This branch demonstrates an
implementable server-state isolation abstraction under a chosen trust
contract. The precommitted evaluation cannot yet establish a security
advantage over the existing authenticated SCO backend or the full 2.5×
runtime policy. The observed local strict budget breach already vetoes
a blanket empirical performance claim. No new strong COO or SNO
protection is established.

To revisit that decision, freeze four variant source hashes (native,
minified client, generated SCO facade, attacker-available reconstruction),
execute the actual ESM application and host trace in both Node and
Chromium, run a public-only equal-budget attacker that can replay
same-account RPCs and steal a cross-account handle, and keep all
strict paired CPU/network outliers. Do not conflate output
reproducibility with recovering the server's private bytes. Do not
promote an automatically passing CI workflow to an automatic
security-release verdict.

## Distinction from existing work

The authoritative [established research index](../results/README.md)
already records negative evidence on selected COO affine/polyvariant
obfuscation relative to esbuild, with two independently pinned gates
reporting two observed strict >2.5× compute pairs apiece. The
[comparison](../workplace/candidate-over-minification-decision-2026-11-17.md)
also statically recovers three selected arithmetic leaves. This
experiment proposes a separate SCO trust boundary and must not reuse
those experimental samples as its own positive performance or
confidentiality evidence. See the more detailed
[scope-specific CPU probe](sco-private-capability-cost-2026-11-17.md).
