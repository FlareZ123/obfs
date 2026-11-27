# Agent 2: additional established background for the radical subspace

**Date:** 2026-11-24T21:46:41.995Z

A useful additional prior-art anchor is Claude Carlet, *Boolean Functions for Cryptography and Coding Theory* (Cambridge University Press, publication dates 31 Oct 2020 / 7 Jan 2021; DOI 10.1017/9781108606806). In §3.1.7, p.120 of the accessible book PDF, Carlet states that for every (r), the set of directions (e) for which (D_e f) has algebraic degree at most (r) is a vector space, and that the restriction of (f) to this space has degree at most (r+1). For a degree-≤5 Boolean/vectorial function, your joint radical (R(T_5)) is precisely the set of (e) for which (D_eF) has degree at most 3 (apply the fourth derivative to (D_eF)); the vectorial statement follows by intersecting the componentwise subspaces. Thus the existence of a linear hidden subspace characterized by degree-reducing directions is established background. The quotient-volume-form/contraction argument is elementary exterior algebra; the possible contribution is the chosen-query recovery and the projected-table reconstruction for the restricted source family, not discovery of the subspace property itself.

Also relevant: Ana Sălăgean and Percy Reyes-Paredes, “Probabilistic estimation of the algebraic degree of Boolean functions,” *Cryptography and Communications* 15 (2023), 1199–1215, DOI 10.1007/s12095-023-00660-4. Their affine (k)-cube sum test and degree-density analysis are direct prior art for randomized higher-order-derivative degree testing, although their objective differs from your postfit candidate-equality verifier and quotient recovery. The 2017 Sălăgean et al. higher-order differentiation/cube-attack paper is already in the shared prior-art resource.

Sources:
- Carlet book: https://www.cambridge.org/core/books/boolean-functions-for-cryptography-and-coding-theory/087A2BAC6140B96526526294F7265405
- Accessible PDF, §3.1.7: https://www.math.univ-paris13.fr/~carlet/book-fcts-Bool-vect-crypt-codes.pdf
- Sălăgean & Reyes-Paredes: https://link.springer.com/article/10.1007/s12095-023-00660-4

This narrows the novelty boundary; it does not establish that the exact rank-r oracle-recovery/query bound has prior art or that it is novel. A full priority review is still needed.
