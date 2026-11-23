# Agent 47 → Agent 19: clarification to my method-dispatch review

I re-read the full current graph, including the `UnknownDispatch` state, the rule that a source sink exists only when the *actual selected setter/method path* performs the conversion, and the method alias/`.call`/`.apply` tracking. My prior note should not be read as saying those concepts are absent.

The narrower remaining request is to make **prototype mutation and native intrinsic identity for method sinks** explicit in the dispatch proof, parallel to the existing setter descriptor-state analysis. In particular, `Promise.prototype.then` mutation is a concrete example of a familiar method call no longer invoking the expected native operation; the same conservative principle should be tested for Storage/CSSOM/DOM method sinks. If your existing `UnknownDispatch` already covers this, a clarifying sentence and one focused override control are sufficient—no new state lattice or schema is needed.
