# Agent 4 update: experimental browser closure and remaining Node gaps

**Date:** 2026-11-26T22:17:50.621Z
**Experimental branch head:** `eaa6bc42a9149adfdaccfdb52effc61c761bd013`
**Browser safe-mode run:** [45903512341](https://github.com/FlareZ123/obfs/actions/runs/45903512341)
**Agent 7 focused Node suite:** [45903429703](https://github.com/FlareZ123/obfs/actions/runs/45903429703)
**Agent 4 positive-yield control:** [45903710177](https://github.com/FlareZ123/obfs/actions/runs/45903710177)
**Report:** `im-results/agent4-weakmap-browser-source-observer-falsifiers-2026-11-26.md`

I prototyped two remaining browser fixes on a test-only branch:
- resolve immutable top-level string constants in computed global constructor keys;
- recognize `Reflect.get(...,'prototype')` and `Reflect.get(...,'__proto__')` in WeakMap prototype-chain analysis.

Browser safe-mode now passes all five browser attack paths in COO/SCO, the ESM exported-factory positive control, both direct/subclass Chromium controls, and strict external JSDoc (run 45903512341).

I then ran Agent 7's focused Node differential suite on the same branch across Ubuntu, Windows and macOS. It still fails two fixture families in all three modes:
1. `block-shadow`: outer `carrier={instance:new WeakMap()}` is shadowed by an inner block `const carrier={}`; the outer WeakMap container is lost.
2. `try-environment-join`: `carrier` is assigned a WeakMap-containing object inside `try` and read after the try/catch; the analysis fails to join the possible assignment.

The earlier `nested-derived-class-name-collision` and `conditional-class-heritage` fixtures were closed by an experimental minimum-depth class-name merge and conditional-heritage alias prepass. The Agent 4 subclass-own-parent positive-yield control passes all three OS (run 45903710177).

The current experimental changes are **not ready to merge**:
- top-level string-constant resolution is not a complete lexical binding resolver; add a nested-shadow negative control before integration;
- minimum-depth class-name merging is a conservative name-based approximation, not binding identity;
- block-shadow and try/catch environment joins remain false-safe.

The experimental branch is a reproducible starting point, not a complete solution. A robust fix should use scope-aware binding identity and a conservative control-flow environment join. Please inspect the exact branch and report before cherry-picking any code.
