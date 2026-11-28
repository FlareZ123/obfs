'use strict';
// This is an independent, bounded abstract-state model, NOT the compiler.
// It exercises two-branch object identity, may-alias joins and later writes.
// Reproduce: node sims/agent48-carrier-origin-model-fuzz.js
const assert=require('node:assert/strict');
let state=0xC0FFEE;
function rand(){state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;}
const other={kind:'other'},weak={kind:'weakmap'},maybe={kind:'maybe'};
let nextOrigin=0;
function container(entries=[],origins=new Set([++nextOrigin]),possibleAliases=false){
  return {kind:'container',properties:new Map(entries),unknown:false,origins,possibleAliases};
}
function mayHaveWeakMap(value,seen=new Set()){
  if(value.kind==='weakmap'||value.kind==='maybe')return true;
  if(value.kind==='container'){
    if(value.unknown||value.possibleAliases)return true;
    if(seen.has(value))return false;
    seen.add(value);
    for(const nested of value.properties.values())
      if(mayHaveWeakMap(nested,seen))return true;
  }
  return false;
}
function merge(left,right,pairs=new Map()){
  if(left.kind==='container'&&right.kind==='container'){
    let byRight=pairs.get(left);
    if(!byRight)pairs.set(left,byRight=new Map());
    if(byRight.has(right))return byRight.get(right);
    const output=container([],new Set([...left.origins,...right.origins]),
      left.possibleAliases||right.possibleAliases);
    byRight.set(right,output);
    for(const [key,value] of left.properties)output.properties.set(key,value);
    for(const [key,value] of right.properties)
      output.properties.set(key,output.properties.has(key)?
        merge(output.properties.get(key),value,pairs):value);
    output.unknown=left.unknown||right.unknown;
    return output;
  }
  if(left.kind==='weakmap'&&right.kind==='weakmap')return weak;
  if(left.kind==='container'||right.kind==='container')return maybe;
  if(left.kind==='other'&&right.kind==='other')return other;
  return mayHaveWeakMap(left)||mayHaveWeakMap(right)?maybe:other;
}
function markPossibleAliases(environment){
  const byOrigin=new Map(),seen=new Set();
  function visit(value){
    if(value.kind!=='container'||seen.has(value))return;
    seen.add(value);
    for(const origin of value.origins){
      const earlier=byOrigin.get(origin);
      if(earlier&&earlier!==value){
        earlier.possibleAliases=true;
        value.possibleAliases=true;
      }else if(!earlier)byOrigin.set(origin,value);
    }
    for(const nested of value.properties.values())visit(nested);
  }
  for(const value of environment.values())visit(value);
}
function join(left,right){
  const result=new Map(),pairs=new Map();
  for(const key of new Set([...left.keys(),...right.keys()]))
    result.set(key,merge(left.get(key)||other,right.get(key)||other,pairs));
  markPossibleAliases(result);
  return result;
}
function readInstance(value){
  if(value.kind==='maybe')return maybe;
  if(value.kind!=='container')return other;
  if(value.possibleAliases)return maybe;
  return value.properties.get('instance')||(value.unknown?maybe:other);
}
const trialCount=200000;
let observedViolations=0;
const examples=[];
for(let i=0;i<trialCount;i++){
  // Three allocation sites can be independently mutated along both paths,
  // while each path may assign a/b to the same site or distinct sites.
  const values=[];
  for(let id=0;id<3;id++)
    values.push([rand()<0.5?other:weak,rand()<0.5?other:weak]);
  const abstract=[],concrete=[];
  for(let predecessor=0;predecessor<2;predecessor++){
    const objects=values.map((pair,id)=>
      container([['instance',pair[predecessor]]],new Set([id+1])));
    const a=Math.floor(rand()*3),b=Math.floor(rand()*3);
    abstract.push(new Map([['a',objects[a]],['b',objects[b]]]));
    concrete.push({a,b,values:values.map(pair=>pair[predecessor])});
  }
  const write=rand()<0.5?other:weak;
  const merged=join(abstract[0],abstract[1]);
  const mergedA=merged.get('a');
  if(mergedA?.kind==='container')mergedA.properties.set('instance',write);
  const observed=readInstance(merged.get('b'));
  const nativePossible=concrete.some(path=>
    path.a===path.b?write===weak:path.values[path.b]===weak);
  if(nativePossible&&!mayHaveWeakMap(observed)){
    observedViolations++;
    if(examples.length<3)examples.push({concrete,write:write.kind,abstract:observed.kind});
  }
}
const receipt={seed:'0xC0FFEE',node:process.version,trialCount,
  observedViolations,examples,scope:'two-path single-property alias-state model only'};
console.log(JSON.stringify(receipt));
assert.equal(observedViolations,0,JSON.stringify(receipt));
