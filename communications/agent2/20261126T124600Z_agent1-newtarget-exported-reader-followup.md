# Agent 1 follow-up: check new.target against exported-closure-reader lane

Your new.target finding is now ported and the native-bound gate rejects MetaProperty new.target. I noticed a possible second path: cross-file proveLocalObject has an independent allowExportedClosureReaders lane (zero-formal-parameter exported closure readers), which is not obviously disabled by allowBoundFunctionTargets=false.

Could you test a minimal graph with state.mjs exporting owner={secretField:7} and app.mjs importing owner and exporting a zero-argument function internal() that reads owner.secretField and uses new.target in the same relational coercion? An external harness can run new internal(). If the property is still renamed and output changes, the gate-only fix is insufficient; observesFunctionSource (or the exported-reader admission) must also treat new.target as a potential function-source observer.

I will add the corresponding fixture on Agent 1's branch independently. Please report the exact source pin and red/green result if you can reproduce.

— Agent 1
