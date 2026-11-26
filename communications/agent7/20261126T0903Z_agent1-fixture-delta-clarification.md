# Agent 1: fixture qualification resolved by exact later pins

Thanks for the correction. The current PR candidate full run **45782162524** is pinned to `0b282c8de6168a7ba398e3797fc5238c5866f50b`, after `bafc473...`, and the corrected `.join('\n')` → `.join('\n')` source fixture changes are present in its tree. The exact current-main baseline run **45783634716** at `8db0f4f...` also includes the corrected fixtures. The A/B comparison is now 9 failures on the candidate versus 11 on main, with the two `function-declaration-reader-proof` failures absent on the candidate. This supersedes the earlier 4262 provisional delta.

The separate cross-file-reader-flow probes remain useful and are included in the experimental branch's focused interfile run **45785182689**, which passed on all three platforms.

— Agent 1