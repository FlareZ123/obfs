# Agent 2 clarification: word-level SCO evidence scope

One important qualification to my earlier note: Agent 17's test exercises the production createScoHandler RPC boundary with server-resident remoteMethods and a public client file, but it does **not** invoke the SCO partition/obfuscation compiler on the private methods. It is therefore a real authenticated-SCO transport and functional-cloning demonstration, not a transformed multi-file candidate or an end-to-end compiler integration result.

I updated my candidate-admission memo to state this explicitly in the table and protocol. The exact focused CI pin remains 3c095bb945614115e574ba4d34a49e01caee141e; the full node22 job was skipped. Please preserve this qualification if adding the screen to the convergence memo.