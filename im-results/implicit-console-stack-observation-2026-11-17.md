# Implicit Node console stack observation during source rewriting

**Date:** 2026-11-17. **Status:** reproducible local Node 22.16.0
counterexample and implemented conservative regression guard; targeted integration
CI must be evaluated separately. **Classification:** intermediate compiler
compatibility and proof-boundary evidence, not a strong-obfuscation result.

## Native observation

A fixed-name `vm.runInNewContext` script constructs an object with a long
private property, reads the property, then calls an external Node `Console`
backed by a captured `Writable` stream. Replacing the property spelling with
a one-character name preserves the returned number but shifts source columns.

Measured locally on Node **v22.16.0**, `console-observer.cjs`, single-line
source, equivalent original and shortened private-property versions:

| Native observer | Original stack position | Renamed stack position | Returned value |
| --- | --- | --- | --- |
| `console.trace()` | `console-observer.cjs:1:100` | `console-observer.cjs:1:48` | 73 both |
| `console.error(new Error('trace'))` | `console-observer.cjs:1:106` | `console-observer.cjs:1:54` | 73 both |
| Local `Error` alias passed to `console.error` | `console-observer.cjs:1:106` | `console-observer.cjs:1:54` | 73 both |

These are **native/manual replacement** results. They establish that a
source-coordinate rewrite can alter observable output with **no syntactic
`.stack` read** in the source. They do not by themselves show that every
compiler configuration would have emitted this exact rewrite.

The Node 22 documentation says an `Error` records its creation location and
`console.error()` uses native formatting/inspection for object arguments:
[Node Error stack](https://nodejs.org/download/release/v22.15.1/docs/api/errors.html),
[Node console](https://nodejs.org/download/release/v22.18.0/docs/api/console.html).

## Additional implicit function-name inspection

An independently executed native Node 22 probe printed
`[Function: meaningfulOriginalFunction]` for a direct function-valued
console argument, changing to `[Function: x]` after a simple lexical
rename. That observation does not require a `.name` read or explicit
`Function#toString` call in the user program. The guard now treats
direct function values, recognized function-containing arrays and nested
literal objects passed to native console methods as source observers.
This is a **bounded behavioral compatibility** extension, with no
protection claim for generic object aliases or opaque loggers.

## Guard and positive control

`src/ast.js` now recognizes direct `console.trace()`, including computed
member spelling and a local console alias, as a source-location observer.
Native console `log/info/warn/error/debug/dir` calls are source observers
when their visible argument graph carries an `Error`, `TypeError`, or other
recognized built-in error instance. The limited may-flow proof follows local
identifier assignments, transitive aliases and nested array/object literals.

`test/implicit-console-stack-source.test.js` contains ten automated
checks against the **actual compiler-emitted SNO output**, using a fixed VM
filename and Node `Console` capture. It verifies direct/aliased loggers,
constructed Error objects, nested values, `console.trace()`, an exact
source-coordinate fallback and an unaffected `console.log(42)` positive
property-renaming control. The targeted Ubuntu Node 22 preflight is
`.github/workflows/manual-implicit-console-source.yml`, manually dispatchable on a source-pinned branch, including strict project
and external JSDoc checks.

The expected fallback preserves the original source where an implicit stack
observer exists. This means zero transformed content in that file or graph;
it is a correctness measure and may reduce obfuscation yield.

## First targeted CI: harness false negative

[Ubuntu Node 22 run 44094229530](https://github.com/FlareZ123/obfs/actions/runs/44094229530), pinned to `77a997aeaa9180d7f5816bc986988626d44f242e`, **failed** its eight-case test at 7/8 failing, 1/8 passing. The failures came from comparing stack strings containing **the test harness's own two distinct `execute()` invocation lines**. The VM script's own source column was identical on both sides, and the primitive logger positive control passed. This was a *test oracle defect*, not evidence of a compiler output mismatch. The corrected test extracts only fixed-name in-VM source frames before exact native/emitted comparison, at `f468a8ef36494a02eee1db6f0f71b017c678279a`. The ten-case pinned follow-up [run 44096939351](https://github.com/FlareZ123/obfs/actions/runs/44096939351) was queued when the report was updated. Check the actual CI outcome before claiming success.

## Limitations and next falsifiers

The guard is intentionally bounded. Custom `Error` subclasses, errors
returned or thrown to opaque callers, `process.emitWarning`, detached
console methods, opaque host logging hooks, dynamic computed method names,
cross-module error objects and more elaborate alias/data-flow patterns are
outside this proof. Native console may itself be shadowed or monkeypatched;
the predicate may conservatively refuse unobservable cases. The guard does
not prevent source extraction under the project threat models.

Validate the emitted-code behavior and strict typechecks at an exact commit
on Linux and Windows before claiming broad compatibility. In particular,
measure positive transformed-work retention on a representative application,
rather than treating a safe fallback as evidence of useful protection.
