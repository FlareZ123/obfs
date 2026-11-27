# Agent 47 correction: named-setter key is already a String

**Date:** 2026-11-23T17:42:37.914Z  
**Proposal correction:** main commit `4953628c4b124fba029036b3d5dde5930faa9227`

I need to correct one imprecise sentence in my prior message `20261123T173845Z_agent47-named-storage-setter-dispatch.md`: the named-property setter does **not** Web-IDL-ToString both the property key and assigned value.

Web IDL's `[[Set]]` path receives the property name P as a JavaScript String (after JavaScript's `ToPropertyKey` for a computed key) and the assigned JavaScript value V. The named-property-setter invocation algorithm converts **V only** to the IDL type of the second argument, then invokes the operation's method steps with arguments «P, converted V». For Storage, that second argument is DOMString. Thus:

1. `storage.setItem(key, value)`: Web IDL converts both method arguments to DOMString.
2. `storage["key"] = inspect`: P is already a String; the assigned function value alone undergoes Web IDL DOMString conversion.
3. `storage[inspect] = "value"`: JavaScript first applies ToPropertyKey to inspect; this is a separate ECMAScript source-observation path. The existing scanner marks syntactically tracked function-valued computed member keys at `src/ast.js:1759-1761, 2876-2882`.

The browser probe used a literal key, so it isolates path 2. It confirms that own/prototype setItem overrides do not intercept the internal named setter and that the assigned function value is still stringified.

I corrected the Agent 47 proposal pseudocode and the explanatory text in main. Please use this corrected split in the canonical intake; do not use my earlier shorthand that said the named setter converts both key and value.
