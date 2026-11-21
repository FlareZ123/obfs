# Cross-file eager-decoder parity: aliased Object.create getter descriptors

**21 November 2026, Agent 3. Intermediate compatibility evidence, not a security-hardness result.** Source-pinned two-platform red/green native differential and bounded compiler repair. The main strong-obfuscation release decision remains **RELEASE-BLOCKED**.

## Tested semantic counterexample

The native CommonJS application consists of `entry.cjs`, `mutator.cjs`, and `target.cjs`; entry requires the mutator before printing the target module's 2,049-character exported string. The mutator constructs a property whose getter exposes `String.prototype` via a native Object.create descriptor:

```js
const desc={get(){return String.prototype;}};
const descs={ref:desc};
const box=Object.create(null,descs);
box.ref.charCodeAt=()=>0;
```

The generated eager string decoder depends on the ambient String prototype before the target module is loaded. The original target exports the literal directly and is unaffected by the changed `charCodeAt`; the transformed program can instead emit a different result. Cross-file placement is necessary to exercise the observed initialization order.

A new 20-case matrix `test/decoder-object-create-descriptor-alias.test.js` spans five descriptor-provenance shapes, both COO and SNO, and harmful String versus harmless Number prototype writes. Cases cover an aliased descriptor entry, aliased map, two-hop map, map-returning function, and simultaneously aliased entry plus map. The Number controls require a **positive** one-literal transformation; String controls require zero unsafe transformed literals. Each case runs native and emitted code in isolated Node processes and compares process status, stdout, stderr and transformation yield.

## Source-pinned red and green

| Gate | Exact source pin | Ubuntu Node 22 | Windows Node 22 |
| --- | --- | --- | --- |
| Red | `65016f2eab7b99c1f470aa8a58245d83b77bde0c` | 4,102 passed, 2 failed, 1 skipped / 4,105 | 4,099 passed, 2 failed, 4 skipped / 4,105 |
| Green | `1b106416b336e90df520182d16d8b076339ec6c4` | 4,104 passed, 0 failed, 1 skipped / 4,105 | 4,101 passed, 0 failed, 4 skipped / 4,105 |

- [Red full two-platform run 44935002852](https://github.com/FlareZ123/obfs/actions/runs/44935002852) failed exactly **two new cases per OS**: simultaneous aliased entry + map, COO/String and SNO/String. All ten harmless Number positive controls passed, and the other eight String cases passed. Both JSDoc checks passed on both OSes.
- [Green full two-platform run 44935605194](https://github.com/FlareZ123/obfs/actions/runs/44935605194) passed 0 Node failures on both OSes, the existing strict JSDoc and external typecheck, benchmark and paired profiles, and all prescribed Ubuntu Chromium integrations.

## Repair and limits

The bounded repair to `src/core.js::mutatesDecoderIntrinsic` collects local getter-descriptor aliases and enclosing descriptor-map aliases with a monotone fixed-point pass. It relies on the existing `proxyGetMayReturnDecoderIntrinsic` proof and treats a direct `Object.create` second argument known to contain such a getter as unsafe for eager string transformation. This conservative admission change prevents the demonstrated intermodule output corruption without withdrawing the matched harmless Number controls.

The implementation and test are in draft [PR #217](https://github.com/FlareZ123/obfs/pull/217), branch `agent3/object-create-descriptor-provenance-20261121`. Agent 1 separately develops first-class Object.create call/bind/apply/Reflect wrappers in `agent1/object-create-alias-red-20261121`; an integrated guard must reconcile **call-target provenance** and **descriptor-argument provenance**, then rerun the exact positive controls. This repair currently establishes only the tested direct-call pattern with local aliases; it does not prove completeness for arbitrary JavaScript reflection, dynamic descriptors, source-visible monkey-patching or external modules.

No 2.5× bound or improved attacker reconstruction resistance follows from these tests. The purpose is semantic preservation: the obfuscator must decline transformations when the shared intrinsic decoder can be modified before later modules execute.
