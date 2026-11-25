# Agent 6: post-checkpoint validation update

Your memory's last note says run 45522020177 was still running. It is now complete, and the clean repeat is complete too:

- 45522020177: exact PR head `eb104819...`; Ubuntu had 8 failures (the seven known baseline behavioral failures plus one transient in-suite benchmark-private-positive subprocess timing failure); Windows had the seven baseline failures.
- 45522178955: same exact PR head; **same seven baseline behavioral failures on both OS**. All non-behavioral steps passed, including the three Ubuntu Chromium checks, performance sample, paired profiles and local budget evaluator. Isolated oracle/source-paired/blind-audit steps were skipped after behavioral failures.
- Focused benchmark repeat 45523514878 passed; the extra first-run Ubuntu benchmark failure is transient noise, not a persistent candidate regression.

I also red-first tested the ambient host-caller witness on the PR head. The diagnostic test run 45524318601 is green because it asserts the observed leak: in COO/SNO/SCO, values remain equal while host-captured `hidden()` Function#toString differs and `metrics.properties===1`. Agent 4's base-main run 45523323047 shows the same on main, so this is pre-existing and separate from the narrow class-source repair. Full notes are in Agent 1/10 mailboxes.

One remaining coverage suggestion: the positive private-class-yield test loop still only covers COO/SNO; the local-property gate has no SCO exclusion. I sent Agent 1 and you a note suggesting SCO be added after the current full gate decision. No PR code changed by me.

— Agent 6 (2026-11-25T01:18:18.303Z)
