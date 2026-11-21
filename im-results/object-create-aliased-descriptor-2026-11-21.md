# Detached Object.create alias defeats eager-decoder provenance preflight

**21 November 2026. Agent 2. Status: independent reproducible compiler-correctness counterexample and proposed bounded guard.** The repository's primary strong-obfuscation release remains **RELEASE-BLOCKED**.

## Counterexample and scope

Agent 1's initial PR #204 covers directly called `Object.create(null, {ref: {get(){return String.prototype;}}})`. A detached immutable alias selects the same native operation without spelling `Object.create` at the call site:

```js
const create = Object.create;
const box = create(null, {ref: {get(){return String.prototype;}}});
box.ref.charCodeAt = () => 0;
```

If the compiler subsequently publishes a long literal encoded with a decoder relying on pristine `String.prototype.charCodeAt`, the generated module's result changes. A native module using the original literal does not depend on that intrinsic during loading. The failure is an observable semantic mismatch, with no claims about hostile instrumentation or extraction resistance.

## Reproducibility

The independent [24-case real-Node differential suite](../test/decoder-object-create-provenance.test.js) uses three CommonJS files and the native Node loader. The entry imports a mutator and only then imports the target with a 2,049-character literal. For each case, it executes original and obfuscated packages in separate Node 22 subprocesses, compares exit statuses and SHA-256 digests of stdout, and checks the string-transform yield. COO and SNO are separate modes. For eight sensitive String.prototype patterns, safe behavior requires zero encoded target literals. Four Number.prototype controls per mode require one transform to retain compatible yield.

The suite covers descriptor-map aliases, descriptor factories, nested aliases, computed keys, a detached `Object.create` function, mutable prototype aliases returned by accessors, and factory-returned objects with accessors.

Source-pinned unpatched candidate: `40609361b4b273c94bce80ed7543fdca22d2c513`, descended directly from PR #204 candidate `53812569dcd0afe9470f17c47a68a25cabb6d25e`. [Linux/Windows full integration 44931243992](https://github.com/FlareZ123/obfs/actions/runs/44931243992) independently found **22/24 new checks passing and the same two failing** on both systems:

- `native Object.create const alias/coo`
- `native Object.create const alias/sno`

Both subprocesses exited normally, but original and emitted stdout digests differed. Ubuntu native digest: `631e9c028c7b1357802cfc364a8c579d83ad1edf5eab5499552c486ff2ff01a1`; emitted COO: `f555132331322d07aee648d23de7366eabffe54f1640014e911536484d0e8616`; emitted SNO: `e05aa0fd12401f7715ce1379dd4db8b2a8c265deba16dbc3c8c4e08e95270e45`.

The full Node suite on this pin was red (**Ubuntu: 4,096 pass / 9 fail / one skip; Windows: 4,093 pass / 9 fail / four skips, out of 4,106 each**). Seven failing Node test cases already existed on PR #204's underlying candidate before this 24-case suite. Ubuntu's broad browser integration had a separately observed expected-2/actual-0 assertion. These unrelated baseline failures make the complete gate unsuitable for a green release claim.

## Bounded proposed change

[Draft PR #208](https://github.com/FlareZ123/obfs/pull/208) adds one compile-time alias set on `src/core.js` final mutator scan. It records direct immutable `const f=Object.create` aliases and applies PR #204's pre-existing inline-accessor check when `f(...)` is invoked. This does not change emitted decoder runtime work. False-positive local-shadow matches can conservatively reduce optimization yield. The patch intentionally does not prove arbitrary dynamic aliases, reflective reassignment, complex call forwarding, or all syntactic alias forms.

Patched source: `a4bea05ea1857a90f2f424f34c8097c7546a976a`. [Linux/Windows manual integration 44931776258](https://github.com/FlareZ123/obfs/actions/runs/44931776258) was dispatched after this change. Its result must be verified before claiming red/green completion or promoting the candidate.

## Security and performance boundary

An original-vs-generated output mismatch blocks this individual compiler admission on the tested program. A compile-time guard does not establish universal one-to-one JavaScript semantics, a strict 2.5× bound, effective anti-debugging, hostile-runtime tamper resistance, source secrecy, or domain authorization. These axes remain independent of the current correctness regression.
