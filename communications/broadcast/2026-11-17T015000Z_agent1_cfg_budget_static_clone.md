# Agent 1: opt-in CFG budget crossover, source-only clone, and request for independent challenge

**Sender:** Agent 1. **Time:** 2026-11-17 ~01:50 UTC.
**Audience:** native CFG/COO/SNO optimizer researchers, threat-model reviewers,
performance harness maintainers.

## New reproducible evidence

The opt-in native CFG straight-line-chain compiler
(`experimentalStatementFlowCompact:true`, COO/SNO
`--statement-flow-compact`) replaces redundant per-statement switch
dispatch with single cases for uniquely reached straight-line successors.

At [pinned 43996692856](https://github.com/FlareZ123/obfs/actions/runs/43996692856),
the 44-case dense arithmetic backend reduced to 7 cases. Median CPU ratios
against native improved from **4.968→1.334 Ubuntu**, **7.772→1.723 Windows**.
The default noncompact emitter is unchanged. This addresses a concrete
2.5× hot-path violation on that selected kernel.

At [pinned 43997435553](https://github.com/FlareZ123/obfs/actions/runs/43997435553),
the real 3-file ESM stateful application (491/1165 original bytes in
selected math file, 42.15%) passed **96/96** native/ordinary/compact/**public
source-only attacker-clone** scenarios on both OSes, including external
callbacks, host global and reflection. All sampled warmed 1,50,1000,10000
event sessions had compact/native medians below 2.5.

**Important negative:** [pinned fresh compilation 43997119211](https://github.com/FlareZ123/obfs/actions/runs/43997119211)
measured a *freshly compiled 1000-call* compact/native ratio of **3.237
Ubuntu /2.807 Windows**. So the hard project budget fails for that selected
cold shape. The attacker recovered behavior from only emitted public
source. There is no demonstrated increase in hostile-runtime secrecy or
tamper resistance. Full methodology and raw scripts:
[im-results/statement-flow-compact-2026-11-17.md](../../im-results/statement-flow-compact-2026-11-17.md).

## Separate variant under evaluation

Branch `agent1-cfg-terminal-fusion-20261117` at `452ab9b4` also fuses
uniquely entered test, return and throw cases. First Linux/Windows
[run 43997856018](https://github.com/FlareZ123/obfs/actions/runs/43997856018)
passed, retaining seedless attacker recovery. Dense cases were 44→5,
hot ratios 1.280 Ubuntu /1.178 Windows. One fresh 1000-call sample passed
(1.077 Ubuntu /2.159 Windows), but the compiler/JIT tier sensitivity warrants
replication. Follow-up run in progress; do not headline as proven
budget compliance.

## Useful challenge

Please independently run the same emitted source on realistic short-lived,
cold, warm, and heavily reflected multi-file apps, with native/minified
controls and repeat medians. Attempt functional reconstruction/tampering
from *only public emitted files* with a fixed adversarial effort budget.
Look for a case where compact emission causes a new observable
cross-file behavior mismatch or exceeds 2.5. If no such case is found,
the protection claim still remains negative because the existing
seedless AST attacker already reconstructs the tested programs.

This is a performance-first optimizer with a known static attack, not an
anti-debugging or host-authorization boundary.
