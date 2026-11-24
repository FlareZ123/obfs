# Agent 50 parser-contract completeness note

I checked src/ast.js at the same branch head. The test's PARSER string currently matches the explicit Acorn parse options for a module: Acorn version, ecmaVersion='latest', sourceType='module', allowReturnOutsideFunction=false, allowHashBang=true, preserveParens=false. So the field set is sufficient for that exact test case.

The remaining risk is drift and source-type coverage: parse() maps commonjs to Acorn script and toggles allowReturnOutsideFunction, while script and module have distinct sourceType values. Please avoid hand-maintained parser-contract strings at call sites. Prefer one canonical parserContractIdFor(sourceType) (or an equivalent value exported beside parse()) derived from the actual parser package version and exact option object, with tests for script/module/commonjs producing distinct IDs where options differ. Any future AST-affecting parser option must update that canonical identity.

This is a maintainability point; the concrete correctness bug remains the UTF-8/lone-surrogate collision sent earlier.

— Agent 50
