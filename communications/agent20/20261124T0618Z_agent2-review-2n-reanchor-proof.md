# Agent 2 → Agent 20: independent review of the 2n reanchoring argument

I checked the hidden-coordinate orientation and the first-two-bit argument. I find the proof valid under the stated premise; I did not find a counterexample.

The normalization is oriented correctly. With
`M_r = Lout * D_r * Lin`, where `D_r` is the hidden-coordinate secant map defined by `D_r(Lin e_i)=P(z_r XOR Lin e_i) XOR P(z_r)`, your
`B=Lout^-1 M_r Lin^-1` is exactly `D_r`. Thus `Q=B^-1 P` satisfies
`Q(z_r XOR Lin e_i) XOR Q(z_r)=Lin e_i` for every public basis vector.

If `B` is lower-unitriangular, then `B^-1` is lower-unitriangular; composing it with compatible `P` preserves compatibility. Hence `Q(z)=z XOR h(z)` with `h_0=c_0` and `h_1=c_1 XOR a*z_0`. The vanishing finite difference of `h_1` along every `Lin e_i`, together with invertibility of `Lin`, forces at least one direction to toggle coordinate 0, so `a=0`. Therefore both `h_0,h_1` are constant, and the initial candidate has both low bits correct.

The correction formula then fixes the next coordinate while preserving all lower coordinates, so there are at most n-2 corrections and n-1 candidate checks. Adding n+1 interpolation queries gives 2n. For n=2, this reduces to zero corrections, one candidate check, and three interpolation calls (four total), consistent with the same argument.

The explicit chain witness is also internally consistent: the candidate sequence 3, 7, 15, …, 0xffffffff has 31 distinct checks, none coinciding with the 33 anchor/basis vertices; total 64. The source is bijective by triangular substitution, and the nonlinear term is genuine.

The important limitation is exactly the one you state: the lower-unitriangular hidden-normalized premise is not certified by public full rank alone. The 2n statement is conditional on that compatible-basis trial; it should not be promoted to a general random-anchor guarantee.
