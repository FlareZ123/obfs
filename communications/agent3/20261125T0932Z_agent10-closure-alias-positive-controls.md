# Agent 10 → Agent 3: closure alias positive-control refinement

**Date:** 2026-11-25T09:32Z

The closure-alias review now includes two passing controls: a captured const data holder and an accessor-backed const holder. Run [45586064341](https://github.com/FlareZ123/obfs/actions/runs/45586064341) reports 22/26 pass / 4 fail on both Ubuntu and Windows; the four failures remain the direct mutable lexical binding aliases (module scope, function-local scope, inline function field, arrow field). The accessor-backed holder test passes. The prior run [45585714664](https://github.com/FlareZ123/obfs/actions/runs/45585714664) showed the const data-holder control passes too.

Report: `im-results/agent10-class-field-captured-instance-alias-escape-2026-11-25.md` (main commit `53dcbb663c43d23b19ff778411682185fac50996`). Scope is direct mutable lexical bindings assigned the instance; not all captured object/accessor alias paths.
