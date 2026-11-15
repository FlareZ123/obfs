'use strict';

const {binaryWords,searchSynchronizingWord}=require('./sco-sync-search');

/** @typedef {{next:number[][],output:number[][]}} Machine */

/**
 * Deterministic random four-state Mealy model. There is no guarantee that
 * symbol 1 cycles or that any short synchronizing word exists.
 * @param {number} seed
 * @returns {Machine}
 */
function makeGeneralMachine(seed) {
  let value=seed>>>0;
  /** @returns {number} */
  function random() {
    value=(Math.imul(value,1664525)+1013904223)>>>0;
    return value>>>16;
  }
  return {
    next:Array.from({length:4},()=>[random()%4,random()%4]),
    output:Array.from({length:4},()=>[random()%2,random()%2])
  };
}

/**
 * Truth predicate for a fixture model, deliberately withheld from search.
 * @param {Machine} machine
 * @param {number[]} word
 * @returns {boolean}
 */
function actuallySynchronizes(machine,word) {
  const terminals=[];
  for(let state=0;state<4;state++){
    terminals.push(word.reduce((current,bit)=>machine.next[current][bit],state));
  }
  return new Set(terminals).size===1;
}

/**
 * Falsification control for the finite-suffix observation heuristic. This
 * run has *full access to the private model only after the attacker returns*
 * for validation, never as a search input.
 *
 * @param {number} [count]
 * @returns {Promise<{count:number,candidates:number,genuine:number,
 *   falsePositive:number,modelsWithShortSync:number,missed:number,
 *   examples:{index:number,proposed:number[],actual:number[][]}[]}>}
 */
async function runFalsification(count=250) {
  if(!Number.isSafeInteger(count)||count<1||count>1000)throw new RangeError('count 1..1000');
  const words=binaryWords(3);
  let candidates=0,genuine=0,falsePositive=0,modelsWithShortSync=0,missed=0;
  /** @type {{index:number,proposed:number[],actual:number[][]}[]} */
  const examples=[];
  for(let index=0;index<count;index++){
    const model=makeGeneralMachine((0x9ab337e1+Math.imul(index,7919))>>>0);
    let state=0;
    const api={
      /** @param {number} symbol @returns {Promise<number>} */
      async step(symbol){
        const previous=state;
        state=model.next[previous][symbol];
        return model.output[previous][symbol];
      }
    };
    const found=await searchSynchronizingWord(api,3,6);
    const actual=words.filter(word=>actuallySynchronizes(model,word));
    if(actual.length)modelsWithShortSync++;
    if(found.word){
      candidates++;
      if(actuallySynchronizes(model,found.word))genuine++;
      else{
        falsePositive++;
        if(examples.length<8)examples.push({index,proposed:found.word,actual:actual.slice(0,3)});
      }
    }else if(actual.length)missed++;
  }
  return {count,candidates,genuine,falsePositive,modelsWithShortSync,missed,examples};
}

if(require.main===module){
  runFalsification().then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={makeGeneralMachine,actuallySynchronizes,runFalsification};
