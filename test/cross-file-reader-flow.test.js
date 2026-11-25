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
 * @returns {Promise<void>}
 */
async function preserves(files,expected) {
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
    const output=obfuscateFiles(files,{
      mode:'coo',seed:'cross-file-reader-proof',closedWorld:true,strings:false,identifiers:false
    });
    if(Array.isArray(expected)) {
      assert.ok(expected.includes(output.crossFile.properties),
        `expected one of ${expected.join(', ')}, got ${output.crossFile.properties}: `+
        JSON.stringify(output.files.map(f=>({path:f.path,code:f.code}))));
    } else {
      assert.equal(output.crossFile.properties,expected,
        JSON.stringify(output.files.map(f=>({path:f.path,code:f.code}))));
    }
    assert.equal(await run(output.files),baseline);
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/** @param {string} exporter @param {string} main @param {number|number[]} expected */
async function check(exporter,main,expected) {
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exporter},
    {path:'main.mjs',sourceType:'module',code:main}
  ],expected);
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


test('duplicate ESM import aliases of one owner binding can share an imported reader',async()=>{
  await check(exposed+reader,
    'import {state as left,state as right,peek} from "./state.mjs";'+
    'console.log(peek(left),peek(right));',1);
});

test('separate ESM imports of one owner binding preserve shared reader identity',async()=>{
  await check(exposed+reader,
    'import {state as left,peek} from "./state.mjs";'+
    'import {state as right} from "./state.mjs";'+
    'console.log(peek(left),peek(right));',1);
});

test('one private record can carry the same imported owner to distinct readers',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";'+
    'const carrier={first:state,second:state};'+
    'const left=carrier.first;const right=carrier.second;'+
    'const local=value=>value.secretField;'+
    'console.log(peek(left),local(right));',1);
});

test('one private array can carry the same imported owner at distinct indexes',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";'+
    'const carrier=[state,state,7];'+
    'const left=carrier[0];const right=carrier[1];'+
    'const local=value=>value.secretField;'+
    'console.log(peek(left),local(right));',1);
});

test('duplicate owner import aliases do not admit a foreign reader argument',async()=>{
  await check(exposed+reader,
    'import {state as left,state as right,peek} from "./state.mjs";'+
    'console.log(peek(left),peek(right),peek({secretField:99}));',0);
});


test('private record destructuring can forward one owner to distinct imported and local readers',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";'+
    'const carrier={first:state,second:state};'+
    'const {first:left,second:right}=carrier;'+
    'const local=value=>value.secretField;'+
    'console.log(peek(left),local(right));',1);
});

test('private array destructuring can forward one owner to distinct imported and local readers',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";'+
    'const carrier=[state,state,7];'+
    'const [left,right]=carrier;'+
    'const local=value=>value.secretField;'+
    'console.log(peek(left),local(right));',1);
});

test('private record destructuring refuses owner capture through rest',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";'+
    'const carrier={first:state,second:state};'+
    'const {first:left,...rest}=carrier;'+
    'const local=value=>value.secretField;'+
    'console.log(peek(left),local(rest.second));',0);
});

test('private array destructuring refuses owner capture through rest',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";'+
    'const carrier=[state,state,7];'+
    'const [left,...rest]=carrier;'+
    'const local=value=>value.secretField;'+
    'console.log(peek(left),local(rest[0]));',0);
});




test('distinct ESM module URLs are not merged into one imported owner binding',async()=>{
  await check(exposed+reader,
    'import {state as left,peek} from "./state.mjs";'+
    'import {state as right} from "./state.mjs?other";'+
    'console.log(peek(left),peek(right));',0);
});


test('duplicate imports of one owner export rename direct reads through both aliases',async()=>{
  await check(exposed,
    'import {state as left,state as right} from "./state.mjs";'+
    'console.log(left.secretField,right.secretField);',1);
});

test('a query-distinct owner module URL refuses direct-read renaming',async()=>{
  await check(exposed,
    'import {state as left} from "./state.mjs";'+
    'import {state as right} from "./state.mjs?other";'+
    'console.log(left.secretField,right.secretField);',0);
});


test('sibling imports of one owner can occupy multiple private record slots',async()=>{
  await check(exposed+reader,
    'import {state as left,state as right,peek} from "./state.mjs";'+
    'const carrier={first:left,second:right};'+
    'const {first:one,second:two}=carrier;'+
    'const local=value=>value.secretField;'+
    'console.log(peek(one),local(two));',1);
});

test('one local reader can consume sibling aliases of one imported owner',async()=>{
  await check(exposed,
    'import {state as left,state as right} from "./state.mjs";'+
    'const local=value=>value.secretField;'+
    'console.log(local(left),local(right));',1);
});

test('one escaped sibling owner alias vetoes shared-owner renaming',async()=>{
  await check(exposed+reader,
    'import {state as left,state as right,peek} from "./state.mjs";'+
    'globalThis.escapedOwner=right;'+
    'console.log(peek(left));',0);
});


// Cyclic module identity and initialization-order controls for the joint-root
// proof. The range assertions intentionally allow either a safe rename or a
// conservative refusal; native/emitted output equality is mandatory.


test('self-imported owner and reader aliases are conservatively refused',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:
      'import {state as self,peek as inspect} from "./state.mjs";'+
      'export const state={secretField:23};'+
      'export function peek(x){return x.secretField;}'+
      'export const result=inspect(self)+peek(state);'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state,peek,result} from "./state.mjs";console.log(result,peek(state));'}
  ],0);
});

test('self-import duplicate owner aliases with shared carrier are conservatively refused',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:
      'import {state as first,state as second,peek as inspect} from "./state.mjs";'+
      'export const state={secretField:23};'+
      'export function peek(x){return x.secretField;}'+
      'const carrier={left:first,right:second};'+
      'const local=value=>value.secretField;'+
      'const left=carrier.left;const right=carrier.right;'+
      'export const result=inspect(left)+local(right);'},
    {path:'main.mjs',sourceType:'module',code:
      'import {result} from "./state.mjs";console.log(result);'}
  ],0);
});

test('self-import owner reads preserve pre-initialization TDZ under a positive field rename',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:
      'import {state as self} from "./state.mjs";'+
      'let early=false;'+
      'try{void self.secretField;}catch(error){early=error instanceof ReferenceError;}'+
      'export const state={secretField:23};'+
      'export const result=[early,self.secretField];'},
    {path:'main.mjs',sourceType:'module',code:
      'import {result} from "./state.mjs";console.log(JSON.stringify(result));'}
  ],1);
});

test('two-module reentrant owner cycles are conservatively refused while preserving TDZ',async()=>{
  await preserves([
    {path:'a.mjs',sourceType:'module',code:
      'import {read} from "./b.mjs";'+
      'export let early;'+
      'try{early=read();}catch(error){early=error instanceof ReferenceError?"tdz":"other";}'+
      'export const state={secretField:23};'+
      'export const late=read();'},
    {path:'b.mjs',sourceType:'module',code:
      'import {state} from "./a.mjs";'+
      'export function read(){return state.secretField;}'},
    {path:'main.mjs',sourceType:'module',code:
      'import {early,late} from "./a.mjs";console.log(early,late);'}
  ],0);
});

test('late imported key in a cyclic graph is not folded across its TDZ',async()=>{
  await preserves([
    {path:'a.mjs',sourceType:'module',code:
      'import {read} from "./b.mjs";'+
      'export const state={secretField:23};'+
      'export let early;'+
      'try{early=read();}catch(error){early=error instanceof ReferenceError?"tdz":"other";}'+
      'export const key="secretField";'+
      'export const late=read();'},
    {path:'b.mjs',sourceType:'module',code:
      'import {state,key} from "./a.mjs";'+
      'export function read(){return state[key];}'},
    {path:'main.mjs',sourceType:'module',code:
      'import {early,late} from "./a.mjs";console.log(early,late);'}
  ],0);
});

test('owner re-export cycle refuses joint-root property rewriting',async()=>{
  await preserves([
    {path:'a.mjs',sourceType:'module',code:
      'import {publicState,inspect} from "./relay.mjs";'+
      'export const state={secretField:23};'+
      'export function peek(x){return x.secretField;}'+
      'export const result=inspect(publicState);'},
    {path:'relay.mjs',sourceType:'module',code:
      'export {state as publicState,peek as inspect} from "./a.mjs";'},
    {path:'main.mjs',sourceType:'module',code:
      'import {result} from "./a.mjs";console.log(result);'}
  ],0);
});
