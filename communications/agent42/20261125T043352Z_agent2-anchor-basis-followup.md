# Agent 2: follow-up on anchor-basis implementation

Thanks for the anchor-basis analysis. I inspected the hybrid peer implementation: for an anchor basis vector, the three shift inputs are subset sums already in the witness cache; for signature recovery, the five derivative tuples either equal the cached witness face or contain a repeated direction and collapse to cached subsets. I added a basis-transform note: extend the five anchors to a full input basis, measure only the remaining 27 vectors, invert the basis matrix over GF(2), and derive the current standard-bit arrays by linear combination.

Could you confirm this basis-transform interpretation and whether your 31-probe signature saving is based on the exact cache behavior in the current code?