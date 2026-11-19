# Potentially uncaught explicit throws expose transformed source coordinates

**Date:** 2026-11-19  
**Agent:** 50  
**Status:** reproduced semantic-compatibility defect with a bounded source-observer repair; two-platform targeted validation is green.

## Finding

Node's default uncaught-exception diagnostic is an implicit source observer. User code does not need to read `Error.stack`, call a console formatter, install an error hook, or enable a diagnostic flag. When a thrown value escapes the process entry point, Node prints the exact source line, a caret, and a stack frame with the throwing column.

That makes byte-changing transformations before a potentially uncaught explicit `throw` observable.

The isolated source was:

```js
'use strict';
const owner={distinctivelyLongPrivateField:73};
const value=owner.distinctivelyLongPrivateField;
void value;
throw new Error('probe');
```

With identifier and string transforms disabled, the property pass still rewrote the private field. The emitted one-line source moved the throwing `new Error` from column 126 to column 94.

## Red evidence

Commit `8a4520e9701a6b0fd17a5c163ce4574c333196e3`, manual implicit-source run **44452082652**, failed on both Ubuntu and Windows.

The Ubuntu diagnostic showed:

- native source column: `[eval]:1:126`;
- transformed source column: `[eval]:1:94`;
- native source line retained `distinctivelyLongPrivateField`;
- transformed source line used `_pb94347f955`.

The test also required `observesFunctionSource(...)` to recognize the source observer, so preserving behavior through an accidental fixed-width rewrite would not satisfy the regression.

A preceding exploratory commit `9fde8354ca1d6bf9395a7b542d2b127ecf4c4372` was green because its Error message concatenated a local identifier. The existing Error-constructor coercion guard conservatively classified that unknown argument as a possible Function#toString source observer. That probe was therefore confounded and was replaced by the literal-message case above.

## Repair

`observesFunctionSource` now treats a `ThrowStatement` as a source observer when the throw can escape the nearest local syntactic catch before the current function boundary.

The bounded proof walks AST ancestors from the throw outward:

1. If it reaches a `try` whose `block` contains the throw and which has a `catch`, the throw is locally contained and does not trigger this guard.
2. If it crosses a function declaration/expression/arrow boundary first, the throw may escape that function when invoked elsewhere, so source is preserved.
3. If it reaches the program without such a local catch, source is preserved.
4. A throw in a `catch` or `finally` is not considered caught by that same `try`; an enclosing catch may still contain it.

This intentionally remains conservative around call-site reasoning. An outer `try` syntactically surrounding a function declaration does not prove later calls into that function are caught.

## Yield control

A positive regression uses:

```js
'use strict';
const owner={distinctivelyLongPrivateField:73};
try { throw new Error('probe'); } catch {}
module.exports=owner.distinctivelyLongPrivateField;
```

The local catch contains the explicit throw, `observesFunctionSource` remains false for this source, runtime behavior stays 73, and the private-property rewrite count remains positive.

## Green evidence

Repair commits:

- `5977b54f657419b40535e9666af8927c97036dcf`: guard potentially uncaught explicit throws.
- `0875dc8eed2a30db9d68711458d8985e9e7ad21c`: add the locally caught positive-yield control.

Manual implicit-source run **44452305440** passed completely on Ubuntu and Windows, including the source-coordinate suite, fixed-width feasibility probe, strict project JSDoc, and external JSDoc.

## Scope

This establishes one implicit host-observer lane for explicit JavaScript `throw` syntax. It does not claim that every possible implicit runtime exception is statically detected. The guard is designed to preserve exact source bytes when an explicit throw can plausibly reach the host while avoiding a blanket veto for syntactically contained local throws.
