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

## First reproduced quantitative verdict, pinned Node 22

The first amended pilot **passed as an evidence-collection job** on
Ubuntu and Windows in [manual Actions run
44018781413](https://github.com/FlareZ123/obfs/actions/runs/44018781413),
exact commit `e027aed2a83e018bf7b49df2cf45260ca0342ec6`.
Both platform logs include `SCO_DEVALUE_WIRE_PILOT` and
`SCO_STRUCTURED_WIRE_PILOT` JSON objects with every sample and
a separately reported semantic verdict. The workflow did not include
the later Chromium profiling step.

**@ungap 1.4.0: reject as a general untrusted SCO JSON-wire
replacement.** On both platforms the cyclic and ordinary shared
object references, `undefined`, `-0` and `BigInt` were restored,
but `NaN` was not restored after JSON stringification.
Duplicated references to the same `ArrayBuffer` returned distinct
buffers. The local crafted type-tag probe invoked the harmless
globally registered constructor once. These are measured outcomes,
not merely suspicions from the tagged source. No production server
used this decoder.

**devalue 6.0.3: narrower graph compatibility success, major hot
runtime-budget failure.** On both platforms its pinned script
successfully asserted cycles, shared plain and binary references,
`NaN`, `-0`, `undefined`, `BigInt` and refusal of an unknown
type without invoking a harmless ambient constructor. Its decoded
objects still had distinct identities from the originals.

The following are **median paired ratios of devalue wire plus task to
direct native task**, with 9 samples per variant. The prescribed
threshold is 2.5. Counts describe records per call. Measurements
exclude HTTP and browser loading.

| Records per call | Workload | Ubuntu paired median | Windows paired median | 2.5× decision |
| ---: | --- | ---: | ---: | --- |
| 1 | small state task | 58.13× | 67.93× | exceeded, both |
| 1 | task plus 25k integer rounds | 1.12× | 1.15× | supported, both |
| 32 | small state task | 600.58× | 757.18× | exceeded, both |
| 32 | task plus 25k integer rounds | 2.39× | 2.93× | inconclusive Ubuntu, exceeded Windows |
| 256 | task plus 25k integer rounds | 12.02× | 14.74× | exceeded, both |
| 1024 | task plus 25k integer rounds | 54.56× | 64.19× | exceeded, both |

The diagnostic's attained one-sided median coverage is
98.046875% with nine pairs, exceeding its requested 95%; the full
bound and individual observations are available in the Actions logs.
One profile meeting 2.5× does not qualify the codec as a
general replacement. At 1024 records, the bare JSON representation
was 57,797 bytes and devalue's representation 77,182 bytes
on this fixture. For the 32-record heavy task, Ubuntu's upper paired
median bound was 2.79× despite a median below 2.5×, which is why its
decision remains inconclusive.

**Decision at this checkpoint:** Retain production SCO JSON value
transport; do not promote either experimental graph format as
general-purpose semantic parity or budget compliance. A more
selective strategy might place serialization only around sparse,
large, inherently private operations, but that still needs honest
browser cold and real HTTP cost evidence. The separate Chromium
experiment was authored after the above pin and is pending.

## Bounded parser-adversary grid (source-authored, pending CI)

The separate [devalue malformed-wire grid](../sims/sco-devalue-untrusted-parser-grid.js)
makes 267 local parse requests, each capped at 65,536 wire bytes,
on the exact pinned parser. Eleven targeted cases include a valid
roundtrip, a forged global-constructor type, direct and null-prototype
`__proto__` keys, an unrelated own `constructor` key, an out-of-range
graph index, a large typed-array view over a one-byte backing store,
the maximum legal sparse-array length represented in a tiny record,
and nested references of depths 64, 1,024 and 4,096.
The remaining 256 cases are one-byte mutations of a deterministic
valid serialized value using xorshift seed `0xC0FFEE`.
The grid records accepted/refused counts, per-case duration,
and a harmless locally installed global-constructor invocation count.
Every case must return or throw and leave `Object.prototype`
without the probe property. The original server remains unmodified.

The purpose is to expose candidate parser surface area and verify a
small adversarial corpus, without claiming denial-of-service resistance.
Synchronous stack overflow may be caught while still wasting resources;
a gigantic *logical* sparse-array length can be represented with tiny
input bytes and later exhaust application work if iterated. Browser and
server process isolation, network RTT and concurrent adversarial loads
are absent. The script has not yet been run on pinned Linux/Windows
builders, so no passing verdict is inferred.

## Reproduction

Manually dispatch
[the two-platform workflow](../.github/workflows/manual-sco-structured-wire-pilot.yml)
from GitHub Actions, which installs the exact codec and runs
`node sims/sco-structured-wire-pilot.js`. Record immutable run SHA, pass/fail
and observed samples after the workflow completes. If a result cannot be
reproduced, leave it as an unresolved engineering experiment.
