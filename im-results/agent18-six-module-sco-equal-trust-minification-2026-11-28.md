# Six-module SCO: a matched, equal-trust ordinary-minifier comparison

**Date:** 2026-11-28. **Researcher:** Agent 18. **Status:** intermediate,
exact source-pinned acceptance under evaluation; not an established
strong-obfuscation result and not a release-candidate vote.

## Research question

Does SCO client code from the project's full six-module application
demonstrably raise attacker cost relative to a conventional *minified*
RPC facade, when both make precisely the same authenticated requests to
the very same hidden server implementation? Earlier application evidence
showed original code withholding and a successful online authorized
relay, but a comparison against a public-source baseline with a weaker
trust boundary would misattribute the server's secrecy to the obfuscator.

This experiment holds the trust boundary fixed and varies **only public
client code generation**. The protected application is the frozen
`examples/application-challenge/before/` five-module dependency graph,
with the existing private `sco-before/api.mjs` async adapter.

## Matched setup

- Control: esbuild `minify:true,target:es2022,format:esm` compiles an
  ordinary, readable, functionally equivalent one-export RPC facade.
  It deliberately embeds the **same** generated RPC method ID and
  marshals the same two numeric arguments.
- Candidate: the actual `partitionScoAsyncGraph` generated facade
  checked byte-for-byte against the checked-in build. Source reconstruction
  is not performed on the trusted application code.
- Both clients invoke the **one** original `startServer` process, which
  executes identical original code, uses one randomly generated per-test
  bearer token, `x-demo-token` header authentication, the same method
  allowlist and argument-bound policy, and the same `/obfs/rpc` route.
- A `fetch` interception captures the first outbound method and
  argument array on each client. Both captured traces must be
  exactly equal, eliminating speculative hidden method differences.
- The repository's independent
  `sims/application-challenge-sco-relay-child.cjs` loads each public
  client in a **separate fresh process and temporary directory** with
  only its public bytes, server origin, token, and held-out test inputs.
  It never receives or imports the private application modules.
  Native results are used only by the tester as an oracle for equality.
- Unauthorized fetches and forged operations must receive HTTP 403
  regardless of the public client. The real server, not a user-modifiable
  facade, owns the authorization boundary.

## Runtime cost boundaries

Run three operations in a repeated alternating-order, nine-pair sample:
the original native computation on the trusted server, the generated
SCO client RPC, and the ordinary minified RPC. Use both a lightweight
one-event computation and a sustained 120,000-event computation. Each
call receives equal inputs and must return native-identical JSON values.

Measure **caller plus trusted server process CPU** from `process.cpuUsage`
after initialization. This is a bounded same-process loopback HTTP/1.1
sample; it excludes WAN RTT, TLS and browser rendering and includes
the caller and service in one process. Preserve each raw timing, paired
median and every strict >2.5× ratio. Do not present an initialization
deduction as a per-call discount or treat a median alone as proof that
all required workloads satisfy the budget.

## What this can and cannot establish

Both clients intentionally lack the original five private module
bodies and key fields; that equality by itself is **not** an SCO
obfuscator advantage. The separate-process copied-client attack tests
functional relaying with a legitimate account token; it is not an
offline clone of the unexposed native algorithm. A successful relay
demonstrates that an authorized client can reproduce outputs without
learning the server's source; it does **not** compromise server
authorization, expose a secret key, or imply unrestricted API access.

An invalid-method or invalid-range response of HTTP 403 is a
server-side authorization protection shared by both clients, not a
client-side integrity barrier. Successful execution of a copied
facade in a different Node process demonstrates that a public
client's original browser location is not inherently an unforgeable
execution lock while a valid token can be used.

The result packet must report separately: static source availability,
instrumented RPC capture, held-out online relaying, privileged
operation refusal, environment portability, functional parity,
and computation. A green test alone is not a positive protection claim:
it means the expected comparison behaved as specified.

## Reproduction and status

Source:
- `test/agent18-application-equal-trust-sco.test.js`
- `jsconfig.agent18-application-equal-trust.json`
- `.github/workflows/manual-application-sco.yml` on branch
  `agent18/application-equal-trust-20261128`

Run:

```sh
npm install --no-package-lock --ignore-scripts
node examples/application-challenge/sco-build.cjs --check
node --test test/agent18-equaltrust-control-args.test.js
node --test test/agent18-application-equal-trust-sco.test.js
CHROMIUM_BIN=google-chrome node test/agent18-application-equal-trust-browser.cjs  # Linux with installed Chrome
npx tsc --project jsconfig.agent18-application-equal-trust.json
```

### Pinned positive and negative controls

The first exact `ded4790d1b78cb02fc18a58b266e4efd7be9913f`
[run 46125517952](https://github.com/FlareZ123/obfs/actions/runs/46125517952)
passed behavior on both platforms but failed its new strict JSDoc step on
three cleanup annotations. An intermediate policy assertion incorrectly
expected HTTP 403 for unknown RPC method keys, where the real handler correctly
returns HTTP 400 during method-shape parsing; [run 46125691503](https://github.com/FlareZ123/obfs/actions/runs/46125691503)
reproduced that incorrect assertion on both platforms. The corrected
source pin **`8e463e8cdfe02bc47ecdc27bf3993a6af07401b1`** passed the
entire prior application SCO workflow, the new paired-control test and
strict JSDoc on Ubuntu and Windows:
[run 46125878951](https://github.com/FlareZ123/obfs/actions/runs/46125878951).

At that exact pin, each public client reproduced **40/40 independently
held-out calls** in a separate process, using only its emitted bytes,
original server address and legitimate account token. Both emitted clients
carried the **identical captured RPC wire request** (`method` and
`args:[17,400]`), retained 403 unauthorized service rejection and
server-owned invalid-argument refusal. The generated SCO public facade was
**515 bytes**, versus **347 bytes** for the ordinary esbuild-minified
equal-trust facade. Neither public facade contained the private arithmetic
source or configuration keys.

The Linux nine-pair **single-operation caller+server process-CPU** samples
from this source pin have median generated/ordinary ratios:
**1.04565×** for 1-event work and **1.02643×** for sustained
120,000-event work. The median SCO/native ratios are respectively
**150.60×** and **1.44524×**; ordinary/native medians are
**107.71×** and **1.59697×**. These values are **ratios of matched
per-pair observations**, not ratios of median total durations.
All **9/9 lightweight generated/native CPU pairs** exceeded the
strict 2.5× limit, and **1/9 heavy generated/native CPU pairs** did
so. The corresponding ordinary/minified numbers were 9/9 and 2/9.
The sample is finite, local loopback, noisy at low absolute CPU usage,
and is neither a statistical universal guarantee nor a defensible
per-call client-only compute bound.

On Windows, `process.cpuUsage()` returned **0 milliseconds for all nine
native samples** in both workload groups due to its coarser quantization,
so those Windows per-call ratio fields are `null` and un-evaluable.
Some naive breach counters in the raw first version compared numbers
against zero, giving misleading nonzero or zero counts; **do not interpret
those counters as valid performance decisions**. A subsequent version
adds independently repeated operations to cross the coarse CPU timer
quantum; its results must be evaluated on a new source pin before use.

Exact immutable raw profiles and the Windows timer caveat are archived in
[`agent18-equal-trust-sco-raw-20261128.json`](agent18-equal-trust-sco-raw-20261128.json).
The subsequent *facade-free trace attacker* copies only one intercepted RPC
method name, legitimate account token and endpoint, and replays held-outs
without loading **either** public facade. This extension passed the entire
existing application SCO workflow and JSDoc on Ubuntu and Windows at exact
`18a7a493455939aa21ee1014f4baff1c36d37e79`,
[run 46126086165](https://github.com/FlareZ123/obfs/actions/runs/46126086165).
It reconstructs **40/40 fresh held-out outputs without copying either
facade** using one previously captured legitimate RPC shape. This is
authorized online functional relaying, not an offline algorithm clone
or compromised server. A further repeated-call process-CPU comparison
is being evaluated separately.

### Cross-platform quantization-safe CPU follow-up

The full application SCO workflow passed on both Ubuntu and Windows at
**exact source `294bd243344ecbe2445eb44346c8cd731b17f575`**,
[Actions run 46126186524](https://github.com/FlareZ123/obfs/actions/runs/46126186524).
The same original five private modules, generated and ordinary RPC clients,
40/40 held-out copies, actual server and bearer identity were retained.
To overcome the Windows `process.cpuUsage` tick size without changing the
RPC protocol, each operation was **repeated independently** and total
caller+server process CPU divided by the number of operations. This is
measurement repetition, *not* a batched RPC or any performance optimization:
the 1-event native function was called **32,768** times per sample and each
generated/ordinary RPC **1,024** times; heavy 120,000-event work used
**128** individual invocations for each method per sample. Seven
alternating-order paired samples were recorded per OS and workload;
all 28 sets of native/ordinary/generated CPU readings now had nonzero
timing, including on Windows.

| OS | Work per operation | Generated / native CPU median | Ordinary / native CPU median | Generated / ordinary CPU median | Generated strict 2.5× breaches |
| --- | --- | ---: | ---: | ---: | ---: |
| Ubuntu | 1 event | **228.87×** | 226.11× | 1.0001× | **7/7** |
| Windows | 1 event | **271.32×** | 282.26× | 1.1068× | **7/7** |
| Ubuntu | 120,000 events | **1.2888×** | 1.2665× | 1.0087× | 0/7 |
| Windows | 120,000 events | **1.2811×** | 1.2730× | 1.0446× | 0/7 |

These medians are computed from seven **per-pair normalized process-CPU
ratios**; they are not pooled medians or a universal performance
threshold. Raw totals, repetitions, per-call CPU and wall values are
preserved in
[`agent18-equal-trust-sco-batched-raw-20261128.json`](agent18-equal-trust-sco-batched-raw-20261128.json).
Different repetition counts can introduce JIT, cache and GC effects;
the comparison is **bounded** to this repeated-input loopback workload,
not a user-facing browser CPU or a confidence guarantee on future
programs. The robust finding is a **strict post-initialization
budget failure for thin independent requests on both OS**, shared with
the equal-trust ordinary RPC client, whereas sustained computation
fits the sampled 2.5× budget. Neither client demonstrated a meaningful
protection edge from its public JS representation once the same
server-side trust boundary was held fixed.

### Input-diversified paired CPU robustness

The source-pinned **rotating-1,024-input** variant at
`e02d696d496e7be9d370e72594bb681e1e1ad727`,
[Ubuntu and Windows run 46126931909](https://github.com/FlareZ123/obfs/actions/runs/46126931909),
completed successfully. Within each sample, a deterministic 1,024-seed
corpus was cycled rather than repeating an identical arithmetic input.
Seven paired trials used distinct corpus origins. Native, generated
and ordinary calls still used the same original private application and
one authenticated server; their individual per-call outputs were checked
at the beginning and end of each repeated sample. Exact traces, process
CPU totals, repetition counts and per-call wall times are preserved in
[`agent18-equal-trust-sco-varying-input-raw-20261128.json`](agent18-equal-trust-sco-varying-input-raw-20261128.json).

| Platform | Computation per call | SCO/native median CPU | Plain/native median CPU | SCO/plain median CPU | SCO strict 2.5× violations |
| --- | --- | ---: | ---: | ---: | ---: |
| Ubuntu | 1 event | **272.47×** | 281.91× | 1.0284× | **7/7** |
| Windows | 1 event | **253.97×** | 230.10× | 1.1038× | **7/7** |
| Ubuntu | 120,000 events | **1.2848×** | (see raw JSON) | 1.0071× | **0/7** |
| Windows | 120,000 events | **1.3333×** | (see raw JSON) | 1.0505× | **0/7** |

The direction of the result is robust to this specific input-variation
intervention: per-operation authenticated RPC overhead dominates tiny
native work, and the public SCO facade exhibits no conspicuous additional
CPU protection cost or empirical attack advantage over its same-trust
ordinary minified RPC peer. This does **not** settle across-service WAN,
browser main-thread CPU, secrecy of keys on the honest server, or all
possible application workloads. It is evidence of a **budget-veto class
for sufficiently fine-grained protected functions**, not a proof that
all SCO programs always exceed 2.5×.

### Semantic-fidelity falsifier for the comparator

The initial ordinary minified comparison had `args:[seed,count]` while
the actual emitted SCO facade used `[...arguments]`. Those were
identical on the 40 ordinary two-argument held-outs, but **not** on
a missing or additional positional argument. A dedicated test-only
control at `a2a0e96d6f1dafe76fc1c136165acf58fe66f56e`,
[run 46127204486](https://github.com/FlareZ123/obfs/actions/runs/46127204486),
was **RED on both platforms**: the ordinary comparator serialized a
one-argument call `evaluateRemote(17)` as `[17,null]` whereas SCO
serialized it as `[17]`. The isolated test did not examine any
server secrets; it intercepted the public RPC JSON requests.
The ordinary minified control was corrected to `[...arguments]` and
to match the generated facade's null/error response handling.
The corrected exact-arity and failure-response witness is
`test/agent18-equaltrust-control-args.test.js`; its independent
source-pinned acceptance remains a distinct required check. Therefore
the previous 347-byte ordinary public-client size refers only to
the original two-argument matched control, not a complete semantic
equivalence baseline. Corrected byte counts must be read from the
next successful workflow.

A stronger subsequent static attacker simply extracts the same
literal RPC method and endpoint from a public source file and
reconstructs held-outs **without evaluating or importing that file**.
Unlike the separate-process traced-wire attacker, it receives no
dynamic interception metadata beyond a legitimate account token; its
source-only extraction attempt is bounded to the frozen compiler's
current `m<hex>` method format, not a general JS decompiler.
This independent test is being checked in the same revised workflow.

These observations support a **bounded negative protection-value finding**:
on the measured six-module app, the generated source-private SCO facade
does not obstruct a permitted client from copying its own network behavior
more effectively than conventional minification under the *same* trusted
server. This is not a claim that either design discloses the original
server-side algorithm or bypasses unauthorized access. The repository-wide
release claim stays **RELEASE-BLOCKED** independently of this experiment.
