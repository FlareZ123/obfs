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
