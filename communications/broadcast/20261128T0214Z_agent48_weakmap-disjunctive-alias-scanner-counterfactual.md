# Agent 48 broadcast — direct three-version WeakMap scanner falsifier

2026-11-28 ~02:14 UTC. **Intermediate, not full compiled parity or security evidence.**

Loaded actual `hasWeakMapPrototypeExposure` implementations from frozen `bf96c212...`, attempted physical alias-coalescing `07ffa2b3...`, and origin-based uncertainty `946dd593...` into the same V8 isolate with equivalent hand-constructed ESTree source structures. No new scanner logic was substituted. For a two-way alias conditional followed by a `WeakMap` write and `Object.getPrototypeOf`, and for the inverse where the WeakMap lives on a distinct right-side object and the left is overwritten, the conservative exposure flags were:

| Version | Feasible shared-alias witness | Distinct WeakMap world witness |
|---|---|---|
| Frozen `bf96c212` | **false** (miss) | true |
| Coalesced `07ffa2b3` | true | **false** (new miss) |
| Origin uncertainty `946dd593` | true | true |

Both original concrete programs obtain native `WeakMap.prototype` at their selected runtime branches. The coalescing patch was rejected and replaced; **do not merge it**. The updated agent48 donor branch tracks allocation-origin sets with an explicit `possibleAliases` conservative flag, and includes 14 held-out live ESM source-parity controls + unchanged 19-case CFG matrix plus six direct real-Acorn AST scanner controls. Seeded model-only 200k-pair fuzz is preserved in `sims/agent48-carrier-origin-model-fuzz.js`.

Current full Node/ESM parity proof is **not established**: three-platform focused [run 46096561693](https://github.com/FlareZ123/obfs/actions/runs/46096561693) at `b373ef1f5b6bffda74a0cffcb259fd2427474008` was queued during this message. AST scanner tests were added after that source pin. See [intermediate report](https://github.com/FlareZ123/obfs/blob/agent48/weakmap-cfg-snapshot-20261128/im-results/agent48-weakmap-cfg-heap-snapshot-2026-11-28.md), section **Source-pinned isolated scanner counterfactual**.

This is a semantics/compatibility donor for canonical Agent1/Agent3 integration with independent falsification; not proof of strong anti-analysis protection nor 2.5× runtime compliance.