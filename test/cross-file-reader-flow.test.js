'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} Source */

/**
 * Verify a declared ESM graph against the native Node linker.
 * @param {Source[]} files
 * @param {number} expected
 * @param {'coo'|'sno'|'sco'} [mode]
 * @param {string} [expectedOutput]
 * @returns {Promise<void>}
 */
async function preserves(files,expected,mode='coo',expectedOutput) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cross-reader-'));
  try {
    /** @param {Source[]|ReturnType<typeof obfuscateFiles>['files']} sources */
    async function run(sources) {
      for(const file of sources)await atomicWrite(path.join(dir,file.path),file.code);
      const child=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{
        encoding:'utf8',timeout:10000
      });
      assert.equal(child.status,0,child.stderr);
      return child.stdout;
    }
    const baseline=await run(files);
    if(expectedOutput!==undefined)assert.equal(baseline.trim(),expectedOutput);
    const output=obfuscateFiles(files,{
      mode,seed:'cross-file-reader-proof',closedWorld:true,strings:false,identifiers:false
    });
    assert.equal(output.crossFile.properties,expected,
      JSON.stringify(output.files.map(f=>({path:f.path,code:f.code}))));
    assert.equal(await run(output.files),baseline);
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/** @param {string} exporter @param {string} main @param {number} expected @param {'coo'|'sno'|'sco'} [mode] */
async function check(exporter,main,expected,mode='coo') {
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exporter},
    {path:'main.mjs',sourceType:'module',code:main}
  ],expected,mode);
}

const exposed='export const state={secretField:23};';
const reader='export function peek(x){return x.secretField;}';

test('closed-world ESM direct imported reader of own field is renameable',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";console.log(peek(state));',1);
});

test('closed-world ESM imported reader accepts immutable state alias',async()=>{
  await check(exposed+reader,
    'import {state,peek as inspect} from "./state.mjs";const alias=state;console.log(inspect(alias));',1);
});

test('closed-world ESM imported reader is safe across multiple consumers',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'other.mjs',sourceType:'module',code:
      'import {state,peek} from "./state.mjs";export const answer=peek(state);'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state,peek} from "./state.mjs";import {answer} from "./other.mjs";console.log(peek(state),answer);'}
  ],1);
});

test('reader called with another shape refuses cross-file renaming',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";console.log(peek(state),peek({secretField:99}));',0);
});

test('unbound imported reader reference refuses cross-file renaming',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";const fn=peek;console.log(fn(state));',0);
});

test('importer with reader but no state refuses cross-file renaming',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'foreign.mjs',sourceType:'module',code:
      'import {peek} from "./state.mjs";console.log(peek({secretField:99}));'},
    {path:'main.mjs',sourceType:'module',code:
      'import "./foreign.mjs";import {state,peek} from "./state.mjs";console.log(peek(state));'}
  ],0);
});

test('reader with impure body is outside the proof',async()=>{
  await check(exposed+'export function peek(x){Object.keys(x);return x.secretField;}',
    'import {state,peek} from "./state.mjs";console.log(peek(state));',0);
});

test('exporter also invokes reader with another object and must decline',async()=>{
  await check(exposed+reader+'peek({secretField:77});',
    'import {state,peek} from "./state.mjs";console.log(peek(state));',0);
});

test('source introspection of reader prevents body rewriting',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";console.log(peek.toString().includes("secretField"),peek(state));',0);
});

test('reader with a default parameter is outside simple flow proof',async()=>{
  await check(exposed+'export function peek(x=state){return x.secretField;}',
    'import {state,peek} from "./state.mjs";console.log(peek(state));',0);
});

test('computed constant reader key is rewritten without changing the result',async()=>{
  await check(exposed+'export function peek(x){return x["secret"+"Field"];}',
    'import {state,peek} from "./state.mjs";console.log(peek(state));',1);
});

test('multiple pure property readers share one closed-world state',async()=>{
  await check('export const state={secretField:23,otherField:47};'+
    'export function peek(x){return x.secretField;}'+
    'export function other(x){return x["otherField"];}',
    'import {state,peek,other} from "./state.mjs";console.log(peek(state),other(state));',2);
});

test('imported identity return can forward state into a pure reader',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'identity.mjs',sourceType:'module',code:'export const identity=x=>x;'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state,peek} from "./state.mjs";import {identity} from "./identity.mjs";'+
      'const alias=identity(state);console.log(peek(alias));'}
  ],1);
});

test('closed-world imported reader accepts directly forwarded local identity call',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";'+
    'const forward=value=>value;console.log(peek(forward(state)));',1);
});

test('closed-world imported reader accepts directly forwarded imported identity call',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'identity.mjs',sourceType:'module',code:'export const identity=value=>value;'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state,peek} from "./state.mjs";import {identity} from "./identity.mjs";'+
      'console.log(peek(identity(state)));'}
  ],1);
});

test('nested pure identities preserve owner through imported reader',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";'+
    'const first=left=>left;const second=right=>right;'+
    'console.log(peek(second(first(state))));',1);
});

test('foreign object inside forwarded expression refuses imported reader',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";'+
    'const identity=value=>value;'+
    'console.log(peek(identity(state)),peek(identity({secretField:77})));',0);
});

test('opaque forwarding helper refuses nested imported reader',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";'+
    'const leak=value=>{Object.keys(value);return value;};'+
    'console.log(peek(leak(state)));',0);
});

test('direct imported identity return can feed a static object-pattern declaration',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed},
    {path:'identity.mjs',sourceType:'module',code:'export const identity=value=>value;'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";import {identity} from "./identity.mjs";'+
      'const {secretField:read}=identity(state);console.log(read);'}
  ],1);
});

test('immutable computed destructuring key follows a proven imported identity result',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed},
    {path:'identity.mjs',sourceType:'module',code:'export const identity=value=>value;'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";import {identity} from "./identity.mjs";'+
      'const key="secretField";const {[key]:read}=identity(state);console.log(read);'}
  ],1);
});

test('mutable computed destructuring key on imported identity result declines',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed},
    {path:'identity.mjs',sourceType:'module',code:'export const identity=value=>value;'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";import {identity} from "./identity.mjs";'+
      'let key="secretField";const {[key]:read}=identity(state);console.log(read);'}
  ],0);
});

test('returned destructuring assignment owner cannot escape as an expression value',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed},
    {path:'identity.mjs',sourceType:'module',code:'export const identity=value=>value;'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";import {identity} from "./identity.mjs";'+
      'let read=0;const copy=({secretField:read}=identity(state));'+
      'console.log(read,Object.keys(copy));'}
  ],0);
});

test('closed-world imported reader accepts captured zero-arg owner getter',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";'+
    'const get=()=>state;console.log(peek(get()));',1);
});

test('escaped captured owner getter prevents imported reader rewrite',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";'+
    'const get=()=>state;const escaped=get;console.log(peek(get()),escaped===get);',0);
});

test('opaque reader alias via a callback declines property rewrite',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";const apply=fn=>fn(state);console.log(apply(peek));',0);
});

test('reader invoked through Function.apply declines property rewrite',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";console.log(peek.apply(undefined,[state]));',0);
});

test('reader called with another object from an importer declines all renames',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'other.mjs',sourceType:'module',code:
      'import {peek} from "./state.mjs";console.log(peek({secretField:77}));'},
    {path:'main.mjs',sourceType:'module',code:
      'import "./other.mjs";import {state,peek} from "./state.mjs";console.log(peek(state));'}
  ],0);
});

test('two-argument ESM reader can consume the owned state in parameter two',async()=>{
  await check(exposed+'export function peek(label,x){return x.secretField;}',
    'import {state,peek} from "./state.mjs";console.log(peek("tag",state));',1);
});

test('reader with unused second parameter preserves first-argument ownership',async()=>{
  await check(exposed+'export function peek(x,unused){return x.secretField;}',
    'import {state,peek} from "./state.mjs";console.log(peek(state,99));',1);
});

test('two-argument reader refuses a non-owned object passed to the reading parameter',async()=>{
  await check(exposed+'export function peek(label,x){return x.secretField;}',
    'import {state,peek} from "./state.mjs";console.log(peek("tag",{secretField:44}),state.secretField);',0);
});

test('immutable exported arrow reader preserves a property rename',async()=>{
  await check(exposed+'export const peek=x=>x.secretField;',
    'import {state,peek} from "./state.mjs";console.log(peek(state));',1);
});

test('immutable exported arrow reader can consume second parameter',async()=>{
  await check(exposed+'export const peek=(label,x)=>x.secretField;',
    'import {state,peek} from "./state.mjs";console.log(peek("tag",state));',1);
});

test('immutable exported block-body arrow reader preserves computed own key',async()=>{
  await check(exposed+'export const peek=x=>{return x["secretField"];}',
    'import {state,peek} from "./state.mjs";console.log(peek(state));',1);
});

test('immutable exported function-expression reader preserves the field',async()=>{
  await check(exposed+'export const peek=function(x){return x.secretField;};',
    'import {state,peek} from "./state.mjs";console.log(peek(state));',1);
});

test('mutable exported reader cannot establish stable function identity',async()=>{
  await check(exposed+'export let peek=x=>x.secretField;',
    'import {state,peek} from "./state.mjs";console.log(peek(state));',0);
});

test('asynchronous arrow reader remains outside the synchronous proof',async()=>{
  await check(exposed+'export const peek=async x=>x.secretField;',
    'import {state,peek} from "./state.mjs";console.log(await peek(state));',0);
});

test('arrow reader with reflective side effects declines property renaming',async()=>{
  await check(exposed+'export const peek=x=>(Object.keys(x),x.secretField);',
    'import {state,peek} from "./state.mjs";console.log(peek(state));',0);
});

test('arrow reader called with an unrelated shape disables the proof',async()=>{
  await check(exposed+'export const peek=x=>x.secretField;',
    'import {state,peek} from "./state.mjs";console.log(peek(state),peek({secretField:77}));',0);
});


test('named reader re-export preserves cross-file property rewrite',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'relay.mjs',sourceType:'module',code:
      'export {peek as inspect} from "./state.mjs";'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";import {inspect} from "./relay.mjs";'+
      'console.log(inspect(state));'}
  ],1);
});

test('default reader re-export preserves cross-file property rewrite',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'relay.mjs',sourceType:'module',code:
      'export {peek as default} from "./state.mjs";'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";import inspect from "./relay.mjs";'+
      'console.log(inspect(state));'}
  ],1);
});


test('named reader re-export chain preserves cross-file property rewrite',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'relay-a.mjs',sourceType:'module',code:
      'export {peek as inspect} from "./state.mjs";'},
    {path:'relay-b.mjs',sourceType:'module',code:
      'export {inspect as observe} from "./relay-a.mjs";'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";import {observe} from "./relay-b.mjs";'+
      'console.log(observe(state));'}
  ],1);
});

test('named owner re-export still refuses cross-file property rewrite',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'relay.mjs',sourceType:'module',code:
      'export {state as publicState,peek as inspect} from "./state.mjs";'},
    {path:'main.mjs',sourceType:'module',code:
      'import {publicState,inspect} from "./relay.mjs";'+
      'console.log(inspect(publicState),Object.keys(publicState));'}
  ],0);
});

test('export-star relay still refuses cross-file property rewrite',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'relay.mjs',sourceType:'module',code:'export * from "./state.mjs";'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state,peek} from "./relay.mjs";console.log(peek(state),Object.keys(state));'}
  ],0);
});

test('relayed reader called with a foreign owner refuses cross-file property rewrite',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'relay.mjs',sourceType:'module',code:
      'export {peek as inspect} from "./state.mjs";'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";import {inspect} from "./relay.mjs";'+
      'console.log(inspect(state),inspect({secretField:99}));'}
  ],0);
});

test('namespace import of a relayed reader cannot hide a foreign-owner call',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'relay.mjs',sourceType:'module',code:
      'export {peek as inspect} from "./state.mjs";'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";'+
      'import {inspect} from "./relay.mjs";import * as relay from "./relay.mjs";'+
      'console.log(inspect(state),relay.inspect({secretField:99}));'}
  ],0);
});

test('default import of a relayed reader cannot hide a foreign-owner call',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'relay.mjs',sourceType:'module',code:
      'export {peek as inspect,peek as default} from "./state.mjs";'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";'+
      'import hidden,{inspect} from "./relay.mjs";'+
      'console.log(inspect(state),hidden({secretField:99}));'}
  ],0);
});

test('namespace re-export of a reader relay cannot hide a foreign-owner call',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'relay-a.mjs',sourceType:'module',code:
      'export {peek as inspect} from "./state.mjs";'},
    {path:'relay-b.mjs',sourceType:'module',code:
      'export * as readers from "./relay-a.mjs";'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";import {inspect} from "./relay-a.mjs";'+
      'import {readers} from "./relay-b.mjs";'+
      'console.log(inspect(state),readers.inspect({secretField:99}));'}
  ],0);
});


test('relayed reader source observation refuses cross-file property rewrite',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'relay.mjs',sourceType:'module',code:
      'export {peek as inspect} from "./state.mjs";'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";import {inspect} from "./relay.mjs";'+
      'console.log(inspect.toString(),inspect(state));'}
  ],0);
});

test('relayed reader value escape refuses cross-file property rewrite',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'relay.mjs',sourceType:'module',code:
      'export {peek as inspect} from "./state.mjs";'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";import {inspect} from "./relay.mjs";'+
      'const escaped=inspect;console.log(escaped(state));'}
  ],0);
});


test('named identity re-export preserves owner forwarding into imported reader',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'identity.mjs',sourceType:'module',code:'export const identity=value=>value;'},
    {path:'relay.mjs',sourceType:'module',code:
      'export {identity as pass} from "./identity.mjs";'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state,peek} from "./state.mjs";import {pass} from "./relay.mjs";'+
      'console.log(peek(pass(state)));'}
  ],1);
});

test('named identity re-export chain preserves owner forwarding into imported reader',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'identity.mjs',sourceType:'module',code:'export const identity=value=>value;'},
    {path:'relay-a.mjs',sourceType:'module',code:
      'export {identity as pass} from "./identity.mjs";'},
    {path:'relay-b.mjs',sourceType:'module',code:
      'export {pass as carry} from "./relay-a.mjs";'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state,peek} from "./state.mjs";import {carry} from "./relay-b.mjs";'+
      'console.log(peek(carry(state)));'}
  ],1);
});

test('relayed identity function source observation refuses owner rewrite',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'identity.mjs',sourceType:'module',code:'export const identity=value=>value;'},
    {path:'relay.mjs',sourceType:'module',code:
      'export {identity as pass} from "./identity.mjs";'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state,peek} from "./state.mjs";import {pass} from "./relay.mjs";'+
      'console.log(pass.toString(),peek(pass(state)));'}
  ],0);
});

test('relayed identity owner result reflected by opaque consumer refuses rewrite',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed},
    {path:'identity.mjs',sourceType:'module',code:'export const identity=value=>value;'},
    {path:'relay.mjs',sourceType:'module',code:
      'export {identity as pass} from "./identity.mjs";'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";import {pass} from "./relay.mjs";'+
      'console.log(Object.keys(pass(state)));'}
  ],0);
});


test('mainline remains conservative for sibling owners in separate private carrier slots',async()=>{
  await check(exposed+reader,
    'import {state as left,state as right,peek} from "./state.mjs";'+
    'const carrier={first:left,second:right};'+
    'const {first:one,second:two}=carrier;'+
    'const local=value=>value.secretField;'+
    'console.log(peek(one),local(two));',0);
});

test('one local reader can consume sibling aliases of one imported owner in all modes',async()=>{
  const main='import {state as left,state as right} from "./state.mjs";'+
    'const local=value=>value.secretField;'+
    'console.log(local(left),local(right));';
  for(const mode of ['coo','sno','sco'])await check(exposed,main,1,mode);
});

test('separate import declarations still identify one shared ESM root in all modes',async()=>{
  const main='import {state as left} from "./state.mjs";'+
    'import {state as right} from "./state.mjs";'+
    'const local=value=>value.secretField;'+
    'console.log(local(left),local(right));';
  for(const mode of ['coo','sno','sco'])await check(exposed,main,1,mode);
});

test('an imported reader can consume both sibling owner aliases in all modes',async()=>{
  const main='import {state as left,state as right,peek} from "./state.mjs";'+
    'console.log(peek(left),peek(right));';
  for(const mode of ['coo','sno','sco'])await check(exposed+reader,main,1,mode);
});

test('secondary root aliases flow through local aliases and zero-argument return helpers',async()=>{
  const main='import {state as left,state as right} from "./state.mjs";'+
    'const alias=right;const getLeft=()=>left;'+
    'const local=value=>value.secretField;'+
    'console.log(local(alias),local(getLeft()));';
  for(const mode of ['coo','sno','sco'])await check(exposed,main,1,mode);
});

test('secondary root aliases flow through identity-return calls into an imported reader',async()=>{
  const main='import {state as left,state as right,peek} from "./state.mjs";'+
    'const identity=value=>value;'+
    'console.log(peek(identity(left)),peek(identity(right)));';
  for(const mode of ['coo','sno','sco'])await check(exposed+reader,main,1,mode);
});

test('same-spelled parameter bindings keep local identity-return calls conservatively unproved',async()=>{
  const main='import {state as left,state as right} from "./state.mjs";'+
    'const identity=value=>value;const local=value=>value.secretField;'+
    'console.log(local(identity(left)),local(identity(right)));';
  for(const mode of ['coo','sno','sco'])await check(exposed,main,0,mode);
});

test('identity-return calls through a local reader are proven with unique parameter bindings',async()=>{
  const main='import {state as left,state as right} from "./state.mjs";'+
    'const identity=owner=>owner;const local=record=>record.secretField;'+
    'console.log(local(identity(left)),local(identity(right)));';
  for(const mode of ['coo','sno','sco'])await check(exposed,main,1,mode);
});

test('self-imported owner alias preserves TDZ and post-initialization reader behavior',async()=>{
  const state='import {state as self,peek as inspect} from "./state.mjs";'+
    'let early;try{early=self.secretField;}catch(error){early=error.name;}'+
    'export const state={secretField:23};'+
    'export function peek(owner){return owner.secretField;}'+
    'export const result=early+":"+inspect(self);';
  const files=[
    {path:'state.mjs',sourceType:'module',code:state},
    {path:'main.mjs',sourceType:'module',code:
      'import {result} from "./state.mjs";console.log(result);'}
  ];
  for(const mode of ['coo','sno','sco'])await preserves(files,0,mode);
});

test('two-module owner-reader cycle retains native TDZ by refusing property rewrite',async()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',code:
      'import {early} from "./relay.mjs";'+
      'export const state={secretField:23};'+
      'export function peek(owner){return owner.secretField;}'},
    {path:'relay.mjs',sourceType:'module',code:
      'import {state,peek} from "./state.mjs";'+
      'let early;try{early=peek(state);}catch(error){early=error.name;}'+
      'export {early};'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state,peek} from "./state.mjs";import {early} from "./relay.mjs";'+
      'console.log(early,peek(state));'}
  ];
  for(const mode of ['coo','sno','sco'])
    await preserves(files,0,mode,'ReferenceError 23');
});

test('late imported key in a cyclic graph preserves TDZ and is not folded',async()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',code:
      'import {probe,later} from "./relay.mjs";'+
      'export const state={secretField:23};'+
      'export const early=probe(state);'+
      'export const key="secretField";'+
      'export const result=later(state);'},
    {path:'relay.mjs',sourceType:'module',code:
      'import {key} from "./state.mjs";'+
      'export function probe(owner){try{return owner[key];}catch(error){return error.name;}}'+
      'export function later(owner){return owner[key];}'},
    {path:'main.mjs',sourceType:'module',code:
      'import {early,result} from "./state.mjs";console.log(early,result);'}
  ];
  for(const mode of ['coo','sno','sco'])await preserves(files,0,mode);
});

test('source observation of an imported reader vetoes grouped owner roots in all modes',async()=>{
  const main='import {state as left,state as right,peek} from "./state.mjs";'+
    'console.log(peek.toString().includes("secretField"),peek(left),peek(right));';
  for(const mode of ['coo','sno','sco'])await check(exposed+reader,main,0,mode);
});

test('reflection through a sibling owner alias vetoes shared-root renaming in all modes',async()=>{
  const main='import {state as left,state as right} from "./state.mjs";'+
    'const local=value=>value.secretField;'+
    'console.log(local(left),Object.keys(right).length);';
  for(const mode of ['coo','sno','sco'])await check(exposed,main,0,mode);
});

test('same exported name from different modules is not one shared root',async()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:23};'},
    {path:'other.mjs',sourceType:'module',code:'export const state={secretField:47};'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state as left} from "./state.mjs";'+
      'import {state as right} from "./other.mjs";'+
      'const local=value=>value.secretField;'+
      'console.log(local(left),local(right));'}
  ];
  for(const mode of ['coo','sno','sco'])await preserves(files,0,mode);
});

test('re-exporting a sibling owner alias vetoes shared-root renaming in all modes',async()=>{
  const main='import {state as left,state as right} from "./state.mjs";'+
    'const local=value=>value.secretField;'+
    'console.log(local(left));export {right};';
  for(const mode of ['coo','sno','sco'])await check(exposed,main,0,mode);
});

test('an escaped sibling owner alias vetoes shared-root renaming in all modes',async()=>{
  const main='import {state as left,state as right} from "./state.mjs";'+
    'globalThis.escapedOwner=right;'+
    'const local=value=>value.secretField;'+
    'console.log(local(left));';
  for(const mode of ['coo','sno','sco'])await check(exposed,main,0,mode);
});

test('a shadowed sibling import is not grouped with the imported owner',async()=>{
  await check(exposed,
    'import {state as left,state as right} from "./state.mjs";'+
    'const local=value=>value.secretField;'+
    '{const right={secretField:99};console.log(local(left),local(right));}',0);
});

test('query-distinct owner module URL refuses direct-read renaming',async()=>{
  await check(exposed,
    'import {state as left} from "./state.mjs";'+
    'import {state as right} from "./state.mjs?other";'+
    'console.log(left.secretField,right.secretField);',0);
});

test('query-distinct owner module URL refuses imported-reader alias grouping',async()=>{
  await check(exposed+reader,
    'import {state as left,peek} from "./state.mjs";'+
    'import {state as right} from "./state.mjs?other";'+
    'console.log(peek(left),peek(right));',0);
});

test('browser URL dot-segment resolution is not collapsed by POSIX path normalization',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:23};'},
    {path:'a/state.mjs',sourceType:'module',code:'export const state={secretField:42};'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./a//../state.mjs";console.log(state.secretField);'}
  ],0,'coo','42');
});

test('owner re-export cycle preserves self-import TDZ and declines shared-root renaming',async()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',code:
      'import {state as self,peek as inspect} from "./relay.mjs";'+
      'let early;try{early=self.secretField;}catch(error){early=error.name;}'+
      'export const state={secretField:23};'+
      'export function peek(owner){return owner.secretField;}'+
      'export const result=early+" "+inspect(self);'},
    {path:'relay.mjs',sourceType:'module',code:
      'export {state,peek} from "./state.mjs";'},
    {path:'main.mjs',sourceType:'module',code:
      'import {result} from "./state.mjs";console.log(result);'}
  ];
  for(const mode of ['coo','sno','sco'])
    await preserves(files,0,mode,'ReferenceError 23');
});
