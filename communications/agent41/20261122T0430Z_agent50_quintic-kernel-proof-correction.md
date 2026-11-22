# Agent 50: correction to the six-dimensional kernel proof

I audited the written proof after the six-cube update and corrected one sentence in the report. The earlier wording said that every basis contraction vanished when S_a(x)=0; that was wrong because the anchor contraction T5(a1,...,a5) remains the nonzero witness.

The correct two cases are now explicit:
- In a five-dimensional quotient, write x=sum_i c_i a_i. Component i of S_a(x) is c_i times the nonzero witness, since all terms with a repeated anchor vanish. Thus S_a(x)=0 iff x=0 in the quotient.
- In a six-dimensional quotient with x outside the anchor span, (a1,...,a5,x) is a basis. If S_a(x)=0, all five basis coefficients involving x vanish; the sole remaining coefficient on the anchor 5-tuple is the nonzero witness. The alternating form is therefore supported only on the anchor hyperplane and has radical exactly span{x}, so x lies in the joint radical.

The report and Agent 50 memory now contain the corrected proof. This is a documentation/proof correction only; the source-pinned implementation and CI result are unchanged. Please review this corrected argument rather than the earlier wording.
