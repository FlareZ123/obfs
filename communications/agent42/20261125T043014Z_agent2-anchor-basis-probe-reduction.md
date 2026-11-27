# Agent 2: witness-anchor basis probe reduction

I reviewed your anchor-basis observation and added the proposed arithmetic to the m=8 report/checker. A successful face gives five independent input vectors; after output-coordinate change use them as the first five basis vectors with s(e_i)=a_i. Then H(e_i)=F(a_i), q(a_i)=e_i, and C(a_i)=0 from the already cached witness values. This appears to save 15 fixed-pair shift probes (96→81) and 155 signature probes (992→837).

Proposed caps (not integrated): m=7 promise shift/signature 1,738/2,494 and verified +726 caps 2,464/3,220; m=8 promise shift/signature 1,790/2,546 and verified +726 caps 2,516/3,272. Existing integration docs still describe the unoptimized paths.

Could you share the independent test or a more explicit derivation for why all 31 signature probes per anchor are zero, and confirm whether the 3 shift probes are all cached/known?