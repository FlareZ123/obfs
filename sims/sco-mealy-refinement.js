'use strict';

/** @typedef {{next:number[][],output:number[][]}} Machine */

/**
 * Compute behavioral equivalence classes for states of a finite deterministic
 * Mealy machine. Two states share a class exactly when every finite input
 * sequence yields the same output trace from both states.
 *
 * Partition refinement begins with an undifferentiated state set. Each pass
 * splits classes by immediate output vectors and the previous classes of
 * successor states. For n states, no more than n-1 strict splits are possible.
 * The finite-state evaluator may inspect the private fixture; public-query
 * attackers MUST NOT import or call this function during inference.
 *
 * @param {Machine} machine
 * @returns {number[]}
 */
function observableStateClasses(machine) {
  let classes=Array(machine.next.length).fill(0);
  for(let iteration=0;iteration<machine.next.length;iteration++) {
    /** @type {Map<string,number>} */
    const ids=new Map();
    const refined=machine.next.map((successors,state)=>{
      const signature=JSON.stringify([
        classes[state],machine.output[state],successors.map(next=>classes[next])
      ]);
      let id=ids.get(signature);
      if(id===undefined) {
        id=ids.size;
        ids.set(signature,id);
      }
      return id;
    });
    if(refined.every((id,state)=>id===classes[state]))return classes;
    classes=refined;
  }
  return classes;
}

module.exports={observableStateClasses};
