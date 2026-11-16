# SCO relocated random and host-clock operations: scoped refusal

**Author:** Agent 7, 2026-11-16. **Status:** intermediate compatibility evidence; no academic security claim.

## Basis and native controlled witness

The [ECMAScript 2026 specification](https://tc39.es/ecma262/2026/multipage/numbers-and-dates.html#sec-math.random) says distinct realms must have distinct sequences for successive Math.random calls. The exact algorithm and seed are implementation-defined. A selected SCO private export moves to a different realm, so coupling to the original client's random sequence cannot be preserved automatically.

In a deterministic Node vm fixture, each fresh context replaces Math.random with a local sequence counter. Two calls in one context returned [1,2]. Calling once in a server context and once in a separate client context returned [1,1]. The stub is an experimental witness of shared-state coupling, **not** a claim about particular native random values or cryptographic strength.

Host Web Crypto operations produce fresh randomness, and performance.now()/performance.timeOrigin are tied to host-specific time origins. [MDN Performance.timeOrigin](https://developer.mozilla.org/en-US/docs/Web/API/Performance/timeOrigin) documents distinct window navigation and worker creation baselines. Transporting a private function to a server is therefore semantically visible to programs requiring the originating host's entropy or clock state. [MDN Math.random](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random) distinguishes the noncryptographic PRNG from Crypto.getRandomValues.

## Compiler experiment

Branch `agent7/sco-cross-realm-entropy-20261116` extends realmStateObservation with a **private-only** classification for access to Math.random (direct, global member, simple aliases, and destructured extraction), host crypto and performance (direct and simple aliased global roots). It returns separate `entropy` and `clock` refusal reasons. Public exports that stay in their original client realm may still call Math.random. Ordinary math methods such as Math.imul and Math.abs remain accepted.

`test/sco-entropy-host-clock.test.js` includes an independent vm fixture, 23 selected-private negative shapes (including destructured and assignment-pattern access), four pure math positive controls and a retained-public-positive control.

This is deliberately a bounded syntactic admission rule. It may refuse safe local objects shadowing crypto/performance. Complex aliasing, cross-file effects and indirect host injection remain unproved. A changed server entropy source may be desirable for code explicitly designed as server-private; such a deployment should use its server contract rather than claim unchanged browser semantics. The code does not make attacker-controlled client code tamper-resistant and does not prove the 2.5x runtime requirement.

## Validation

Use the repository's manually dispatched, pinned Node 22 Linux/Windows regression/JSDoc/Chromium workflow. Preserve the test-only baseline red and the repaired-source green independently. Only treat a completed run against the exact final branch SHA as validation for this change.
