'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {spawnSync}=require('node:child_process');
const path=require('node:path');

/**
 * One source-pinned test job must cover the *combined* exact-data semantic
 * package, not nine individually green tests at nine unrelated source SHAs.
 * Spawn node --test in separate workers so deliberate host intrinsic mutation
 * is contained to each fixture's own child process. Chromium executes on
 * supported Linux CI while the Windows Chromium case skips explicitly.
 *
 * @type {string[]}
 */
const suites=[
  'semantic-data-oracle.test.js',
  'semantic-data-oracle-crossfile.test.js',
  'semantic-data-oracle-completion.test.js',
  'semantic-data-oracle-external-trace.test.js',
  'semantic-abrupt-yield-probe.test.js',
  'semantic-data-oracle-generated-esm.test.js',
  'semantic-data-oracle-primordials.test.js',
  'semantic-data-oracle-serialization.test.js',
  'semantic-data-oracle-browser.test.js'
];

test('integrated exact-data/host/attacker corpus on one real Node source pin',()=>{
  const args=['--test',...suites.map(file=>path.join(__dirname,file))];
  const child=spawnSync(process.execPath,args,{
    cwd:path.resolve(__dirname,'..'),encoding:'utf8',
    env:{...process.env},timeout:210000,maxBuffer:16*1024*1024
  });
  if(child.error)throw child.error;
  assert.equal(child.status,0,
    'Integrated exact-data tests failed:\n'+
    String(child.stderr||'').slice(-10000)+'\n'+
    String(child.stdout||'').slice(-12000));
  const output=child.stdout||'';
  for(const marker of [
    'EXACT_CROSSFILE_DATA',
    'EXACT_ABRUPT_YIELD',
    'ABRUPT_REWRITE_YIELD',
    'EXACT_EXTERNAL_TRACE',
    'EXACT_GENERATED_ESM'
  ]) {
    assert.ok(output.includes(marker),
      'Integrated runner lost expected evidence marker '+marker);
  }
  if(process.platform!=='win32')
    assert.ok(output.includes('EXACT_HOST_CHROMIUM'),
      'Linux integrated runner must execute a real Chromium host differential');
  const passed=output.match(/# pass (\d+)/u);
  const failed=output.match(/# fail (\d+)/u);
  assert.ok(passed&&failed,'Native Node TAP summary must be parseable');
  assert.equal(Number(failed[1]),0);
  process.stdout.write('EXACT_INTEGRATED '+JSON.stringify({
    suites:suites.length,nodeTests:Number(passed[1]),platform:process.platform,
    browserExecuted:process.platform!=='win32'
  })+'\n');
});
