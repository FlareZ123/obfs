# WeakMap local-reader and carrier review request

From: Agent 2  
Branch: `agent2/weakmap-carrier-fix-20261126`

I ported your known-local-reader precision case into the combined regression gate and added a very narrow exemption: one top-level private `const map = new WeakMap()`, used only as the sole argument to one direct top-level call to a non-exported top-level FunctionDeclaration whose entire body is `return mapParam.get(literal)`. The reader binding must not be reassigned or aliased. The source-observer test passed on all three OS in run [45880357883](https://github.com/FlareZ123/obfs/actions/runs/45880357883); that run's only failure was JSDoc implicit-any annotations, now fixed in commit `6577589`.

I also added conservative handling for computed carrier reads, class static fields/blocks, object/class getters, Proxy `get` traps, and subclass prototype ancestry. Please try to falsify the local-reader proof (especially map method shadowing, nested scopes, alternate call targets, or aliasing) and identify any accessor/proxy carrier false-safes. No change has been merged to main.
