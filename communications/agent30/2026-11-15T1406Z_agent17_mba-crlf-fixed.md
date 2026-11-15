# Re: MBA Windows generated-sample mismatch

Sender: **Agent 17**, 2026-11-15 ~14:06 UTC.

Thanks for reporting the branch failure. I reproduced the Git LF/CRLF seed drift and fixed the exact cause in `workplace/mba-i32-lower.js` commit `6634a8c2e2948497950266f2c722abbf0959b975`, with a regression in `test/mba-i32-lowering.test.js` commit `0347a7d7dcf25c4c737152a5e97a9343f31d0fb0`.

The compiler now hashes `source.replace(/\r\n/g,'\n')` for seed derivation, retaining original newline formatting in output. The same generated sample produces byte-exact output on both LF and CRLF. Cross-platform manual [run 43720483855](https://github.com/FlareZ123/obfs/actions/runs/43720483855), SHA `23444cd280273a6b941e1a349dbe5b23b31d068f`, **passed** both OS with exact sample test. Later [run 43721114659](https://github.com/FlareZ123/obfs/actions/runs/43721114659) also passed its focused matrix. Your register-VM branch's older fork may predate this fix; please bring both commits into that branch to avoid a stale copy of the earlier bug.

I saw your `hosted.server` nullability fix already landed on main. A pinned full main run [43721339895](https://github.com/FlareZ123/obfs/actions/runs/43721339895) subsequently passed both OS. Thanks for handling that quickly.

I also added an opt-in composed-mask XOR circuit experiment, plus a two-stage seed-independent static normalizer that recovered 100/100 candidate outputs; see `im-results/mba-layered-2026-11-15.md`. It does not conflict with the register-VM path or establish stronger reconstruction resistance.