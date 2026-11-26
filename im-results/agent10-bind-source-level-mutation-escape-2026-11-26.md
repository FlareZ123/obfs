# Source-level Function.prototype.bind mutation exposes the target to an opaque host

Date: 2026-11-26T08:09:29.619Z
Reviewer: Agent 10

## Finding

The candidate `bindCallUse` admission is too permissive when the analyzed program itself replaces `Function.prototype.bind` and forwards the receiver to an opaque host callback:

```js
const owner = { secretField: 7 };
const nativeBind = Function.prototype.bind;
Function.prototype.bind = function (...args) {
  globalThis.external(this);
  const target = this;
  return (...callArgs) => Reflect.apply(target, args[0], callArgs);
};
const internal = () => owner.secretField;
const hot = internal.bind(null);
const result = hot();
Function.prototype.bind = nativeBind;
```

The host supplies `globalThis.external`, which captures the function source. The analyzed source explicitly passes the target function to this unknown host API via `this`; the compiler cannot prove that the API is source-insensitive. Under the 1:1/unknown-host contract, this must fail closed unless the callback has an explicit trusted contract.

This is distinct from the Agent 49 out-of-band preloader. In that case the analyzed program does not replace bind or call an unknown host callback; the attacker modifies the runtime before evaluation and captures the already-transformed target. The attacker should see transformed source, not force original-source parity.

## Red/green reproduction

Test: `test/agent10-bind-in-source-custom-bind-escape.test.js` on isolated branches.

- Candidate branch `agent10/bind-in-source-custom-bind-escape-red-20261126`, commit `81debf00091b5fe1a4c7b26268b729736e17d02f`, focused run **45779565154**: **failed** on Ubuntu, Windows, and macOS in all three modes. Each reported one property rewrite and a captured source change from `owner.secretField` to `owner._p...`; the ordinary numeric result remained 7.
- Current-main baseline `agent10/bind-in-source-custom-bind-escape-baseline-20261126`, commit `1bc37550e5e18cd26f096d3da2534586d78dce81`, focused run **45779572653**: **passed**. The existing direct-call-only proof refuses the bound receiver and preserves the source-visible host result.

The candidate's syntactic `bindCallUse` check verifies only that the target is a direct `.bind` receiver with approved literal arguments. It does not check for source-level Function.prototype mutation or trace the replacement's `this` into `globalThis.external`.

## Suggested correction

Use a conservative source-level Function.prototype mutation gate before admitting `bindCallUse`. A donor exists in `workplace/agent9-ambient-call-bindingid.js`: `isFunctionPrototypeObject` plus `hasFunctionPrototypeMutation` detects direct writes and calls receiving the Function.prototype object, and the receiver-effect summary marks the target as host-held. This donor needs review for alias completeness and cross-file aggregation before production use.

Reclassify the tests as follows:
- native bind in analyzed source, no in-program source observer: the narrow bind proof may admit;
- out-of-band hostile preloader: extraction test; assert the target source is transformed and original key spelling is absent;
- source-level bind replacement that forwards `this` to an unknown host callback: negative semantic test; require no rewrite unless the callback contract is explicitly trusted/source-insensitive;
- in-program source observer such as `hot.toString()`: preserve source or refuse.

The existing candidate `test/agent10-bound-proof-opaque-host.test.js` currently asserts a positive rewrite for the source-level custom-bind escape and should be reclassified or split. Keep the out-of-band preloader test separate.

## Scope

This finding concerns semantic admission under an opaque program-level host API. It does not imply that an attacker-installed preloader must receive original source. No production code was changed in this experiment.
