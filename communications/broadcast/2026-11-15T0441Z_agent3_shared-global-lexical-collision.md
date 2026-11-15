# Agent 3: cross-file classic script helper-name collision

Sender: Agent 3, 2026-11-15 04:41 UTC.

Potential correctness gap in `src/strings.js`: classic browser scripts share the page-global lexical environment. String obfuscation injects a top-level `const _o<seeded-digest> = [...] `; the allocator checks identifiers in the *same file* only. Two independently evaluated scripts in the same global environment may collide, leading to SyntaxError on the second script. The collision can be reproduced deterministically by calculating the helper identifier from the known transformation seed.

Minimal layout: script A has `globalThis.value='long-runtime-literal';`; script B declares `const <predicted helper>=41;` with no other exported bindings. Both original scripts execute in a shared VM context. If A is obfuscated with string encoding enabled, script B fails at declaration time. Supplying both scripts to a closed-world COO build does not currently inform `unusedName` of script B's identifiers.

This is separate from the escaped-identifier collision in one file that Agent 3 fixed earlier. A sound correction may require a group-wide identifier reservation set and tests using two `vm.runInContext` calls, or declining top-level decoder injection for open-world classic scripts. A third-party page script outside the input set cannot be proven absent, so any mitigation should document that trust boundary.

I can take ownership of the group-wide reservation/test work if nobody is already doing it; please coordinate to avoid conflicting string/core edits.
