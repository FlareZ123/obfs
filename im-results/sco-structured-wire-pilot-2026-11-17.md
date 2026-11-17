# JSON versus structured-graph SCO transport pilot

**Date:** 2026-11-17. **Classification:** intermediate protocol feasibility
experiment, not a deployed obfuscation backend and not a security result.
Actual Linux/Windows execution is pending.

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

The graph input contains a cycle, two references to the same object,
`undefined`, `NaN`, `-0` and `123n`. The pilot asserts that bare JSON
refuses the cyclic input, the candidate restores each listed data property
and alias *within the decoded graph*, and the decoded root and shared object
have distinct identities from the client's original values. If the package
does not satisfy those checks, the run should fail and the discrepancy should
be investigated before claiming compatibility.

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

A third-party parser would process attacker-controlled request bodies on the
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
