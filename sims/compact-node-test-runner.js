'use strict';

const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const readline=require('node:readline');

// Windows CreateProcess has a ~32 KiB command-line limit. Keep a wide margin
// for the Node executable, Windows quoting, the runner and checkout path.
const MAX_COMMAND_CHARS=12000;
const METRICS=['tests','suites','pass','fail','cancelled','skipped','todo','duration_ms'];

/**
 * Deterministically partition every file into command lines short enough for
 * Windows. This is a limit on the *whole* command, not just file count: some
 * test filenames are far longer than others.
 *
 * @param {string[]} files
 * @param {number} [maxChars]
 * @param {string} [executable]
 * @returns {string[][]}
 */
function partitionTestFiles(files,maxChars=MAX_COMMAND_CHARS,executable=process.execPath) {
  if(!Number.isSafeInteger(maxChars)||maxChars<1)
    throw new RangeError('Invalid maximum test command length');
  const base=executable.length+1+'--test'.length+1+'--test-reporter=tap'.length+1;
  /** @type {string[][]} */
  const batches=[];
  /** @type {string[]} */
  let current=[];
  let used=base;
  for(const name of files) {
    // Account for spaces/quotes added by argument escaping on Windows.
    const cost=2+name.length*2;
    if(base+cost>maxChars)
      throw new RangeError('Test filename exceeds safe command length: '+name);
    if(current.length&&used+cost>maxChars) {
      batches.push(current);
      current=[];
      used=base;
    }
    current.push(name);
    used+=cost;
  }
  if(current.length)batches.push(current);
  return batches;
}

/**
 * @typedef {{fileCount:number,batchCount:number,failedBatches:number,missingSummaryBatches:number,
 *   seenLines:number,status:number,failures:string[][],totals:Record<string,number>}} TestRunResult
 */

/**
 * Run separate TAP subprocesses, accumulating root summaries and red blocks.
 * Each .test.js file already runs in its own Node test process, so splitting
 * the file inventory does not alter the per-file isolation contract.
 *
 * @param {string[]} files
 * @param {{cwd?:string,maxChars?:number,executable?:string}} [options]
 * @returns {Promise<TestRunResult>}
 */
async function runTests(files,options={}) {
  const executable=options.executable||process.execPath;
  const batches=partitionTestFiles(files,options.maxChars??MAX_COMMAND_CHARS,executable);
  if(!batches.length)throw new Error('No Node test files found');
  const totals=Object.fromEntries(METRICS.map(key=>[key,0]));
  /** @type {TestRunResult} */
  const result={fileCount:files.length,batchCount:batches.length,
    failedBatches:0,missingSummaryBatches:0,seenLines:0,status:0,failures:[],totals};
  for(let batchIndex=0;batchIndex<batches.length;batchIndex++) {
    const batch=batches[batchIndex];
    const env={...process.env};
    // A self-test of this runner runs inside node:test; its nested runner is
    // independent and must not inherit Node's internal child-context marker.
    delete env.NODE_TEST_CONTEXT;
    const child=spawn(executable,['--test','--test-reporter=tap',...batch],{
      cwd:options.cwd,stdio:['ignore','pipe','inherit'],windowsHide:true,env
    });
    // Listen for spawn errors immediately. Avoid unhandled 'error' events and
    // keep the remaining batches runnable if a platform rejects one batch.
    /** @type {Promise<{code:number,error:string|null}>} */
    const completed=new Promise(resolve=>{
      let error=null;
      child.once('error',err=>{error=String(err);});
      child.once('close',(code,signal)=>resolve({code:code??1,error}));
    });
    /** @type {string[]|null} */
    let active=null;
    /** @type {Record<string,number>} */
    const observed={};
    const reader=readline.createInterface({
      input:child.stdout||require('node:stream').Readable.from([]),crlfDelay:Infinity
    });
    for await(const line of reader) {
      result.seenLines++;
      if(/^\s*not ok\s+\d+\b/u.test(line)) {
        active=['batch '+(batchIndex+1)+'/'+batches.length+': '+line];
        result.failures.push(active);
        continue;
      }
      if(/^\s*ok\s+\d+\b/u.test(line))active=null;
      if(active&&active.length<65)active.push(line);
      const match=/^#\s+(tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\s+(\d+(?:\.\d+)?)\s*$/u.exec(line);
      if(match)observed[match[1]]=Number(match[2]);
    }
    const {code,error}=await completed;
    if(code!==0||error)result.failedBatches++;
    if(code!==0||error)result.status=1;
    if(error)
      result.failures.push(['batch '+(batchIndex+1)+'/'+batches.length+': '+error]);
    // Do not mistake a zero exit with truncated/no TAP data for a clean run.
    if(observed.tests===undefined||observed.pass===undefined||observed.fail===undefined) {
      result.missingSummaryBatches++;
      result.status=1;
      result.failures.push(['batch '+(batchIndex+1)+'/'+batches.length+': missing root TAP summary']);
    }
    for(const key of METRICS)totals[key]+=(observed[key]??0);
  }
  return result;
}

/** @param {TestRunResult} result @returns {void} */
function printReport(result) {
  const {failures,totals,...diagnostic}=result;
  process.stdout.write('TEST_DIAGNOSTIC '+JSON.stringify({
    ...diagnostic,failedBlocks:failures.length
  })+'\n');
  for(const failure of failures.slice(0,25))
    process.stdout.write(failure.join('\n')+'\n');
  if(failures.length) {
    const index=failures.map(block=>{
      /** @param {string} key @returns {string|null} */
      function field(key) {
        const line=block.find(item=>item.trimStart().startsWith(key+': '));
        return line?line.trim().slice(key.length+2):null;
      }
      return {case:block[0].trim(),location:field('location'),
        error:field('error'),actual:field('actual'),expected:field('expected')};
    });
    process.stdout.write('FAILED_TEST_INDEX '+JSON.stringify(index)+'\n');
  }
  for(const key of METRICS)process.stdout.write('# '+key+' '+totals[key]+'\n');
  if(failures.length>25)
    process.stdout.write('Omitted '+(failures.length-25)+' additional failing test blocks\n');
}

/** @returns {Promise<void>} */
async function main() {
  const files=fs.readdirSync(path.resolve('test'))
    .filter(name=>name.endsWith('.test.js'))
    .sort()
    .map(name=>path.join('test',name));
  const result=await runTests(files);
  printReport(result);
  process.exitCode=result.status;
}

if(require.main===module)
  main().catch(error=>{console.error(error);process.exitCode=1;});

module.exports={main,partitionTestFiles,runTests,printReport};
