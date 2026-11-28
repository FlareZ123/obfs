'use strict';
// Native-only inventory; exact generator and fixture construction copied from
// test/differential.test.js at aa54147277fb98b244de25c4dd532cad294102ad (blob 65c66105b0ab041c7b0136ca6e022eb39d1ee628).
// Run: node agents/agent8/native-differential-oracle-inventory-20261127.cjs
// No compiler outputs are generated or measured. This diagnoses observation coverage only.
const vm=require('node:vm');
const assert=require('node:assert/strict');
const rows=[];
function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}
function fixture(name,value,choice) {
  const key=JSON.stringify(name);
  const owner=`const state={${key}:${value},other:'another-value'};`;
  const get=`state[${key}]`;
  const member=`alias[${key}]`;
  const input=JSON.stringify(name);
  const cases=[
    `const alias=state;module.exports=[${get},${member}];`,
    `function read(p){return p[${key}];}module.exports=read(state);`,
    `function forward(p){return p;}const alias=forward(state);module.exports=${member};`,
    `const k=${input};module.exports=state[k];`,
    `module.exports=Object.keys(state);`,
    `function inspect(p){return arguments[0][${key}];}module.exports=inspect(state);`,
    `const another={${key}:7,other:'other'};function g(p){return p[${key}];}module.exports=g(state)+g(another);`,
    `const alias=state;const clone={...alias};module.exports=[clone[${key}],${member}];`,
    `let alias=state;alias={${key}:7};module.exports=${member};`,
    `const alias=state;delete alias[${key}];module.exports=${key} in state;`,
    `const alias=state;Object.freeze(alias);module.exports=${member};`,
    `const alias=state;module.exports=Reflect.ownKeys(alias);`,
    `function f(p){p[${key}]+=5;return p[${key}];}module.exports=f(state);`,
    `function f(p){return p?.[${key}]??0;}module.exports=f(state);`,
    `const alias=state;module.exports=JSON.stringify(alias);`,
    `const {${key}: x}=state;module.exports=x;`,
    `const alias=state;function f(){return ${member};}module.exports=f();`,
    `const result=${get};module.exports=result;`,
    `const object={${key}:12};module.exports=${get}+object[${key}];`,
    `const alias=state;function f(p){return p[${key}];}module.exports=f(alias);`,
    `const alias=state;function f(p){return p[${key}];}module.exports=f({${key}:5})+f(alias);`,
    `const alias=state;module.exports=Object.getOwnPropertyDescriptor(alias,${key}).value;`,
    `function outer(p){const alias=p;return alias[${key}];}module.exports=outer(state);`,
    `function f(p){return [p[${key}],p.other];}module.exports=f(state);`
  ];
  return owner+cases[choice % cases.length];
}
function classify(value,context) {
  if(Array.isArray(value)) return "array["+Array.from(value,x=>classify(x,context)).join(",")+"]";
  if(value===null)return "null";
  if(typeof value==="number")return Number.isNaN(value)?"NaN":Object.is(value,-0)?"-0":Number.isFinite(value)?"finite number":"infinity";
  if(typeof value==="object")return value===vm.runInContext("Object.prototype",context)?"realm Object.prototype":"other object";
  return typeof value;
}
function record(name,i,key,choice,source) {
  try{
    const context=vm.createContext({module:{exports:null},console});
    vm.runInContext(source,context,{timeout:1000});
    const value=context.module.exports;
    rows.push({name,i,key,choice,kind:classify(value,context),serialized:JSON.stringify(value)});
  }catch(e){rows.push({name,i,key,choice,error:e.name,message:e.message});}
}
{
  const next=generator(0x4b5c6d7e);
  const keys=['secret','then','toString','__proto__','constructor','a-b','σ','hello'];
  for(let i=0;i<1200;i++){
    const key=keys[next()%keys.length];
    const value=next()%1000;
    const choice=next()%24;
    const source=fixture(key,value,choice);

    record('state',i,key,choice,source);
  }
}
{
  const next=generator(0x9e3779b9);
  const keys=['secret','σ','long-key','toString','constructor','then','__proto__','s'];
  for(let i=0;i<800;i++) {
    const key=keys[next()%keys.length];
    const quote=JSON.stringify(key);
    const value=next()%1000;
    const mode=next()%9;
    const common=`const state={${quote}:${value}};`;
    const variants=[
      `const {${quote}:v}=state;module.exports=v;`,
      `function read(p){const {${quote}:v}=p;return v;}module.exports=read(state);`,
      `const copy=state;const {${quote}:v}=copy;module.exports=v;`,
      `function read(p){const alias=p;const {${quote}:v}=alias;return v;}module.exports=read(state);`,
      `const {${quote}:v}=state;module.exports=[v,state[${quote}]];`,
      `const {[${quote}]:v}=state;module.exports=v;`,
      `const {...rest}=state;module.exports=rest[${quote}];`,
      `const {${quote}:v=17}=state;module.exports=v;`,
      `const {${quote}:v}=state;module.exports=[v,${quote} in state];`
    ];
    const source=common+variants[mode];

    record('pattern',i,key,mode,source);
  }
}
function summarize(name) {
  const r=rows.filter(x=>x.name===name),throws=r.filter(x=>x.error),returns=r.filter(x=>!x.error);
  const count=(list,f)=>Object.fromEntries(Object.entries(list.reduce((a,v)=>{const k=f(v);a[k]=(a[k]||0)+1;return a;},Object.create(null))).sort((a,b)=>b[1]-a[1]));
  return {name,generated:r.length,nativeThrows:throws.length,nativeReturns:returns.length,throws:count(throws,x=>x.key+"/"+x.choice+"/"+x.error),kinds:count(returns,x=>x.kind),lossyPrototypeCases:returns.filter(x=>x.kind.includes("realm Object.prototype")).length};
}
assert.equal(rows.length,2000);
const state=summarize('state'),pattern=summarize('pattern');
console.log(JSON.stringify({node:process.version,state,pattern,exceptions:rows.filter(x=>x.error)},null,2));
