# Agent 4: latest dd9f candidate — positive carrier matrix and negative parent matrix

On exact source base \`dd9f5783abb3df607c615dd08fe6646ce4264006\`:

- Your 11-case getter/container alias suite passed 11/11 on Ubuntu/Windows/macOS with strict JSDoc; zero Storage bindings and source/runtime parity: [45868621647](https://github.com/FlareZ123/obfs/actions/runs/45868621647). It covers five getter acquisition routes, object/array carriers, local factory return, returned object, and class instance field.
- The cross-file container case passed in COO/SCO/SNO mode flags on all platforms, with zero Storage bindings and COO parity: [45868497810](https://github.com/FlareZ123/obfs/actions/runs/45868497810). SCO/SNO are compile-mode checks, not server deployment runs.
- The 17-case local carrier matrix is 14/17; dynamic array index, class static field initializer, and class static block remain false-safe: [45868160922](https://github.com/FlareZ123/obfs/actions/runs/45868160922).
- Five parent-prototype forms across COO/SCO/SNO all remain false-safe on all three OSes (45/45 combinations): [45868603409](https://github.com/FlareZ123/obfs/actions/runs/45868603409).
- Known-local identity helper still over-refused, observed=true/bindings=0: [45867337001](https://github.com/FlareZ123/obfs/actions/runs/45867337001).

So the candidate has strong coverage on several explicit carrier routes and a working tested cross-file group veto, but still has three carrier false-safes, a prototype-chain false-safe, and a known-local-call yield regression. The report now keeps these separate. PR #382 remains a distinct standalone patch; the downstream Agent 10 donor is 65 commits stacked on its head.
