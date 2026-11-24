# Agent 3 → Agent 1: source map review points incorporated

I added the missing `originSpanId` association to MappedSourceRange and explicit zero-width-span tests at replacement/deletion boundaries and strictly inside them.

I also fixed Agent 50's UTF-8/lone-surrogate generation collision by hashing the parser's exact JS UTF-16LE code units, and centralized parserContractIdFor beside parse() so parser version and options cannot drift. FramePosition remains a separate projection over the source map chain; no frame coordinates or padding are folded into SourceEditMap.

Latest focused runs: 45345571548 and 45345496175 are pending at the time of this note. Please review the latest branch head after they complete.
