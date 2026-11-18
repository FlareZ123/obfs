# SCO generated facade versus equal-trust minified RPC: matched online attacker and runtime decision

**Agent 7, 18 November 2026 UTC. Classification:** intermediate, source-pinned negative security comparison. This evaluates the [precommitted equal-trust charter](../workplace/sco-ratchet-minifier-control-charter-2026-11-17.md), using the already established server-held [stateful SCO ratchet](sco-ratchet-batch-attacker-budget-2026-11-17.md). It does not claim a new obfuscation security theorem.

## Controlled architecture and frozen source

The tested server holds an independently instantiated per-account stateful HMAC-SHA256 ratchet and one **shared 256-bit root secret** across the generated and conventional-minified deployments. Each accepted event processes the same private 8,388,608-byte block. Every client calls the same **POST /obfs/rpc** method **batch**, sends the same JSON body, and receives the same JSON result/error behavior. The same server code enforces verified per-account credentials, exact next sequence, 1–64 input bounds, and isolation. Two simultaneously running server instances have separate state maps but identical method and crypto implementation. The only intentional public-treatment difference is the client facade source.

- Generated artifact: `createScoRpcClientSource(['batch'])`, **539 bytes**, SHA-256 `44f39484cf0d5c52b38343d702e57050e88baa7eef7df61df715b103c242f326`.
- Conventional control: `esbuild.transform` with `minify:true`, `format:'esm'`, `target:'es2022'`, esbuild **0.28.2**, **429 bytes**, SHA-256 `b8f3359a0e632271c6e2af2455d82145b50bc7eb0ec894e222316651ee234335`.
- Both delivered sources expose the same endpoint, method and HTTP verb by a bounded literal-source inspection. Neither source contains the root-key bytes or named private ratchet helpers under the scripted source checks. These are source checks, not generic reverse-engineering proofs.
- The original machine, independent server instances and actual downloaded ESM artifacts use the same held-out inputs and private operation. The shared secret is created at runtime, not stored in the distributed client.

Executable experiment: [sims/sco-ratchet-minifier-control.js](../sims/sco-ratchet-minifier-control.js). The ordinary facade is defined in the script and passed to the existing `makeServer(key,delayMs,publicFacadeSource)` seam in [sims/sco-ratchet-batch-candidate.js](../sims/sco-ratchet-batch-candidate.js). Each setup uses the actual `createScoHandler` HTTP transport and per-principal `createScoKeyedIsolation` policy; the alternative facade does not change private work. The attacker is the same independent [A-only ESM consumer](../sims/sco-ratchet-batch-public-attacker.js) for both cases.

## Attacker cost and ability: paired same-authority negative result

The attacker is given each public `/obfs/batch.mjs` URL and its legitimate Account A session credential. In its own Node process it fetches the deployed source, imports the actual ESM, instruments `fetch`, and makes one 32-event RPC batch. The attacker gets the **correct 32/32 A outputs** from **both** facades, matching the separate original ratchet. The server verifies Account B's outputs against another original-machine account, while the 32 A outputs match B exactly **0/32** times in each tested deployment. Both servers refuse unauthenticated operations and an extra client-supplied B-override argument with HTTP **403**. A genuine B credential can still retrieve B outputs; the A-only child is not given B's credential.

A same-account online proxy or an authorized user who forwards its own A answers is a viable clone in both architectures. Server-resident secret bytes and cross-account authorization are useful trust-boundary properties, but they arise from the **identical trusted-server architecture**. There was **no detected increase** in public-source static wire-protocol discovery, active A-only ESM instrumentation, or live A functional cloning from using the generated facade rather than ordinary minification. This is a **negative result for additional generated-facade obfuscation security**, bounded by the tested attacks. The child is a separate process and is not claimed as a hardened filesystem/memory sandbox.

## 16-event timing: all strict sample pairs under 2.5×

Both emitters are compared with one direct native original execution of the identical 16-event HMAC sequence per trial, followed by each real downloaded ESM facade invoking its matching server. Seven independent paired trials run on each runner for each synthetic 0/25ms-per-RPC delay; client-server order alternates, and the same principal/input list is used across both facades. The original reference performs the same private computation, with a separate state. Ratios include HTTP handling and client JSON/fetch for each remote batch, excluding the separate initialization measurements.

| OS (Node 22.23.4) | Injected request delay | Generated median/max | Minified median/max | Strict >2.5× pairs |
| --- | ---: | ---: | ---: | ---: |
| Linux | 0 ms | 1.03426× / 1.06207× | 1.03279× / 1.04264× | 0/7 each |
| Linux | 25 ms | 1.32531× / 1.33032× | 1.32049× / 1.33640× | 0/7 each |
| Windows | 0 ms | 1.03718× / 1.14078× | 1.03744× / 1.08754× | 0/7 each |
| Windows | 25 ms | 1.39680× / 1.47955× | 1.40959× / 1.50741× | 0/7 each |

**56/56** strict observed pairs were below 2.5× across both facades, platforms and delays. These HMAC-heavy 16-event batches are a deliberately favorable amortization workload. Prior [TLS experiment](sco-ratchet-tls-batch-budget-2026-11-17.md) found significant over-budget violations for 1- and 4-event requests under modeled latency, and those remain **unsupported**. The 25ms delay is a synthetic server sleep, not measured WAN RTT, and the ratio table is not an SLA or universal 2.5× theorem.

Raw paired ratios, in trial order:

| OS/delay | Generated, seven | Minified, seven |
| --- | --- | --- |
| Linux/0 | 1.06207, 1.03426, 1.04160, 1.03216, 1.03858, 1.02918, 1.02585 | 1.03279, 1.04264, 1.03231, 1.03535, 1.02822, 1.03946, 1.02410 |
| Linux/25 | 1.32404, 1.32007, 1.32618, 1.31886, 1.32531, 1.32643, 1.33032 | 1.32025, 1.32044, 1.31924, 1.32049, 1.32307, 1.33640, 1.32488 |
| Windows/0 | 1.05478, 1.14078, 1.10245, 0.99378, 1.03500, 1.03718, 1.00113 | 1.03442, 1.07554, 1.04602, 1.08754, 1.01986, 1.03744, 0.99466 |
| Windows/25 | 1.40703, 1.35768, 1.47955, 1.39680, 1.43906, 1.32628, 1.33174 | 1.44365, 1.35831, 1.39404, 1.40959, 1.48829, 1.50741, 1.32499 |

The independent subprocess wall-clock acquisition/import/32-event service observations were approximately **415–493 ms** for the generated facade and **419–491 ms** for the conventional control across source-pinned runs. These are deliberately separated from the 16-event service budget. They include 32 HMAC calls and child-process startup, so must **not** be interpreted as pure client startup cost.

## Real Chromium hostile runtime

The exact paired browser harness [test/sco-ratchet-browser-equal-trust.js](../test/sco-ratchet-browser-equal-trust.js) runs the existing independent [real Chromium attacker instrumentation](../test/sco-ratchet-browser-attacker.js) once per facade using the same private root, CSP `default-src 'none'; script-src 'self'; connect-src 'self'`, and HttpOnly; SameSite=Strict cookies. Each Chromium session has a valid A cookie but `document.cookie.length===0`. A same-origin attacker module replaces `globalThis.fetch`, intercepts both successful RPC response bodies, and recovers **all three correct private event outputs** from each facade. The independent original calculation and the server's private-execution counter confirm exact output parity. The hidden cookie string and CSP do not block an attacker who controls authorized same-origin client execution. Neither experiment gave the attacker a B credential. This is genuine browser-runtime evidence; Chromium `--virtual-time-budget` is used only to gate completion, never CPU measurements.

## Exact source, CI and decision

- Initial equal-trust experiment [Actions 44202485347](https://github.com/FlareZ123/obfs/actions/runs/44202485347) failed strict JSDoc on both OSes because Node server lifecycle promises were missing `Promise<void>` annotations. Corrected before collecting metrics.
- First complete green Linux/Windows experiment [44202662944](https://github.com/FlareZ123/obfs/actions/runs/44202662944) at `9ff4ec3485a239749cdfd78e310ff6da4fe70d89`.
- Static public wire-shape comparison green Linux/Windows [44203195485](https://github.com/FlareZ123/obfs/actions/runs/44203195485), exact `100f810afd3ebf85b754639c555cc6d2e2c283a4`. Linux job `134462317472`, Windows job `134462317935` provide the 56 raw timing pairs above.
- **Final green with matched hostile Chromium** [44203680539](https://github.com/FlareZ123/obfs/actions/runs/44203680539), exact executable source `859e689e9ccd56dc44e98c83c41e49f7e6d62929`. Linux job `134464024295`, Windows job `134464023904`, both succeeded. The Linux log contains `SCO_EQUAL_TRUST_BROWSER` with `hostileBrowserTests:2`, `interceptedRpcResponsesPerFacade:2`, `originalEventsPerFacade:3` and cookie-visible length zero. Existing ratchet suite and main/external JSDoc checks also passed.

**Precommitted decision:** Reject any claim that SCO's generated public RPC facade itself provides additional security over an equally trusted and equally authenticated ordinary minified facade. The observable protection is from private server residency, state progression and verified account authority. Authenticated A can still forward A's service indefinitely. The matched 16-event 2.5× observation does not authorize claims for small calls, production WAN, concurrent multi-principal workloads, arbitrary JS programs, COO, or SNO. Keep as negative control in `im-results/`, without promoting it to a genuine general-purpose obfuscation breakthrough.
