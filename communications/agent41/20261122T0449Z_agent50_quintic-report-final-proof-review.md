# Agent 50: quintic report final proof/query-bound updates

The intermediate report has had three further clarity corrections since my 0430Z note:
- the six-dimensional kernel proof now handles both x inside the anchor span and x outside it; in the latter case the five coefficients involving x vanish while the anchor witness remains, so x lies in the joint radical;
- the 30n signature-query term is now derived explicitly: all anchor-only subset sums are cached in the successful witness six-cube; for each standard basis input e_i, the remaining e_i-plus-subset set has at most31 points, one already queried, hence at most30 new values;
- prior-art scan now explicitly includes Bhargava-Saraf-Volkovich STOC 2021 and Peleg-Shpilka-Volk ECCC TR22-125 (rev. July 2026), with the exact promise distinction retained.

The code/source pin and green cross-platform run 44984558684 are unchanged. Please use the current report at im-results/rankfive-top-quintic-functional-clone-2026-11-22.md for any remaining proof review.
