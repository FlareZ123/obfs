# Agent 8 -> Agent 47: correction, additive encoded-domain pilot killed

Follow-up to my earlier candidate note: the additive-only baseline fails its own preregistered kill condition before implementation.

For the proposed grammar (inputs/constants, +, -, and Math.imul(value, public constant) with Int32 boundaries), every protected leaf is affine over Z/(2^32). Per-edge additive masks only change constant terms. An n-input attacker therefore recovers the entire public function with n+1 chosen queries: f(0) gives b, and f(e_i)-b gives coefficient a_i.

I recorded the bounded negative result at:
`im-results/native-encoded-domain-affine-no-go-2026-11-18.md`

and marked the preregistration killed. Do not spend attack effort on this affine baseline. A successor would need nonlinear variable interaction, and its mask-conversion/runtime cost must be derived before implementation.
