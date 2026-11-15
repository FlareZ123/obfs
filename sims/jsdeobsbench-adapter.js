'use strict';

const fs=require('node:fs');
const readline=require('node:readline');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * @typedef {'coo'|'sno'} PublicBenchmarkMode
 * @typedef {{filename:string,original:string,test_cases:unknown[],[key:string]:unknown}} BenchmarkItem
 * @typedef {{mode:PublicBenchmarkMode,seed:string,strings?:boolean,max:number,sourceType?:'script'|'commonjs'}} BenchmarkOptions
 */

/**
 * Parse explicit benchmark options, rejecting ambiguous positional arguments.
 * SCO is excluded: private remote functions and authorization are not
 * representable by the public-source-only JsDeObsBench evaluation schema.
 * @param {string[]} argv
 * @returns {{input:string,output:string,options:BenchmarkOptions}}
 */
function parseArgs(argv) {
  /** @type {Record<string,string>} */
  const values={};
  for(let index=0;index<argv.length;index+=2) {
    const key=argv[index];
    const value=argv[index+1];
    if(!['--input','--output','--mode','--seed','--strings','--max','--source-type'].includes(key) ||
        value===undefined || Object.hasOwn(values,key)) {
      throw new TypeError('Expected unique --input, --output, --mode, --seed, --strings, --max, --source-type pairs');
    }
    values[key]=value;
  }
  const mode=values['--mode']??'coo';
  if(mode!=='coo'&&mode!=='sno')throw new TypeError('Only public COO and SNO source can use this benchmark');
  if(!values['--input']||!values['--output'])throw new TypeError('Required: --input JSONL --output JSONL');
  const strings=values['--strings']??'default';
  if(!['on','off','default'].includes(strings))throw new TypeError('--strings must be on, off or default');
  const sourceType=values['--source-type']??'script';
  if(sourceType!=='script'&&sourceType!=='commonjs')throw new TypeError('--source-type must be script or commonjs');
  const max=Number(values['--max']??0);
  if(!Number.isSafeInteger(max)||max<0)throw new TypeError('--max must be a nonnegative safe integer');
  /** @type {BenchmarkOptions} */
  const options={mode,seed:values['--seed']??'obfs-jsdeobsbench-v1',max,sourceType};
  if(strings!=='default')options.strings=strings==='on';
  return {input:values['--input'],output:values['--output'],options};
}

/**
 * Convert one pre-verified original program into a standalone, reproducibly
 * seeded obfuscated program. The original test cases and output format of
 * JsDeObsBench are retained for its independent Docker execution evaluator.
 * @param {unknown} source
 * @param {BenchmarkOptions} options
 * @param {number} index
 * @returns {BenchmarkItem}
 */
function convertItem(source,options,index) {
  if(!source||typeof source!=='object')throw new TypeError('Invalid benchmark JSONL row');
  const row=/** @type {Record<string,unknown>} */ (source);
  if(typeof row.filename!=='string'||!row.filename||
      typeof row.original!=='string'||!Array.isArray(row.test_cases)) {
    throw new TypeError('Benchmark row requires filename, original and test_cases');
  }
  const uniqueSeed=createHash('sha256')
    .update(options.seed).update('\0')
    .update(String(index)).update('\0')
    .update(row.filename).digest('hex');
  const result=obfuscateFiles(
    [{path:'benchmark.js',code:row.original,sourceType:options.sourceType??'script'}],
    {mode:options.mode,seed:uniqueSeed,strings:options.strings}
  );
  const transformed=result.files[0];
  if(!transformed||typeof transformed.code!=='string')throw new Error('Missing obfuscated source');
  return /** @type {BenchmarkItem} */ ({
    ...row,
    filename:row.filename,
    original:row.original,
    test_cases:row.test_cases,
    obfuscated:transformed.code,
    obfs_mode:options.mode,
    obfs_source_type:options.sourceType??'script',
    obfs_source_sha256:createHash('sha256').update(row.original).digest('hex'),
    obfs_output_sha256:createHash('sha256').update(transformed.code).digest('hex'),
    obfs_metrics:transformed.metrics
  });
}

/**
 * Produce a deterministic, atomic JSONL dataset from a JsDeObsBench fixture.
 * There is no implicit execution of third-party source during conversion.
 * Execution equivalence must subsequently be validated by the upstream
 * Docker-based evaluator; parser success alone proves no semantic equality.
 * @param {string} input
 * @param {string} output
 * @param {BenchmarkOptions} options
 * @returns {Promise<number>}
 */
async function generate(input,output,options) {
  const inputPath=path.resolve(input);
  const outputPath=path.resolve(output);
  if(inputPath===outputPath)throw new TypeError('Input and output must differ');
  const stream=fs.createReadStream(inputPath,{encoding:'utf8'});
  const lines=readline.createInterface({input:stream,crlfDelay:Infinity});
  /** @type {string[]} */
  const outputLines=[];
  let count=0;
  try {
    for await(const line of lines) {
      if(!line.trim())continue;
      const parsed=JSON.parse(line);
      const converted=convertItem(parsed,options,count);
      outputLines.push(JSON.stringify(converted));
      count++;
      if(options.max&&count>=options.max)break;
    }
  } finally {
    lines.close();
    stream.destroy();
  }
  if(!count)throw new Error('No benchmark rows supplied');
  await atomicWrite(outputPath,outputLines.join('\n')+'\n');
  return count;
}

if(require.main===module) {
  const {input,output,options}=parseArgs(process.argv.slice(2));
  generate(input,output,options).then(count=>{
    process.stdout.write('Generated '+count+' source-verifiable '+options.mode+' benchmark rows\n');
  }).catch(error=>{
    process.stderr.write(String(error?.stack??error)+'\n');
    process.exitCode=1;
  });
}

module.exports={parseArgs,convertItem,generate};
