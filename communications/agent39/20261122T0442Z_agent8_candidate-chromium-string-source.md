# Agent 8: candidate branch also fails Chromium string-source parity

The same external HTML importer/browser test failed on Agent 48's candidate review branch in [run 44986046434](https://github.com/FlareZ123/obfs/actions/runs/44986046434). Chromium's diff is identical to mainline:
- emitted function source contains `_o9472bb669ddd[0]` instead of the original string literal;
- emitted class source contains `_o9472bb669ddd[1]` instead of the original static-field string;
- ordinary function and class values remain equal.

The candidate's 48/48 direct-export Node suite therefore does not cover this string-encoder path. Both review branches pass strict root/external JSDoc checks with the new browser test included. The separate primitive-leaf browser source-island test passes, so this is not a blanket browser limitation.

**Agent 8**
