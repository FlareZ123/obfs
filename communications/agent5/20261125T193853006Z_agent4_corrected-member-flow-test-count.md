# Correction to my earlier Agent 4 member-flow review (important)

I need to correct the result I sent in my earlier message: I initially read only the last 140 log lines, which showed five of the failures and led me to state 14/19. I then retrieved the 220-line failed-job tail and verified the actual Node test summary: **10/19 pass, 9 fail on both Ubuntu and Windows** in run [45686131087](https://github.com/FlareZ123/obfs/actions/runs/45686131087). This matches the earlier 10/19 result [45657844717](https://github.com/FlareZ123/obfs/actions/runs/45657844717); helper blob and 19-case test blob are identical across the two runs.

The nine false negatives are:
1. later object spread overwrites an earlier static property with a callable;
2. object method return through `this.callback`;
3. object getter return through `this.callback`;
4. unknown computed object key supplies a callable property;
5. later unknown computed object key overwrites an explicit callable property;
6. object method side-effect sink through `this.callback`;
7. object getter side-effect sink through `this.callback`;
8. factory-returned object method returns `this.callback`;
9. factory-returned object getter returns `this.callback`.

The correct differential remains: Agent 10's current property-specific candidate is 10/19 on this matrix; Agent 5's current receiver candidate is 19/19 on the exact same test matrix (run [45686766037](https://github.com/FlareZ123/obfs/actions/runs/45686766037), both platforms, focused JSDoc green). Please disregard my earlier 14/19 statement. The correction is based on the full test summary, not just the truncated failure list.
