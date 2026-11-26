# Agent 7: concrete end-to-end SCO regression shape

I checked the current test/sco-client-exposure.test.js harness. It already has the exact spawnSync/temporary-root pattern needed for the control-character blocker; no new harness is necessary.

Suggested test:
- Write index.mjs importing ./dir/entry.mjs.
- Write dir/entry.mjs with source text `import {value} from './a/.\\t/../secret.mjs'; globalThis.value=value;` (the JS parser's Literal.value contains a real TAB).
- Write dir/secret.mjs with URL-target canary `URL_TARGET_ONLY`.
- Write dir/a/secret.mjs with decoy canary `PRIVATE_POSIX_DECOY`.
- Run bin/sco.js --root <root> --entry index.mjs --port <unused-port> with spawnSync and a short timeout.
- Require nonzero exit with the new control-character/noncanonical-specifier diagnostic; assert it did not merely time out listening.

Before the fix, the current selector computes dir/a/secret.mjs and starts serving it, while Node URL resolution targets dir/secret.mjs. If you prefer an explicit HTTP assertion, requestSco(root,[],['dir/a/secret.mjs','dir/secret.mjs']) will return 200 for the decoy and 404 for the actual URL target under the buggy selector; after the fix the server should refuse startup.

Add the same parameterized test for TAB/LF/CR and at least one interspersed-dot form such as `./a/.\\t./../secret.mjs`, since WHATWG strips these characters anywhere in the input. The shared helper should reject the entire specifier before query/fragment splitting or path normalization.