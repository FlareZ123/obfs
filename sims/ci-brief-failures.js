'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

/**
 * Execute the full Node suite and print only failing TAP diagnostics.
 * This script keeps GitHub Actions logs small while preserving the exact
 * subprocess exit status and unaffected test counts.
 * @returns {void}
 */
function main() {
  const dir=path.join(__dirname,'..','test');
  const files=fs.readdirSync(dir).filter(name=>name.endsWith('.test.js'))
    .map(name=>path.join(dir,name));
  const proc=spawnSync(process.execPath,['--test','--test-reporter=tap',...files],{
    encoding:'utf8',maxBuffer:128*1024*1024,timeout:12*60*1000
  });
  const lines=(proc.stdout??'').split(/\r?\n/u);
  /** @type {string[][]} */
  const failures=[];
  for(let i=0;i<lines.length;i++){
    if(!/^not ok \d+ - /u.test(lines[i]))continue;
    let j=i+1;
    while(j<lines.length && !/^\s*\.\.\.\s*$/u.test(lines[j]) &&
      !/^not ok \d+ - /u.test(lines[j])&& j-i<90)j++;
    failures.push(lines.slice(i,Math.min(j+1,lines.length)));
  }
  console.log('Full-suite differential files:',files.length);
  for(const failure of failures)console.log(failure.join('\n'));
  console.log(lines.filter(line=>/^# (tests|pass|fail|skipped|duration_ms)\b/u.test(line))
    .join('\n'));
  if(proc.error)console.error(proc.error);
  if(proc.stderr)console.error(proc.stderr.slice(-3000));
  process.exitCode=proc.status===0?0:1;
}
main();
