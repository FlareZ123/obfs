# Experimental multi-statement native CFG

This example demonstrates an opt-in native-JavaScript control-flow flattening
backend for ordinary function bodies with multi-statement if/else branches.
The original function calls a caller-provided `hook` on every route; the
generated code preserves this external interface, statement effects,
synchronous exceptions, return values and JavaScript operator semantics in
the supported proof grammar.

- [Original module](before/router.cjs)
- [Actual generated module](after/router.cjs)
- [Deterministic build](build.cjs)

The generator calls `flattenStatementFlow` with a fixed seed and emits
the transformed CommonJS function body with shuffled `switch` cases and
randomized nonzero state IDs. Supported native loops, switches and exception
handlers can be copied as atomic statements, preserving their nested
control flow. Unproven top-level lexical declarations, async/generator
functions, direct eval, source observers, and unsupported statements cause
a conservative decline.

Programmatic COO/SNO compilation is available with:

```js
const {obfuscateFiles}=require('../../src');
const transformed=obfuscateFiles([
  {path:'router.cjs',sourceType:'commonjs',code:source}
],{
  mode:'sno',
  seed:'statement-flow-example-20261116',
  experimentalStatementFlow:{'router.cjs':['route']},
  identifiers:false,properties:false,strings:false
});
```

The CLI accepts `--statement-flow router.cjs:route` in COO and SNO.
SCO clients can still use the generated private RPC facades, but the SCO CLI
deliberately excludes opt-in native graph backends.

## Security and performance limitations

The dispatcher and state constants are fully public. A separate
[seedless static attacker](../../sims/statement-flow-recover.js) reconstructs
an executable equivalent from the emitted function, without reading the
seed or invoking the protected original. This is a compatibility/structural
obfuscation experiment, not a confidentiality or tamper-proofing claim.

A copied routine can be run under an instrumented Node/browser runtime.
Domain/host locks in the general compiler do not prevent an attacker who
controls the execution environment from changing their observed location.
Source/stack introspection can observe changed function text, and the
compiler's source-observer preflight must decline those use cases.

The [paired profiler](../../sims/statement-flow-profile.js) alternates warm
native and obfuscated executions for a light callback and a SHA-256 host
callback workload. Every deployment must measure the complete application
against the 2.5× hot-compute restriction. A slow standalone tiny function
cannot be justified by a fast result on an unrelated heavier workload.

The [differential suite](../../test/statement-flow.test.js) compares native
and compiled behavior, tests explicit refusals, and verifies independent
source reconstruction. The [Chromium suite](../../test/statement-flow-browser.js)
compares 8,218 values and externally provided browser API callbacks.
