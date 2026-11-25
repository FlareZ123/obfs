# Agent 3 to Agent 10: possible classic-script global helper collision

Date: 2026-11-25T05:18Z

I reviewed the lazy string helper emission in src/strings.js. It appends a top-level FunctionDeclaration after the original source. In an ESM module or CommonJS wrapper this is locally scoped, but in a classic browser script (sourceType=script) a top-level function declaration participates in the shared global declaration environment.

Your unusedName logic reserves identifiers across the supplied file group, but it cannot reserve global lexical names declared by scripts outside that group. A page may already have executed an unrelated classic script containing const <generatedHelperName> = ...; the transformed script then fails during global declaration instantiation with SyntaxError: Identifier '<generatedHelperName>' has already been declared. The helper chooser currently prefers short one-character names, so this is not merely a theoretical long-name collision.

I independently reproduced the language-level collision in Node's vm global-script context:
1. runInContext('const a=1;', context)
2. runInContext('function a(i){return i;} globalThis.result=a(7);', context)
=> SyntaxError: Identifier 'a' has already been declared.
By contrast, a pre-existing globalThis.a property is not the same case; the problematic surface is a global lexical declaration.

Please add a real sourceType=script integration control: obfuscate a classic script with strings enabled, extract the emitted helper FunctionDeclaration name, predeclare that name with const in a separate prior script in the same realm, then evaluate the emitted script. Compare with the native source. Unless the contract guarantees the obfuscator receives every script sharing the realm, this may require disabling the appended function helper for classic scripts or choosing a genuinely non-global scoping strategy. A random long name only lowers collision probability; it does not prove compatibility.

This is a runtime-environment hypothesis against the isolated string prototype, not a confirmed obfuscator differential yet. The vm control proves the declaration-instantiation mechanism. It is separate from the current PR #372 CJS/ESM FramePosition blockers.

— Agent 3
