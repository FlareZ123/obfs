'use strict';

const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {pathToFileURL}=require('node:url');
const {buildSample}=require('../examples/coo-piggyback/build.cjs');

/** @param {number[]} values @returns {number} */
function median(values){const s=[...values].sort((a,b)=>a-b);return (s[(s.length-1)>>1]+s[s.length>>1])/2;}
/** @param {number} n @param {()=>string} fn @returns {number} */
function hot(n,fn){let checksum=0;const start=performance.now();for(let i=0;i<n;i++){
  const value=fn();checksum+=value.charCodeAt(i%value.length);
}const elapsed=performance.now()-start;if(checksum===0)throw new Error('Invalid checksum');return elapsed;}

/** @param {number} [copies] @returns {Promise<void>} */
async function profile(copies=48){
  const root=path.resolve(__dirname,'../examples/coo-piggyback');
  const result=buildSample(true);
  const original=[
    {path:'app.mjs',code:fs.readFileSync(path.join(root,'before/app.mjs'),'utf8')},
    {path:'constants.mjs',code:fs.readFileSync(path.join(root,'before/constants.mjs'),'utf8')}
  ];
  const changed=result.files;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-profile-'));
  try{
    /** @type {{native:string,obfs:string}[]} */
    const paths=[];
    for(let i=0;i<copies;i++){
      const row={native:path.join(dir,'native'+i),obfs:path.join(dir,'obfs'+i)};
      /** @type {[string,{path:string,code:string}[]][]} */
      const variants=[[row.native,original],[row.obfs,changed]];
      for(const [destination,files] of variants){
        fs.mkdirSync(/** @type {string} */(destination));
        for(const file of files)fs.writeFileSync(path.join(/** @type {string} */(destination),file.path),file.code);
      }
      paths.push(row);
    }
    /** @type {number[]} */
    const native=[];
    /** @type {number[]} */
    const obfs=[];
    for(let i=0;i<copies;i++){
      for(const mode of (i%2?['obfs','native']:['native','obfs'])){
        const start=performance.now();
        const entry=pathToFileURL(path.join(paths[i][/** @type {'native'|'obfs'} */(mode)],'app.mjs')).href;
        const mod=await import(entry);
        if(mod.message().length===0)throw new Error('No string');
        (mode==='native'?native:obfs).push(performance.now()-start);
      }
    }
    const a=await import(pathToFileURL(path.join(paths[0].native,'app.mjs')).href);
    const b=await import(pathToFileURL(path.join(paths[0].obfs,'app.mjs')).href);
    for(let i=0;i<8;i++){hot(20000,a.message);hot(20000,b.message);}
    /** @type {number[]} */
    const nativeHot=[];
    /** @type {number[]} */
    const obfsHot=[];
    for(let i=0;i<24;i++){
      for(const mode of (i%2?['obfs','native']:['native','obfs'])){
        const fn=mode==='native'?a.message:b.message;
        (mode==='native'?nativeHot:obfsHot).push(hot(125000,fn));
      }
    }
    console.log(JSON.stringify({node:process.version,copies,cold:{nativeMs:median(native),obfsMs:median(obfs),ratio:median(obfs)/median(native)},hot:{nativeMs:median(nativeHot),obfsMs:median(obfsHot),ratio:median(obfsHot)/median(nativeHot)},sourceBytes:{original:original.reduce((n,x)=>n+Buffer.byteLength(x.code),0),obfs:changed.reduce((n,x)=>n+Buffer.byteLength(x.code),0)}},null,2));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}

if(require.main===module)profile().catch(err=>{console.error(err);process.exitCode=1;});
module.exports={profile};
