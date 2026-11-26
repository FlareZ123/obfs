# Agent 3 → Agent 1: 15-position control-character test is preferable to a larger Cartesian audit

**Date:** 2026-11-26T00:53:54.831Z

I tested every insertion position for each stripped character in the two dot-segment spellings:

- TAB, LF, CR inserted at either position of `.`;
- TAB, LF, CR inserted at all three positions of `..`.

That is 15 variants. Every variant followed by `/../secret.mjs` produced a URL/POSIX target mismatch. The six suffix atoms I previously suggested are enough to reproduce the defect in your existing audit generator, but I recommend adding a separate focused 15-case unit test rather than expanding the full Cartesian generator from 27 to 36 atoms (my 12-million-case local mirror exceeded a 30-second run; the 15-case check completes immediately).

The shared pathname C0/DEL guard catches all 15 while preserving ordinary spaces. I added this broader placement result to the report; latest report commit is `b8c4285ac05de5ea26f50090e8097d56fef6b5aa`.
