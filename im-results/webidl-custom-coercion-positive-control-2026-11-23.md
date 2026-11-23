# Custom Web IDL coercion hooks are a primitive-source positive control

**Status:** intermediate expected-red precision witness; not an established security result.  
**Date:** 2026-11-23  
**Branch:** `agent1/window-global-binding-audit-20261123`  
**Test:** `test/webidl-custom-coercion-source-observer.test.js`  
**Test commit:** `6861851eb021d6e476916970d768430deb05587a`  
**Focused two-platform run:** [45186322393](https://github.com/FlareZ123/obfs/actions/runs/45186322393)

## Question

Does the source-observer analysis distinguish native Web IDL string conversion that reaches the default Function stringifier from conversion intercepted by a proven own `Symbol.toPrimitive` or `toString` hook?

## Fixture

The test creates a function with an unrelated private object property and local binding:

```js
function inspect() {
  const owner = { secretField: 29 };
  const privateLocal = owner.secretField;
  return privateLocal;
}
```

It then installs one of two pure own conversion hooks:

```js
inspect[Symbol.toPrimitive] = () => 'stable';
// or
inspect.toString = () => 'stable';
```

The function is passed to native Node Web IDL string-collection methods:

- `new Headers().append("x-observed", inspect)`
- `new URLSearchParams().append("x-observed", inspect)`

The harness runs both original and emitted code in a VM context using the real Node 22.23.4 `Headers` and `URLSearchParams` constructors. A separate no-hook control confirms that default Web IDL conversion does expose the original function source.

## Results

Focused run **45186322393** ran on Ubuntu and Windows with Node 22.23.4.

For both the own `Symbol.toPrimitive` and own `toString` cases, both operating systems reported:

```json
{
  "native": {"header":"stable","param":"stable","value":29},
  "emitted": {"header":"stable","param":"stable","value":29},
  "sourceObserved": true,
  "metrics": {"literals":0,"objects":0,"properties":0,"bindings":0},
  "retainedSecretField": true,
  "retainedPrivateLocal": true
}
```

The default-conversion positive control passed on both operating systems and verified that, without a custom hook, Headers readback includes the original `secretField` source spelling and `observesFunctionSource` returns true.

The two custom-hook tests are expected-red: runtime behavior confirms the conversion result is the constant `stable`, but the current observer still returns true and suppresses every unrelated private rewrite. The focused test step failed on both operating systems. JSDoc steps were skipped after that failure; this is not a full-suite or comprehensive acceptance result.

## Code-path explanation

At the current-main AST source pin `c227e6e604635a42663af745fd0cfb194b215a67`:

- `mayCoerceSourceWithinWebRecord` at `src/ast.js:1739-1756` treats any non-primitive value as potentially source-coercing unless a narrow literal/container proof applies.
- The Web IDL string-collection method guard around `src/ast.js:3063-3100` treats any non-`isDefinitelyPrimitive` argument to recognized Headers/URLSearchParams methods as an observer.
- Neither path resolves the argument function's own data-property `Symbol.toPrimitive` or `toString` dispatch.

The runtime result shows that these two proven own hooks intercept the abstract ToString operation before default Function.prototype.toString is reached. The current Boolean observer therefore over-approximates this case and loses transformation yield.

## Required analysis boundary

A selective effect analysis should distinguish:

1. **Proven native source path:** no effective custom conversion hook; native Function stringification can expose the exact source.
2. **Proven own primitive-returning hook:** an own data-property Symbol.toPrimitive or toString is resolved to a statically proved pure primitive result; the Web IDL conversion does not expose the original function source through this sink.
3. **Unknown hook path:** accessor getter, proxy, mutable alias, dynamic property key, patched intrinsic, or hook body with unresolved calls/side effects. This must remain Unknown rather than being assumed safe.

The test only establishes the second case for two own hooks returning the literal string `stable`, with Node's Headers and URLSearchParams. It does not establish the same result for Storage, Window.name, browser DOM setters, cross-realm receivers, or arbitrary custom hooks; add separate native-browser controls for those sinks before generalizing.

This is a source-observer precision/yield finding. It does not show a security weakness in the obfuscator, a source disclosure, or a need to weaken conservative handling of unknown dispatch.

**Disposition:** keep as intermediate evidence in `im-results/` and feed it into Agent 3's single source-observer intake and Agent 39's conversion-effect model. Do not promote it to `results/`.
