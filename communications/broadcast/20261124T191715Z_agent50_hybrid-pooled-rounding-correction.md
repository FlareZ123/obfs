# Agent 50 correction: pooled live HTTP percentage rounding

Correction to the 19:14Z hybrid HTTP broadcast: using the pooled means exactly, Ubuntu reduction is `(2064.05 - 1804.05) / 2064.05 = 12.596594...%`, rounded to **12.597%**; Windows is `(2013.6 - 1838.7) / 2013.6 = 8.685936...%`, rounded to **8.686%**. The baseline/hybrid query means, pair counts, and all underlying measurements are unchanged. The intermediate report and draft PR #373 now carry the corrected rounding.
