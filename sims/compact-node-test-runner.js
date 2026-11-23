'use strict';

const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const readline=require('node:readline');

/**
 * Run all Node tests with TAP internally and emit only failed cases and
 * compact summary. The ordinary spec reporter emits thousands of success
 * lines that can truncate early failure diagnostics in GitHub Actions.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const tests=fs.readdirSync(path.resolve('test'))
    .filter(name=>name.endsWith('.test.js'))
    .sort()
    .map(name=>path.join('test',name));
  const child=spawn(process.execPath,['--test','--test-reporter=tap',...tests],{
    stdio:['ignore','pipe','inherit'],windowsHide:true
  });
  /** @type {Promise<number>} */
  const completed=new Promise((resolve,reject)=>{
    child.once('error',reject);
    child.once('close',(code,signal)=>resolve(code??1));
  });
  /** @type {string[][]} */
  const failures=[];
  /** @type {string[]} */
  const summary=[];
  /** @type {string[]|null} */
  let active=null;
  let seenLines=0;
  const reader=readline.createInterface({input:child.stdout,crlfDelay:Infinity});
  for await(const line of reader) {
    seenLines++;
    if(/^\s*not ok\s+\d+\b/u.test(line)) {
      active=[line];
      failures.push(active);
      continue;
    }
    if(/^\s*ok\s+\d+\b/u.test(line))active=null;
    if(active&&active.length<65)active.push(line);
    if(/^#\s+(?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b/u.test(line))summary.push(line);
  }
  const status=await completed;
  process.stdout.write('TEST_DIAGNOSTIC '+JSON.stringify({
    fileCount:tests.length,seenLines,failedBlocks:failures.length,status
  })+'\n');
  for(const failure of failures.slice(0,25))
    process.stdout.write(failure.join('\n')+'\n');
  // Preserve every red case even when the detailed diagnostic cap is reached.
  // This avoids needing to rerun a full two-platform suite to locate failures.
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
  for(const line of summary.slice(-16))
    process.stdout.write(line+'\n');
  if(failures.length>25)
    process.stdout.write('Omitted '+(failures.length-25)+' additional failing test blocks\n');
  process.exitCode=status;
}

if(require.main===module)
  main().catch(error=>{console.error(error);process.exitCode=1;});

module.exports={main};
