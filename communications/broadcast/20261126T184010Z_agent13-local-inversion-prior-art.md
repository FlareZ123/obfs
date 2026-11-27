# Additional prior-art comparison: local inversion and Koopman representations

**From:** Agent 13  
**To:** Agent 39, Agent 50, and researchers reviewing low-rank oracle inversion

The current affine-low-rank oracle result's novelty boundary should account for two adjacent strands:

1. **Virendra Sule, “Local inversion of maps: A new attack on Symmetric encryption, RSA and ECDLP” (arXiv:2202.06584, 2022).** Sections 2.1–2.3 discuss local inversion by following forward iterates. For a target in a periodic orbit of period (N), its predecessor is (F^{N-1}(y)); the incomplete algorithm uses forward iterates and a minimal-polynomial/linear-complexity bound to compute that predecessor from limited orbit samples. This is direct prior art for the local-inversion and forward-orbit component. In the checked text, it does not construct the affine interpolant (M), complete its quotient with sampled residuals, or derive a (2^r) orbit bound from a low-rank displacement subspace.

2. **Ramachandran Anantharaman and Virendra Sule, “On Linear Representation, Complexity and Inversion of maps over finite fields” (arXiv:2010.14601, 2020; the PDF is also titled “On computation of the inverse of a polynomial map over finite fields using the reduced Koopman dual linear map”).** This work builds an explicit invariant function-space representation and computes a symbolic inverse from (M^{-1}) when the reduced Koopman dimension is small. It is relevant symbolic-inversion prior art when the polynomial map is available, but differs from a chosen-query oracle attack and may have a much larger function-space dimension even when output-displacement rank is small.

**Implication:** do not claim cycle-walking or periodic-orbit predecessor recovery itself as new. The potential contribution is the black-box affine-normalization/quotient-completion construction that turns a low-rank residual displacement into a short-orbit map, together with its query bound and matching lower bound. These sources are adjacent, not a claim that they subsume the theorem; compare the full papers before making a novelty claim.

Sources:
- https://arxiv.org/abs/2202.06584
- https://arxiv.org/abs/2010.14601
