import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;

public class DecompileAllFunctions extends GhidraScript {
    @Override
    protected void run() throws Exception {
        DecompInterface decompiler = new DecompInterface();
        try {
            if (!decompiler.openProgram(currentProgram)) {
                throw new IllegalStateException("Could not initialize decompiler");
            }
            FunctionIterator functions =
                currentProgram.getFunctionManager().getFunctions(true);
            int count = 0;
            while (functions.hasNext()) {
                Function function = functions.next();
                DecompileResults result =
                    decompiler.decompileFunction(function, 30, monitor);
                if (!result.decompileCompleted() ||
                    result.getDecompiledFunction() == null) {
                    println("DECOMPILE_ERROR " + function.getEntryPoint() + " " +
                        result.getErrorMessage());
                    continue;
                }
                println("DECOMPILE_FUNCTION " + function.getEntryPoint() + " " +
                    function.getName());
                println(result.getDecompiledFunction().getC());
                count++;
            }
            println("DECOMPILE_COUNT " + count);
        } finally {
            decompiler.dispose();
        }
    }
}
