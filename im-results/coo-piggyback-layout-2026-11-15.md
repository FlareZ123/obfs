# COO sharding on an existing ESM edge: experimental two-file layout

**Agent 27; 2026-11-15. Status: intermediate engineering evidence.**

## Design and actual emitted artifacts

[`workplace/coo-piggyback-shards.js`](../workplace/coo-piggyback-shards.js)
provides `piggybackShards({consumer,donor},{seed,functionName,closedWorld:true})`.
For a no-parameter, top-level function whose entire body returns a nonempty
literal string of up to 4096 UTF-16 code units, it writes a seeded, coprime-
permuted XOR payload into the consumer file and a seeded mask into a static
ESM leaf dependency. Because the consumer already imports the donor, the
algorithm adds a named import after that existing declaration and no extra
load edge or output files. The function decodes lazily on the first call and
caches the string for the remaining process. The two source files remain
separate ESM modules. The compiler is JSDoc-typed CommonJS and depends only
on the repository's existing `acorn` library and Node standard modules.

The checked-in [`examples/coo-piggyback/`](../examples/coo-piggyback/README.md)
contains byte-exact deterministic before/after output, Unicode including
supplementary characters, an isolated surrogate, and NUL, plus a regenerating
builder with atomic, locked writes. The sample grows from 281 to 1314 UTF-8
source bytes (4.676x). This size metric is distinct from runtime cost.

## Validation and source-only attack

Locally executed on Node 22.16.0: **5/5** differential and refusal tests green,
with strict JSDoc typecheck passing for all five new JS modules. Tests run
real native and transformed ESM module graphs, preserve existing static import
evaluation order, compare exact UTF-16 strings and unrelated functions, verify
seed diversity, check unsupported-case refusals, and regenerate the checked-in
example from its source. The run is reproducible with `node --test
 test/coo-piggyback-shards.test.js` and `tsc -p jsconfig.piggyback.json`.

Independent [`sims/coo-piggyback-recover.js`](../sims/coo-piggyback-recover.js)
reads **only the two emitted source files** as strings, extracts the numeric
arrays and constants, reconstructs the UTF-16 sequence, and recovers the
original literal without the build seed, developer APIs, or target runtime.
It succeeded on both real and synthetic fixtures. This is a *negative security
control*: distributed-file confidentiality is not achieved, even though the
string is absent from straightforward single-file literal search.

## Measured cost and comparative scope

[`sims/coo-piggyback-profile.js`](../sims/coo-piggyback-profile.js) prepares
48 independent native and obfuscated **two-module** graphs. In alternating
order, each graph is loaded using native Node ESM import and `message()` is
called once; hot measurements then compare 24 alternated samples of 125,000
cached `message()` calls with matched character-code checksums, after 8 warmups.
These are local Node 22.16.0 process measurements, not pinned CI or browser
claims. Two consecutive executions yielded:

| Replication | Native graph-load median | Obfuscated graph-load median | Graph-load ratio | Native hot median | Obfuscated hot median | Hot ratio |
|---|---:|---:|---:|---:|---:|---:|
| A | 0.6838 ms | 0.8233 ms | **1.204x** | 0.7113 ms | 0.7566 ms | **1.064x** |
| B | 0.6941 ms | 0.7683 ms | **1.107x** | 0.6567 ms | 0.6902 ms | **1.051x** |

For this fixture and environment, both measurements are below 2.5x. The
older four-file sharding prototype measured 3.61x/3.79x graph load on CI;
this narrower two-file design avoids that extra-file overhead *in principle*,
but the experiments use distinct samples and machines, so this is **not** a
controlled A/B improvement claim. Browser downloads, cache misses, main-thread
startup, and larger workloads still need matching controlled comparisons.
The initialization deduction does not apply to COO, so the graph-load figure
cannot be omitted from the total budget.

## Explicit restrictions and adversarial limits

The compiler requires the caller to prove closed-world ESM use, with no
namespace/export enumeration, external source observer, unknown ESM loader,
indirect cycles that call the function before module initialization, mutation
of `String.fromCharCode`, or source reflection. Only syntactic checks for some
of these are implemented. Adding a mask export changes an observable module
namespace, and the function's `toString()` spelling changes. These are
**semantic counterexamples if the caller's preconditions are violated**.
A multi-file graph with namespace enumeration cannot safely opt into this
transform as-is. It is deliberately outside the default production pipeline.

Under the COO threat model, full client control permits static reconstruction,
module replacement, instrumentation, and bypass of any client-side host guard.
The technique gives no domain authorization, modification resistance, or
increased attacker cost under the demonstrated source-only attack. COO's
untrusted device provides no independent cryptographic secret. Promotion to
production would require automated whole-graph source-observer proof, broader
browser tests, verified build-path collisions, and a security gain resistant
to this very reconstruction attacker.

## Browser integration follow-up

The reproducible `test/coo-piggyback-browser.js` harness has been
added to exercise the exact original and obfuscated ESM output over real HTTP
with an independent Chromium page per variant. It compares return-value
UTF-16 code units, an unrelated imported computation, and actual module fetch
counts. Typechecking passed locally. The local sandbox Chromium executable
failed even a minimal `data:` page in headless mode and cannot provide a
positive or negative browser compatibility verdict; a manually dispatched
GitHub Actions Chrome run is required. Any CI result must be pinned to its
exact source SHA, separate from the Node 22 local measurements above.

## Hoisted top-level call soundness repair

A new differential reproducer calls the exported, hoisted `message()` inside
its own module **before** the textual function declaration. The first prototype
appended `const payload` and `let cache` to the file end, so such a call would
read generated names in the temporal dead zone and throw before the decoder
could run. The revised compiler places the payload/cache declarations before
normal module evaluation, after any hashbang or directive prologue, retaining
existing ESM import order. The added real Node ESM regression matches native
behavior and also proves that `"use client"` remains the first directive.
The full focused suite now passes **6/6**, with strict JSDoc typecheck clean.

The remeasured local Node 22.16.0 profile after this repair gives original
0.668965 ms versus emitted 0.744659 ms per graph load (1.113x) and 0.691699
ms versus 0.702135 ms for the matched hot work (1.015x), for this fixture.
Source size now grows from 281 to 1,315 UTF-8 bytes. This is a separate new
replication, not a cross-platform or browser result.

Two initial manual-Chrome runs at source snapshots
[`766af3d6`](https://github.com/FlareZ123/obfs/actions/runs/43730988714) and
[`2ae3983e`](https://github.com/FlareZ123/obfs/actions/runs/43731123308)
failed because `google-chrome` exited via SIGILL when the new browser harness
tried to launch it. The repository's earlier browser fixtures passed in the
same jobs. The failure is unresolved and must remain visible until a new
reproduction distinguishes the harness environment from emitted-program bugs.
