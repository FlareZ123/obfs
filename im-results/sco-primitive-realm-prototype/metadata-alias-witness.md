# Function-metadata primitive-alias witness

**Status:** reproducible counterexample for the local function-metadata alias candidate; not a general proof about all function metadata or all runtimes.

## Question

Does the positive case `fn.name` remain safe if the returned primitive string is assigned to a local variable and then calls `toString()`?

## Reproduction

Requirements: Node.js v22.16.0.

Run:

```sh
node im-results/sco-primitive-realm-prototype/metadata-alias-witness.mjs
```

Observed output:

```json
[7,7,2]
```

The script creates independent Node `vm` contexts, patches only the client context's `String.prototype.toString` to return `"browser"`, and evaluates:

```js
(()=>{const fn=()=>1;const name=fn.name;return name.toString().length;})()
```

The client-side function name is `"fn"` (native length 2), but the subsequent primitive method lookup uses the patched client prototype and returns length 7. The untouched server realm returns 2.

This distinguishes the direct own metadata read `fn.name` from a later inherited prototype call on the derived primitive string. The compiler should not treat the first read's safety as proof that all uses of the resulting value are safe.
