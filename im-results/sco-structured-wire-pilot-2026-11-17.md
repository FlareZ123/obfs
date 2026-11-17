# JSON versus structured-graph SCO transport pilot

**Date:** 2026-11-17. **Classification:** intermediate protocol feasibility
experiment, not a deployed obfuscation backend and not a security result.
Actual Linux/Windows execution is pending. Two experimental codecs are
compared as separate, independently checked candidate paths.

## Motivation and contract

[The production SCO JSON witness](./sco-json-graph-observation-2026-11-17.md)
demonstrates loss of graph sharing, special numeric values and cyclic graphs.
The separate single-object echo witness also proves that no pure copy of a
server-computed result automatically reproduces the client's preexisting
object identity. A structured-graph codec is worth studying for the first
class of mismatch, while retaining the second boundary explicitly.

The experimental [pilot](../sims/sco-structured-wire-pilot.js) compares:

- **Current value transport:** `JSON.parse(JSON.stringify(value))`.
- **Graph-aware candidate:** the published `@ungap/structured-clone@1.4.0`
  `serialize(value)` and `deserialize(...)` APIs, with the serialized graph
  carried through `JSON.stringify` and `JSON.parse`.

The candidate package is used **only by a manual experimental workflow**,
installed at an exact version. No runtime dependencies, production handler,
generated facade or client delivery contracts are changed by the pilot.

## Predetermined positive and negative controls

The first codec's graph input contains a cycle, two references to the same object,
`undefined`, `NaN`, `-0` and `123n`. The pilot asserts that bare JSON refuses the cyclic input and records
independent booleans for the candidate's preservation of each listed
property and alias *within the decoded graph*. It separately verifies
that the decoded root cannot preserve the original client's identity.
Candidates with a failed required observation must be rejected; the amended
protocol collects descriptive timings even for an incompatible codec.

Performance uses **unchanged, plain JSON-tree inputs** with 1, 32, 256 and
1,024 records, each containing a deterministic integer and Unicode text.
Both transports must produce exactly the same values. For each input size,
two original workloads are run: a small state accumulator and the same
accumulator followed by 25,000 integer mixing iterations. Each variant gets
9 samples, with alternating execution order and equal call count.
All individual durations, byte lengths and the repository's 95%-requested
one-sided median paired-ratio diagnostic are retained.

The chosen measurement boundary is **in-process serialization, parse, and
workload invocation** in Node 22. Network, HTTP routing, authentication,
JSON body admission, client code distribution and startup, real browser
execution and repeated remote request latency are excluded. Thus even a
ratio under 2.5 on this microprofile is no full-session budget verdict.
Correlation between paired observations in the reused process is a further
uncertainty. All measurements are descriptive.

## Security and deployment caveats

Any third-party parser would process attacker-controlled request bodies on the
trusted SCO server. The pilot does not audit malformed graph inputs or bound
decoder recursion, memory allocation and prototype behavior. It must not be
enabled in the server handler without those defenses, a version-pinned
dependency audit and native/browser differential tests. This protocol is
publicly decodable and provides no secret obfuscation by itself.

As of 17 November 2026 the public package documentation describes structured
cycles and types beyond JSON, while acknowledging unsupported host objects;
this is the basis for *testing* its claimed behavior, not proof of full
JavaScript equivalence. The source reference is
[the publisher's project](https://github.com/ungap/structured-clone).

## Alternative candidate: devalue 6.0.3

The [devalue experiment](../sims/sco-devalue-wire-pilot.js) uses the
publisher's `stringify/parse` API from **devalue 6.0.3**, imported
dynamically into the same CommonJS Node benchmark. The exact package is
installed only by the manual workflow. Its publisher describes support
for cycles, shared references, signed zero, `NaN`, `undefined`,
`BigInt`, and typed-array backing-store identity. These properties
are asserted on a nontrivial graph in the script. The reproduction
compares a single identical JSON-tree application under three variants:
original native work; JSON transport followed by work; devalue transport
followed by work. Each has 9 same-input, ordered-rotation samples and
raw timings with paired diagnostics for the two protocols against native
and against each other.

The script also installs a harmless local global constructor, gives
`parse` an unknown type tag, and checks that it rejects the tag without
invoking that constructor. This is a narrowly defined safety test, not
an audit of arbitrary hostile payloads. Source reviewed:
[devalue's exact v6.0.3 parser](https://github.com/sveltejs/devalue/blob/v6.0.3/src/parse.js).
Modern tags and guards in that file make it a plausible candidate, while
the project has experienced multiple earlier parser advisories. Full
fuzzing and dependency audit remain prerequisites for server acceptance.

All devalue measurements are independent of the `@ungap` candidate's
pass/fail. An experimental competitor with compatible data shapes could
still exceed the 2.5× runtime budget on short original tasks.

## Added real-browser branch, before measurement

The [Chromium harness](../sims/sco-devalue-browser-profile.js) serves
the exact installed `devalue@6.0.3` ESM source files from one loopback
origin, alongside two otherwise identical native and graph-loaded
pages. It captures 9 alternating cold page-ready observations for
each page variant, including the native ESM module graph load cost.
It then measures 9 native/JSON/graph hot-loop observations for each
of the same eight count/workload cases inside real Chromium, with
a browser graph-shape parity assertion. The Node driver uses the
repository's paired diagnostic on the raw observations. This is
separately timed from Node in-process codec costs.

Limitations: browser-process launch time is excluded from
`performance.now()` and should not be used as an attacker-cost
metric. Loopback static imports exclude SCO authorization, network
RPC and production obfuscation overhead. The page origins and browser
version are fixed by the manual runner; browser platform differences
and OS scheduling are not fully controlled. The browser script is
experimental and runs only on Linux in the manual workflow; Windows
still evaluates the codec's Node path. Only a complete, pinned passing
run establishes that the simulated browser path actually worked.

## Protocol update after tagged-source audit

The original pre-registered `@ungap` pilot SHA
`eddaf251c0bebd4e7e08080cb88bb29e5704709f`
was designed to **fail immediately** if any listed special value was not
preserved. Subsequent inspection of the exact v1.4.0
[serializer source](https://github.com/ungap/structured-clone/blob/v1.4.0/cjs/serialize.js)
raised a falsifiable concern: its ordinary number records include
`NaN`, which a separate `JSON.stringify` envelope serializes as `null`.
The amended pilot at commit
`3338142b3752b71a7d8da038c41d50f971613987` records independent
graph-feature booleans and full plain-tree timing instead of aborting on
the first negative observation. It also retains the local constructor
and binary-alias probes. This was an explicit **methodological amendment
after source inspection**, before any tagged CI result was received, and
does not retroactively make unsupported features successful.

A candidate is unsuitable for this application if even one required
graph feature fails, or if untrusted payloads can invoke ambient
constructors. A completed benchmark job merely means the observations
were collected. It never means that a protocol is approved for deployment.

## Separate deserializer trust boundary (source inspection)

The exact [v1.4.0 deserializer source](https://github.com/ungap/structured-clone/blob/v1.4.0/cjs/deserialize.js)
uses a fallback that constructs `new env[name](init)` from a decoded type
label, with a small hardcoded denylist. In isolation this means the decoder
can attempt to invoke a constructor registered on its global object when
given a corresponding serialized type label. The expanded pilot installs
a harmless temporary local probe constructor and checks whether a crafted
record invokes it. **This is an untrusted-input compatibility/security
probe, pending actual pinned package execution**, and does not demonstrate
remote exploitation of the production SCO server.

The same tagged source appears to call the memoization helper with the
*serialized value*, rather than the record index, in its `ArrayBuffer`
and `DataView` cases. The expanded pilot records whether two references
to the same `ArrayBuffer` are revived as the same object. That observation
has not yet been measured on the exact installed package.

Until those checks are resolved, receiving untrusted serialized-graph
payloads would cross a separate constructor/allocation attack surface.
A size cap on the JSON bytes alone does not validate decoded types, graph
edges or requested allocation dimensions. A deployable protocol would
require a strict per-record schema and allowlist, plus memory/CPU bounds
and adversarial fuzzing, before choosing this dependency. The pilot
deliberately avoids altering production parsing.

## Reproduction

Manually dispatch
[the two-platform workflow](../.github/workflows/manual-sco-structured-wire-pilot.yml)
from GitHub Actions, which installs the exact codec and runs
`node sims/sco-structured-wire-pilot.js`. Record immutable run SHA, pass/fail
and observed samples after the workflow completes. If a result cannot be
reproduced, leave it as an unresolved engineering experiment.
