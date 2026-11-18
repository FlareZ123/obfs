# Returned host-capability invocation adapters: bounded ESM property safety

**Agent 43. 18 November 2026. Intermediate semantic-correctness evidence, not a security result.**

## Defect and bounded threat

The current COO closed-world cross-file property pass admits a narrow exported
`inspectRecord(key)` that reads a privately owned literal `schema[key]` only
when its static callers pass proved own-key strings. It may then rename a
separate `state.secretField` in a published ESM module.

A legitimate Node host preloader injects
`globalThis.RUNTIME_FACTORY=Function` before running the published ESM entry.
A source-visible helper returns that callable. Node's native invocation
adapters can invoke the helper and yield the host `Function` without a
syntactically direct `getFactory()` call. The returned constructor can then
perform a runtime dynamic import of the published `state.mjs`; that import
sees the actual distributed property spelling.

The prior `safeClosedCallerRecordRead` return-capability analysis tracked
directly called named factories and aliases, but did not recognize
`getFactory.call(null)`, `.apply(null,[])`, `Reflect.apply(...)`,
`getFactory.bind(null)`, or an aliased `.call`. Every one of these five
cases is a valid Node ESM program using the same unchanged source owner.

## Reproduction and source-pinned red

The adversarial fixtures are in
[`test/cross-file-safe-record-read.test.js`](../test/cross-file-safe-record-read.test.js).
They execute native and generated ESM in separate Node child processes,
including the actual preloader, instead of inspecting syntax alone.

At source `1821b6335d1197636436775b45ffeb0875833dbd`,
[manual cross-readers run 44291039613](https://github.com/FlareZ123/obfs/actions/runs/44291039613)
failed all five new output-equivalence cases on Ubuntu, while 305 other
tests in the first stage passed. The native output in the `.call` fixture
was exactly `[41,[3,["secretField"],41]]`, while the generated output
was exactly `[41,[3,["_pb98532a063d1"],null]]`.
The generated original key access evaluated to `undefined`, stringified
as `null` in the selected array. Per-seed renamed identifiers differ
between fixtures. The initial [refusal-count-only red pin
44290838057](https://github.com/FlareZ123/obfs/actions/runs/44290838057)
had already shown all five cases renaming 1 field rather than declining;
the subsequent run added actual differential evidence.

## Repair and non-vacuity check

The targeted `src/cross-properties.js` patch extends the local
returned-factory consumer summary:

- `.bind` of an already known callable joins an alias into the bounded
  callable-name fixed point.
- `.call`, `.apply`, `Reflect.apply`, `Reflect.construct`, direct
  bound invocation and constructor `new` on a recognized host-bearing
  factory count as a returned-capability transfer.
- The existing explicit private-record positive stays in the suite.
  One additional `primitive.call(null)` positive returns a literal
  number and **still renames 1/1** eligible private fields; no global
  properties-off fallback was introduced.

The final suite has eight hostile adapter cases, including `new`,
`Reflect.construct`, and directly invoked `.bind()`, with native and
generated process output parity. The latter three expanded cases were
introduced together with the patch and have no separate source-pinned
red baseline. The claimed demonstrated pre-fix defect count is therefore
**five**.

At exact source `1ad1132220464405a2830954795a25899d1aae4f`,
[manual cross-readers run 44291331252](https://github.com/FlareZ123/obfs/actions/runs/44291331252)
passed on Ubuntu and Windows, each **314/314** tests in the first
differential stage, **36/36** in the host-lock stage, and zero failures,
with strict JSDoc checks and the remaining existing workflow steps green.

## Interpretation

This closes a documented family of source-visible call-result paths under
the bounded finite ESM graph and observed native Node workflow. It does
**not** establish a complete higher-order callback, dynamic import, host
preloader, module-loader, Proxy or arbitrary reflection effect proof.
It does not confer secrecy against public-file cloning, tamper resistance
against full runtime control, or a strong environment lock.

The patch is an ahead-of-time compiler analysis change, not extra
obfuscated runtime logic. The workflow's performance steps passed but no
universal 2.5× bound follows. Keep this report in intermediate evidence;
promote no new strong-obfuscation result.
