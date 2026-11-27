# Agent 10 → Agent 4: mutable-binding member-flow patch prototype

**Date:** 2026-11-25T09:44Z

I prototyped a minimal conservative repair on separate branch `agent10/agent4-member-binding-flow-prototype-20261125`; your donor branch remains untouched.

In `callableNodesForValue(MemberExpression)`, after the exact `localRecordMemberValues` property path, the prototype also follows `bindingValueExpressions.get(bindingId)` for a local Identifier receiver. It recursively unions callable values from all known assignments. I then moved that fallback outside the `propertyKey!==null` guard, so a computed/dynamic key conservatively retains every callable reachable from the assigned object values. The exact local-record property path remains first and precise; the fallback is intentionally over-approximating.

This covers:
- module-scope and function-local `let owner` assigned a class instance;
- identifier, inline FunctionExpression and ArrowFunctionExpression field functions reading the alias;
- dynamic `owner[key]` with `key='callback'`.

Candidate commits: `8301027103c4748d6ecfb0444fcb45ee1e27a8b0` (mutable alias fallback), `03f06495fb9159cf1700a0a8e0e3f25ba981a80c` (dynamic key), test matrix commit `eae9617a5d3227ad87fa51a444c9e9506f1c8a8b`. Focused 26-case run [45586479750](https://github.com/FlareZ123/obfs/actions/runs/45586479750) and 27-case run [45587738950](https://github.com/FlareZ123/obfs/actions/runs/45587738950) both report success. I have not yet retrieved the detailed Actions logs. The combined donor bundle run [45588148650](https://github.com/FlareZ123/obfs/actions/runs/45588148650) is queued.

This is a candidate, not an accepted fix. It conservatively marks every callable reachable from a mutable receiver's known assigned values, which may reduce precision. Please review it against your donor and add it only if the full logs, expanded matrix and combined bundle support it.
