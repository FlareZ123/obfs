'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'commonjs',code:string}} CommonJsFile */

/**
 * @param {CommonJsFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(files) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-native-vm-yield-'));
  try{
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const result=spawnSync(process.execPath,[path.join(dir,'entry.cjs')],{
      encoding:'utf8',timeout:10000,windowsHide:true
    });
    if(result.error)throw result.error;
    return {status:result.status,stdout:result.stdout,stderr:result.stderr};
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/** @param {string} side @returns {CommonJsFile[]} */
function graph(side) {
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./side.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'side.cjs',sourceType:'commonjs',code:side},
    {path:'target.cjs',sourceType:'commonjs',
      code:"module.exports='protected-literal-value';"}
  ];
}

const fixtures=[
  ['plain inert','module.exports=17;'],
  ['vm required without use','const vm=require("node:vm");void vm;'],
  ['vm.isContext direct','const vm=require("node:vm");vm.isContext({});'],
  ['vm.isContext detached','const {isContext}=require("node:vm");isContext({});'],
  ['vm.Script property read','const vm=require("node:vm");void vm.Script;'],
  ['vm.createContext isolated','const vm=require("node:vm");vm.createContext({});'],
  ['fs native read-only','const fs=require("node:fs");void fs.constants;'],
  ['vm runInThisContext mutation','const vm=require("node:vm");vm.runInThisContext("String.fromCharCode=()=>\\"?\\";");']
];

test('bounded Node builtin VM and read-only decoder yield matrix',async()=>{
  /** @type {Array<{caseName:string,mode:string,literals:number,parity:boolean}>} */
  const records=[];
  for(const [caseName,side] of fixtures) {
    const input=graph(side);
    const native=await execute(input);
    assert.equal(native.status,0,caseName+' '+native.stderr);
    for(const mode of /** @type {const} */ (['coo','sno'])){
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'vm-readonly-yield/'+caseName+'/'+mode
      });
      const actual=await execute(output.files);
      assert.deepEqual(actual,native,caseName+' '+mode);
      records.push({caseName,mode,
        literals:output.files.find(file=>file.path==='target.cjs')?.metrics.literals??0,
        parity:true});
    }
  }
  console.log('VM_READONLY_YIELD '+JSON.stringify(records));
  assert.ok(records.some(x=>x.caseName==='plain inert'&&x.literals>0),
    'Baseline supplied inert local dependency must keep encoding enabled');
});
