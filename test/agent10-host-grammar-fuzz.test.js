'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,code:string,sourceType:'module'}} Input */
/** @param {string} expression @returns {Input[]} */
function graphFor(expression){
  return [
    {path:'owner.mjs',sourceType:'module',code:'export const owner={secretField:7};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {owner} from "./owner.mjs";',
      'const nativeNumber=('+expression+');',
      'const observed=await nativeNumber.toLocaleString("en-US");',
      'console.log(JSON.stringify({field:owner.secretField,observed}));'
    ].join('\n')}
  ];
}
/** @param {ReadonlyArray<{path:string,code:string|Buffer}>} files @returns {Promise<string>} */
async function hostExecute(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-boxed-host-fuzz-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    await atomicWrite(path.join(root,'host.cjs'),[
      'const {pathToFileURL}=require("node:url");',
      'const path=require("node:path");',
      'const target=pathToFileURL(path.join(process.cwd(),"owner.mjs")).href;',
      'Object.defineProperty(Number.prototype,"toLocaleString",{configurable:true,',
      'value:function(){return import(target).then(remote=>Object.keys(remote.owner));}});'
    ].join('\n'));
    const p=spawnSync(process.execPath,['-r',path.join(root,'host.cjs'),
      path.join(root,'main.mjs')],{cwd:root,encoding:'utf8',timeout:15000});
    assert.equal(p.status,0,p.stderr||String(p.error));
    return p.stdout;
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}
/** @returns {string[]} */
function generateExpressions(){
  const atoms=[
    '7','(5+2)','(7-0)','(7*1)','(7/1)','(7**1)',
    '(7|0)','(7&7)','(7^0)','(7<<0)','(7>>0)','(7>>>0)',
    '([7][0])','([1,2,3,4,5,6,7].length)',
    '({n:7}).n','Math.max(3,7)','Number("7")','parseInt("7",10)',
    'JSON.parse("7")','(await Promise.resolve(7))','(()=>7)()',
    '(function(){return 7;})()','(new Number(7)).valueOf()',
    '(true?7:0)','(0||7)','(null??7)','(+7)','(7,7)'
  ];
  /** @type {string[]} */
  const out=[...atoms];
  let seed=0x317a1b5e;
  /** @returns {number} */
  function draw(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;}
  for(let i=0;i<96;i++){
    let expression=atoms[draw()%atoms.length];
    const depth=1+(draw()%3);
    for(let j=0;j<depth;j++){
      switch(draw()%6){
        case 0:expression='(('+expression+')+0)';break;
        case 1:expression='(['+expression+'][0])';break;
        case 2:expression='(true?('+expression+'):7)';break;
        case 3:expression='((void 0),('+expression+'))';break;
        case 4:expression='(('+expression+')|0)';break;
        default:expression='(('+expression+')*1)';
      }
    }
    out.push(expression);
  }
  return out;
}

test('deterministic grammar: no proven numeric receiver leaks renamed closed ESM owner through hostile native method',
  {timeout:180000},async()=>{
    const expressions=generateExpressions();
    /** @type {{expression:string,mode:string,renames:number,native?:string,emitted?:string}[]} */
    const leaks=[];
    const started=performance.now();
    let checked=0;
    let safe=0;
    for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])){
      for(let i=0;i<expressions.length;i++){
        const expression=expressions[i];
        const input=graphFor(expression);
        const built=obfuscateFiles(input,{
          mode,seed:'agent10-grammar-'+i+'/'+mode,
          closedWorld:true,properties:true,identifiers:false,strings:false
        });
        const renames=built.crossFile.properties;
        checked++;
        if(!renames){safe++;continue;}
        const sample={expression,mode,renames};
        if(leaks.length<6){
          sample.native=await hostExecute(input);
          sample.emitted=await hostExecute(built.files);
          assert.equal(sample.native,'{"field":7,"observed":["secretField"]}\n');
        }
        leaks.push(sample);
      }
    }
    console.log('AGENT10_BOXED_GRAMMAR '+JSON.stringify({
      grammarSeed:'0x317a1b5e',expressions:expressions.length,
      checked,safe,leaks:leaks.slice(0,8),leakCount:leaks.length,
      compileMs:Math.round(performance.now()-started)
    }));
    assert.equal(leaks.length,0,
      'Any admitted numeric host call can import and observe renamed owner keys');
  });
