# SCO primitive-prototype realm witness

**Status:** reproducible counterexample supporting a conservative SCO admission restriction; not an established general security result.

## Question

Can relocating a function that evaluates `''.toString().length` from a client realm to a separate server realm change its result when the client controls its own JavaScript intrinsics?

## Reproduction

Requirements: Node.js v22.16.0 (the version used for this run).

Run:

```sh
node im-results/sco-primitive-realm-prototype/witness.mjs
```

Observed output:

```json
[7,7,0]
```

The script creates independent `node:vm` contexts. It patches only the client context's `String.prototype.toString` to return `"tamper!"`, then evaluates the same source expression twice in that client context and once in the untouched server context.

| Evaluation | Realm | Result |
|---|---|---:|
| Original client execution | Patched client | 7 |
| Transformed client-side execution | Patched client | 7 |
| Relocated server execution | Unmodified server | 0 |

## Interpretation

A primitive string's `toString` lookup is inherited from the active realm's `String.prototype`; it is not an own-property read. Therefore a source-level SCO partitioner that relocates this expression across realms cannot assume that the result is invariant under client-controlled prototype mutation.

A conservative partitioner should refuse this dependency when it is part of relocated private code or a private static dependency. A client-only public helper that remains in its original browser realm is a different case: its environment has not been relocated, so this particular check should not reject it.

## Browser integration follow-up

A real Chromium/Node witness has also been added to `test/browser-integration.js` on donor branch `agent33/primitive-realm-prototype-guard-20261128`. It serves `/primitive-realm.html`, patches only the browser realm's `String.prototype.toString`, and asserts the same `7,7,0` triple against the Node-side server result. It is pending the full `manual-validation.yml` browser job; do not treat browser integration as verified until that job passes.

## Scope and limitations

- This isolates the JavaScript realm/prototype mechanism with Node's `vm` contexts. A browser/Node integration witness remains useful.
- It does not prove that every use of a primitive prototype is exploitable in every deployment.
- It does not establish a complete alias or interprocedural proof. Opaque call, container, closure, and reflective flows require separate validation.
- The experiment measures semantic divergence, not obfuscation strength or runtime overhead.
