'use strict';

const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');

/**
 * Syntax-only mapping: the emitted decoder uses no mutable string methods.
 * @param {string} value
 * @returns {{prelude:string,reference:string}}
 */
function dictionary(value){
  const symbols='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const chars=[...new Set(value.split(''))].sort();
  let width=1;
  while(symbols.length**width<chars.length)width++;
  /** @type {Record<string,string>} */
  const mapping={};
  /** @type {Map<string,string>} */
  const codes=new Map();
  chars.forEach((ch,index)=>{
    let token='';
    for(let j=0;j<width;j++){
      token=symbols[index%symbols.length]+token;
      index=Math.floor(index/symbols.length);
    }
    mapping[token]=ch;
    codes.set(ch,token);
  });
  let raw='';
  for(let i=0;i<value.length;i++)raw+=codes.get(value[i]);
  const key=Array.from({length:width},(_,i)=>`raw[j+${i}]`).join('+');
  return {
    prelude:`const table=${JSON.stringify(mapping)},raw=${JSON.stringify(raw)};`+
      `let output='';for(let j=0;j<raw.length;j+=${width})output+=table[${key}];`+
      `const _private=[output];`,
    reference:'_private[0]'
  };
}

/**
 * Test a three-file CJS graph under earlier user-code monkeypatching.
 * Temporary files are exclusively created and published via atomic rename.
 * @param {string} code
 * @returns {{times:number[],medianMs:number,sum:number}}
 */
function runGraph(code){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-dictionary-graph-'));
  try{
    /** @param {string} relative @param {string} source */
    function write(relative,source){
      const destination=path.join(root,relative);
      const temporary=destination+'.atomic';
      fs.writeFileSync(temporary,source,{flag:'wx'});
      fs.renameSync(temporary,destination);
    }
    write('mutator.cjs',
      `String.fromCharCode=()=>'?';String.prototype.charCodeAt=()=>0;`);
    write('target.cjs',code);
    write('entry.cjs',
      `require('./mutator.cjs');const use=require('./target.cjs');`+
      `let sum=0;for(let w=0;w<5;w++)for(let i=0;i<20000;i++)sum+=use(i);`+
      `const times=[];for(let t=0;t<9;t++){`+
      `const start=process.hrtime.bigint();let check=0;`+
      `for(let i=0;i<2000000;i++)check+=use(i);`+
      `const duration=Number(process.hrtime.bigint()-start)/1e6;`+
      `if(!Number.isFinite(duration)||duration<=0)throw Error('invalid duration');`+
      `times.push(duration);sum+=check;}`+
      `times.sort((a,b)=>a-b);`+
      `process.stdout.write(JSON.stringify({times,medianMs:times[4],sum}));`);
    const child=spawnSync(process.execPath,[path.join(root,'entry.cjs')],{
      encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1024*1024
    });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return JSON.parse(child.stdout);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
}

/** @returns {void} */
function main(){
  const data=('abcdefghijklmnopqrstuvwxyz0123456789ABCD')
    .repeat(52).slice(0,2048);
  const {prelude,reference}=dictionary(data);
  const source=`const data=${JSON.stringify(data)};`+
    `module.exports=function use(i){return data[i%data.length]==='z'?1:0;};`;
  const direct=prelude+
    `module.exports=function use(i){return ${reference}[i%${reference}.length]==='z'?1:0;};`;
  const alias=prelude+`const data=${reference};`+
    `module.exports=function use(i){return data[i%data.length]==='z'?1:0;};`;
  const variants={native:source,direct,alias};
  const orders=[
    ['native','direct','alias'],
    ['alias','native','direct'],
    ['direct','alias','native']
  ];
  /** @type {Array<{nativeMs:number,directMs:number,aliasMs:number,directRatio:number,aliasRatio:number}>} */
  const pairs=[];
  for(let trial=0;trial<9;trial++){
    /** @type {Map<string,number>} */
    const times=new Map();
    /** @type {number|undefined} */
    let checksum;
    for(const name of orders[trial%orders.length]){
      const output=runGraph(variants[/** @type {'native'|'direct'|'alias'} */ (name)]);
      if(checksum!==undefined)assert.equal(output.sum,checksum);
      checksum=output.sum;
      times.set(name,output.medianMs);
    }
    const nativeMs=times.get('native');
    const directMs=times.get('direct');
    const aliasMs=times.get('alias');
    assert.ok(nativeMs!==undefined&&directMs!==undefined&&aliasMs!==undefined);
    pairs.push({
      nativeMs,directMs,aliasMs,
      directRatio:directMs/nativeMs,
      aliasRatio:aliasMs/nativeMs
    });
  }
  const directRatios=pairs.map(p=>p.directRatio).sort((a,b)=>a-b);
  const aliasRatios=pairs.map(p=>p.aliasRatio).sort((a,b)=>a-b);
  console.log(JSON.stringify({
    node:process.version,environment:process.platform,utf16Units:data.length,
    sourceBytes:Buffer.byteLength(source),
    directBytes:Buffer.byteLength(direct),
    aliasBytes:Buffer.byteLength(alias),
    pairs,
    medianDirectRatio:directRatios[4],
    medianAliasRatio:aliasRatios[4],
    strictDirectBreaches:pairs.filter(p=>p.directRatio>2.5).length,
    strictAliasBreaches:pairs.filter(p=>p.aliasRatio>2.5).length,
    caveat:'One three-file SNO-like source graph. Initialization excluded from timed loop; '+
      'each trial is a separate Node process. No compiler integration, browser, '+
      'source secrecy, representative application or universal 2.5x proof.'
  }));
}

if(require.main===module)main();
module.exports={dictionary,runGraph,main};
