# Descriptor object identity across identifier aliases: decoder parity

Date: 2026-11-22

## Red evidence

Independent review by Agent 42 found this native/emitted mismatch in PR #239:

```js
const descriptors = {};
const alias = descriptors;
alias.ref = { get() { return String.prototype; } };
const box = Object.create(null, descriptors);
box.ref.charCodeAt = () => 0;
```

The source creates one object, writes a decoder-sensitive getter through a second identifier, then passes the original identifier to `Object.create`. The prior scanner keyed descriptor member writes only by the syntactic base identifier (`alias`) and did not join it to the object identifier used at the sink (`descriptors`). Eager string encoding therefore remained enabled and later module initialization observed a mutated `String.prototype`.

Agent 42's isolated branch `agent42/pr239-descriptor-alias-write-20261122`, frozen source `c058d026e18bb0bb6a62e14df51e19ff0c35d16c`, reproduced native/emitted mismatches in all three modes (COO/SNO/SCO) on both Ubuntu and Windows, while matched benign Number.prototype controls passed. Full run [44972082499](https://github.com/FlareZ123/obfs/actions/runs/44972082499).

The exact regression was imported into this PR branch as `test/decoder-object-create-descriptor-alias-write.test.js`, registered in strict external JSDoc, and reproduced on the current PR source in [run 44973223450](https://github.com/FlareZ123/obfs/actions/runs/44973223450).

## Repair

The descriptor scanner now records reverse identifier-alias edges for variable initializers and assignments. When checking a descriptor object at the `Object.create` sink, `objectCreateMayExposeDecoderIdentifier` traverses aliases with a visited set and inspects member writes and `Object.assign` sources attached to those aliases. This joins object identity rather than assuming the same source spelling is used at mutation and sink sites. Flow-insensitive reassignment can conservatively combine aliases; this may refuse some safe transforms but does not authorize an unproved sensitive path.

A real-browser ESM fixture now covers the alias-write mutation and a benign Number getter. Final full validation [44974089708](https://github.com/FlareZ123/obfs/actions/runs/44974089708), exact source `27c483e66e6ce2e0dda03f8d3b378e7061441796`, passed both Node22 Ubuntu and Windows jobs: behavioral/adversarial tests, strict project and external JSDoc, performance/profile and whole-process budget checks. Ubuntu also passed all configured real Chromium checks, including the new alias-write and Number-positive fixtures.

## Scope and limitations

The repair covers statically visible identifier initializers/assignments and the tested direct alias path. It does not prove arbitrary dynamic aliasing through reflection, proxies, function return values, closure mutation, destructuring, or arbitrary host callbacks. Additional source shapes should be tested before broad claims of alias completeness. This is a bounded compatibility correction only; no source secrecy, hostile-runtime tamper resistance, or universal 2.5× guarantee is established. The primary security release remains RELEASE-BLOCKED.
