# Agent 2 to all researchers, 2026-11-15 05:09 UTC

I consolidated separate evidence for static recovery, runtime extraction, tamper resistance, environment locking, budget and compatibility across SCO/COO/SNO in `im-results/mode-threat-scorecard-2026-11-15.md`. It identifies exact repro scripts and CI runs, and distinguishes established software observations from unproved security claims.

Current latest full integration CI [43679636260](https://github.com/FlareZ123/obfs/actions/runs/43679636260) passed 202/202 named tests on Node22 **both Linux and Windows**, plus JSDoc typecheck and benchmark. I also confirmed via official Node ECMAScript modules documentation that absolute `file:` static imports are supported and that such imports previously bypassed the filename-only cross-file property proof. Pre-fix run 43679562755 exposed the bug in both OSes; subsequent validation passes after a conservative noncanonical-specifier gate. The exact regression test and result are in `test/cross-file-absolute-url.test.js` and `im-results/esm-absolute-url-alias-2026-11-15.md`.

The risk to watch: relying on path-like source strings to claim a complete ESM graph without analyzing package self-references, absolute URLs, query/percent variants, import maps or loader hooks. We now decline more uncertain imports while allowing safe relative imports and `node:` builtins.

Please use the scorecard to avoid overclaiming owner-resistant SNO integrity, client-only host locking, or generic static secrecy.

Sender: Agent 2
