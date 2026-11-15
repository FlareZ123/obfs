# Error-stack source-location observer: compatibility counterexample and conservative refusal

**Date:** 2026-11-15. **Agent:** 50. **Status:** intermediate compatibility engineering evidence, not a general semantic proof or an obfuscation-security result.

## Native evidence

Node.js 22 documents `Error.stack` as a source-location string with line and column coordinates, and `Error.captureStackTrace(target)` as another way to capture the same data. Source rewriting can alter those coordinates even when arithmetic results remain identical.

A separate Node.js 22 local reproduction used `vm.runInNewContext`, a stable filename `entry.cjs`, and identical source apart from shortening one local binding from `significantLocal` to `_v8`. The first captured stack frame changed:

| Source spelling | Frame |
| --- | --- |
| `significantLocal` | `at run (entry.cjs:1:72)` |
| `_v8` | `at run (entry.cjs:1:59)` |

These are **observable return-value differences** when the program reads and returns a stack string. Variable renaming, property renaming, or eager decoder insertion can all change a frame's recorded location. The original implementation's source-text observation checker did not recognize the `.stack` member spelling.

Official Node.js documentation: https://nodejs.org/download/release/latest-jod/docs/api/errors.html

## Implemented narrow repair

The shared AST observer in `src/ast.js` now conservatively declines source transformations when it sees:

- Static `.stack`, `.captureStackTrace`, `.prepareStackTrace`, or `.stackTraceLimit` property access, including static computed strings.
- Destructuring `{stack}` or `{stack: alias}`.
- Direct `Reflect.get(obj, 'stack')`, `Reflect.getOwnPropertyDescriptor(obj, 'stack')`, and `Object.getOwnPropertyDescriptor(obj, 'stack')`.

The existing `src/properties.js`, `src/identifiers.js`, and `src/strings.js` passes already consume the central observer. Multiple-file groups apply a whole-group refusal if any member observes source/locations, avoiding location changes to a different supplied module. The refusal deliberately includes some unrelated user-defined `.stack` properties. This loss of coverage is preferable to claiming a proof of non-observation.

`test/error-stack-observation.test.js` checks native/obfuscated behavior under a fixed VM filename, zero transformation counts for stack observers, direct and captured traces, destructuring and reflection, private-key refusal, cross-file refusal, and a non-observing renameable control.

## Expanded cross-platform confirmation

The first five checks passed in [run 43715351761](https://github.com/FlareZ123/obfs/actions/runs/43715351761). After adding the destructuring and reflection test cases, a separate validation failed because the new reflection visitor read `node.arguments[1]` on calls with fewer than two arguments. Agent 16 corrected this missing arity check in commit `09e00e51894b76090304f26098c7b9d4b6b50c23`. The **expanded stack test set and repository-wide validation passed on Ubuntu and Windows** in [run 43715781459](https://github.com/FlareZ123/obfs/actions/runs/43715781459), pinned source SHA `9ce3535250a320228b62a1784cfb7e9f943166e0`.

Subsequent [opaque external source observation study](opaque-external-source-contract-2026-11-15.md) demonstrates that an outside callback may observe the stack or function source without any matching AST pattern in supplied files. Therefore the present source-observation guard must remain a *syntactic* compatibility mitigation. It does not prove semantic equivalence for arbitrary external consumers.

## Reproduction and confidence boundary

Run `npm test` and `npm run typecheck` from repository root under Node.js 22+, or dispatch `.github/workflows/manual-validation.yml` (Ubuntu and Windows, manual only). An initial full Linux/Windows manual validation at [run 43715351761](https://github.com/FlareZ123/obfs/actions/runs/43715351761) passed at pinned head `9815cee01b93d1fca1dc9f0070b63b61a2819d93`, containing the first five direct/cross-file stack regression cases. The expanded destructuring/reflection cases were covered by later pinned green run 43715781459.

**Remaining limits:** Computed dynamic keys such as `error[key]`, renamed references to `Reflect.get`, user-defined stack formatters, indirect console/error serialization, and external source observers are not comprehensively proved. Refusal is syntactic and intentionally incomplete. This guard establishes no static reconstruction resistance, tamper resistance, authorized-execution enforcement, browser equivalence, or universal 2.5× performance bound. It trades a known semantic failure mode for skipped obfuscation.
