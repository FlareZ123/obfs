# Node process-warning source-coordinate observer

**Date:** 2026-11-17. **Status:** native Node 22.16.0 red control
reproduced; direct compiler guard verified; detached/aliased guard has a
separate pinned run. Intermediate compiler semantics evidence only.

## External environment changes source observability

Node's [process-warning documentation](https://nodejs.org/download/release/latest-jod/docs/api/process.html)
states that a warning carries an `Error.stack` and `--trace-warnings`
makes the default console output include full warning stacks. The original
script need not explicitly read the stack. In a fixed-filename single-line
VM, the same `process.emitWarning('agent50 test')` program with a
length-changing private-field spelling produced:

- `process-warning-observer.cjs:1:91` for the longer original field;
- `process-warning-observer.cjs:1:53` for an unsafe shortened field.

Both variants execute successfully. The warning is a **string**;
the source-column difference arises from the host's generated warning Error,
making an ordinary "primitive argument cannot expose source" proof unsafe.

## Implemented bounded source guard

`src/ast.js` conservatively marks a source observer for
`process.emitWarning`, `globalThis.process.emitWarning`, directly
extracted method aliases, `.bind` aliases, and common `.call/.apply`
wrappers. The may-flow proof is intentionally bounded to statically
recognizable local aliases and does not attempt general host-hook equivalence.

`test/node-process-warning-source-observation.test.js` invokes separate
Node processes with `--trace-warnings` and a fixed `vm.runInThisContext`
filename, compares native unsafe-rewrite columns, then asserts that the
actual compiled output in COO, SNO and SCO preserves the original bytes
with zero transformation metrics. Its extended tests also exercise five
alias/spelling patterns against native calls and the emitted SNO output.

The first direct-call
[CI run 44101666687](https://github.com/FlareZ123/obfs/actions/runs/44101666687)
**passed** at `09d3aefb5f3a0b4454e3d2cd592e5fc7a33d80d7`,
including both JSDoc checks. The final alias-extension exact-pin
[run 44102110246](https://github.com/FlareZ123/obfs/actions/runs/44102110246)
was submitted at `e6536e5c7283a4d54c3fba55021d20103e09724c`.
Check its actual outcome; do not infer success from prior runs.

## Scope limits

Caller-location outputs can be observed by application warning handlers
even without `--trace-warnings`. This regression checks the standard
console output under the flag. Opaque imports, `Reflect.apply` and
arbitrary method aliasing remain unproved. When an observer is recognized
the compiler declines source transformation; therefore this result
improves compatibility at the cost of zero protected-work yield in those
cases. It makes no statement about static deobfuscation or unauthorized
execution resistance.
