'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runChromium}=require('../sims/a2mba-heldout-source-browser-cpu');

test('published A2MBA helper source has paired real-Chromium runtime and parity evidence',
  {skip:process.platform!=='linux'},async()=>{
    const measured=await runChromium({count:5000000,trials:7});
    assert.equal(measured.rows.length,4);
    assert.equal(measured.count,5000000);
    assert.equal(measured.trials,7);
    assert.match(measured.chrome,/Chrome|Chromium/u);
    for(const row of measured.rows){
      assert.match(row.sourceSha256,/^[0-9a-f]{64}$/u);
      assert.match(row.minProtectedSha256,/^[0-9a-f]{64}$/u);
      assert.equal(row.checksums.length,7);
      assert.ok(new Set(row.checksums).size>=2);
      for(const samples of Object.values(row.samples)){
        assert.equal(samples.length,7);
        assert.ok(samples.every(t=>Number.isFinite(t)&&t>0));
      }
      for(const value of Object.values(row.ratios))
        assert.ok(Number.isFinite(value)&&value>0);
    }
    console.log('A2MBA_HELDOUT_CHROME '+JSON.stringify(measured));
});
