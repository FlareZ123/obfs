'use strict';

const fs=require('node:fs');
const readline=require('node:readline');

/**
 * @typedef {{count:number,invalid:number,duplicates:number,linuxStdin:number,
 *   nodeRequire:number,nonAscii:number,possibleSourceObservers:number,
 *   testCases:{min:number,median:number,max:number},
 *   sourceCharacters:{min:number,median:number,p95:number,max:number},
 *   obfuscatedCharacters:{min:number,median:number,p95:number,max:number}}} Audit
 */

/**
 * @param {number[]} values
 * @returns {{min:number,median:number,p95:number,max:number}}
 */
function summarize(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  if(!sorted.length)return {min:0,median:0,p95:0,max:0};
  return {
    min:sorted[0],
    median:sorted[Math.floor(sorted.length/2)],
    p95:sorted[Math.floor(sorted.length*0.95)],
    max:sorted[sorted.length-1]
  };
}

/**
 * Inspect a trusted benchmark's format and portability dependencies without
 * executing any JavaScript from its rows. Counts are lexical indicators and
 * must not be presented as semantic proofs.
 * @param {string} inputFile
 * @returns {Promise<Audit>}
 */
async function auditCorpus(inputFile) {
  const input=fs.createReadStream(inputFile,{encoding:'utf8'});
  const lines=readline.createInterface({input,crlfDelay:Infinity});
  const names=new Set();
  /** @type {number[]} */
  const sources=[];
  /** @type {number[]} */
  const obfuscated=[];
  /** @type {number[]} */
  const testCases=[];
  let invalid=0;
  let duplicates=0;
  let linuxStdin=0;
  let nodeRequire=0;
  let nonAscii=0;
  let possibleSourceObservers=0;
  try {
    for await(const line of lines) {
      if(!line.trim())continue;
      /** @type {{filename?:unknown,original?:unknown,obfuscated?:unknown,test_cases?:unknown}} */
      let row;
      try {row=JSON.parse(line);}
      catch (error) {invalid++;continue;}
      if(!row||typeof row!=='object'||
          typeof row.filename!=='string'||typeof row.original!=='string'||
          !Array.isArray(row.test_cases)) {
        invalid++;
        continue;
      }
      if(names.has(row.filename))duplicates++;
      names.add(row.filename);
      sources.push(row.original.length);
      obfuscated.push(typeof row.obfuscated==='string'?row.obfuscated.length:0);
      testCases.push(row.test_cases.length);
      if(row.original.includes('/dev/stdin'))linuxStdin++;
      if(/\brequire\s*\(/u.test(row.original))nodeRequire++;
      if(/[^\x00-\x7f]/u.test(row.original))nonAscii++;
      if(/\.toString\s*\(|\bFunction\s*\(/u.test(row.original))possibleSourceObservers++;
    }
  } finally {
    lines.close();
    input.destroy();
  }
  const sourceCharacters=summarize(sources);
  const obfuscatedCharacters=summarize(obfuscated);
  const probeCounts=summarize(testCases);
  return {
    count:sources.length,invalid,duplicates,linuxStdin,nodeRequire,
    nonAscii,possibleSourceObservers,
    testCases:{min:probeCounts.min,median:probeCounts.median,max:probeCounts.max},
    sourceCharacters,obfuscatedCharacters
  };
}

if(require.main===module) {
  if(process.argv.length!==3)throw new TypeError('Required: one benchmark JSONL file path');
  auditCorpus(process.argv[2]).then(result=>{
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }).catch(error=>{
    process.stderr.write(String(error?.stack??error)+'\n');
    process.exitCode=1;
  });
}

module.exports={auditCorpus,summarize};
