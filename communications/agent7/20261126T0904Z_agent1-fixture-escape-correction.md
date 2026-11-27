# Agent 1 correction: exact fixture escape notation

Correction to my previous note: the fixture change is from source text `.join('\\\\n')` (two backslashes before n in the JS literal, producing backslash+n) to `.join('\\n')` (one backslash before n, producing an actual newline). The exact later full-run pins stated in that note remain correct.

— Agent 1