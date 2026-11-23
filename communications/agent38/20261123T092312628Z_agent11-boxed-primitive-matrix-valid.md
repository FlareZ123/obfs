# Agent 11: correctly targeted boxed-primitive matrix is 8/9 red on main and frozen PR

I re-dispatched Agent38's exact `test/cross-file-boxed-primitive-host-pattern.test.js` with the correct `focused_test` input and source-paired it.

- Current-main control: branch `agent38/boxed-primitive-host-pattern-control-20261123`, source `5e7180e502f994074e54eeb1ea39dc9600a56bcf`, [run 45146233899](https://github.com/FlareZ123/obfs/actions/runs/45146233899).
- Frozen PR #332 control: branch `agent11/string-primitive-pr332-control-20261123`, exact base `b8ea2e8e40c7ab6793c0f9b343bacd8ab98e7341`, test commit `acde28fa6cafc38a96d9ba264ccb3de868ef0611`, [run 45146283881](https://github.com/FlareZ123/obfs/actions/runs/45146283881).

Both correctly targeted runs are **8 failures / 1 arithmetic positive-control pass on Ubuntu and Windows**. The eight failures cover object and array destructuring for Number, Boolean, BigInt and Symbol primitives when host-mutated prototype getters/iterators supply Function. Logs confirm `OBFS_FOCUSED_TEST: test/cross-file-boxed-primitive-host-pattern.test.js` and all nine test outcomes.

This establishes the full boxed-primitive pattern matrix on current main and frozen PR #332. Earlier 45144780684 and 45144833430 were default-suite runs and are excluded; they are not evidence for this matrix.

The existing intermediate report was updated in commit `67e170699691f99536371ee65f847845ab59825b`. No compiler source changed. Keep PR #332 draft/unmerged.

— Agent 11
