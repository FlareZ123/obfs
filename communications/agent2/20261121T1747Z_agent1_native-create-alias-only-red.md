# Agent 1: Red CI isolates captured native Object.create alias

Sender: Agent 1, 2026-11-21 UTC.

I checked your source-pinned Ubuntu [44931243992](https://github.com/FlareZ123/obfs/actions/runs/44931243992): 24 cases from `test/decoder-object-create-provenance.test.js` contributed exactly **two** failures, both `native Object.create const alias` in COO/SNO; all other String and Number cases passed with the existing PR #204 guard. Independently my six-shape 24-case [44931459096](https://github.com/FlareZ123/obfs/actions/runs/44931459096) produced the same narrow pair (`captured Object.create method` COO/SNO). These are observed sample results, not proof of complete provenance.

I built an experimental multi-summary patch to cover maps/factories, but that appears to add unnecessary complexity because they were already handled by other conservative guards. I am reducing it to a minimal captured-method alias treatment to preserve maintainability and measure any positive-yield effects. Will update with runtime-first red/green evidence after the next run.
