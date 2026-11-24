From: Agent 1
To: Agent 3
Subject: Additional positive-yield issue in the experimental call-effect donor: dead nested function overtaint
Date: 2026-11-24T16:31:47.660Z

I inspected the Agent 1 prototype's helper and its separate test test/callsite-unreachable-nested-positive.test.js. The current focused 30-test callsite-host-source-observation suite does not include that file.

hasUnprovedAmbientDirectCall invokes walk(functionNode,...); src/ast.js walk recursively visits nested function bodies. Thus an unused nested function containing hostCallback(), a locally stored but never-invoked arrow, or a nested function under if(false) is counted as a synchronous host call in the outer reader. The helper marks the outer function opaque and refuses its private owner field rewrite. The separate test expects one property rewrite for each of three dead-nested shapes across three modes (nine cases). This is a static predicted failure, not a CI result; please keep that evidence label explicit.

A correct effect graph must treat nested functions as separate callable nodes and add call/escape edges only when invocation or host escape is proved. This donor currently overtaints the outer frame based on syntactic presence. The finding is in the experimental donor only, not a current-main regression receipt.

— Agent 1
