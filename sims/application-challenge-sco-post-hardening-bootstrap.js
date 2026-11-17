'use strict';

const assert=require('node:assert/strict');
const {bootstrap}=require('./application-challenge-sco-cold-bootstrap');

/**
 * Fresh Node-client timing observations, in chronological trial order.
 * Source commit: 5899d3a2ffbfab7d75613d5b028949e0133c9b39.
 * Workflow run 43962835725, Ubuntu job 133640880364,
 * Windows job 133640880002, Node v22.23.4.
 * Values are milliseconds rounded to six decimals from the workflow logs.
 * The trusted SCO application server had already initialized.
 *
 * @type {Record<string,Record<string,{native:number[],remote:number[]}>>}
 */
const samples={
  linux:{
    heavy:{
      native:[49.007925,47.724705,46.690263,45.068046,48.141670,47.564129,47.329403,46.566844,48.889753],
      remote:[123.030719,114.419288,117.945598,116.605592,116.247741,115.305172,108.648807,115.025167,111.062433]
    },
    light:{
      native:[32.750126,26.557453,25.656315,26.056125,26.086376,25.620483,25.770126,28.613005,25.589401],
      remote:[138.235328,122.556303,104.499455,106.261582,106.307212,108.467220,108.496676,104.369924,112.120671]
    }
  },
  win32:{
    heavy:{
      native:[102.6483,101.5436,99.2204,98.5618,95.1200,97.6712,96.2488,99.1475,100.2877],
      remote:[206.9730,206.5324,214.9723,210.8761,204.8712,209.1781,220.2005,220.1395,206.0723]
    },
    light:{
      native:[61.2033,67.7315,68.1595,64.7517,64.3901,62.7815,62.0376,67.2643,62.0783],
      remote:[196.7603,214.1366,199.7708,198.5581,202.6141,205.6636,207.6489,206.4474,207.4412]
    }
  }
};

/**
 * Repeat the existing seeded, paired-index median-ratio bootstrap on the
 * source-pinned post-hardening samples. Resampling characterizes this single
 * runner sample and does not prove deployment performance, causal changes,
 * or a distribution-free population bound.
 * @returns {void}
 */
function main(){
  /** @type {Record<string,Record<string,ReturnType<typeof bootstrap>>>} */
  const report={};
  const expected={linux:{heavy:2.4242044251456845,light:4.162830044759139},
    win32:{heavy:2.1097667616430043,light:3.1940251684653553}};
  const trials=25000;
  for(const platform of Object.keys(samples)){
    report[platform]={};
    for(const [workload,dataset] of Object.entries(samples[platform])){
      assert.equal(dataset.native.length,9);
      assert.equal(dataset.remote.length,9);
      const result=bootstrap(dataset,
        'agent3-post-hardening-'+platform+'-'+workload,trials);
      assert.ok(Math.abs(result.ratio-expected[platform][workload])<0.00001);
      report[platform][workload]=result;
    }
  }
  assert.ok(report.linux.heavy.upper>report.linux.heavy.ratio);
  assert.ok(report.linux.light.lower>2.5);
  assert.ok(report.win32.light.lower>2.5);
  process.stdout.write('APPLICATION_SCO_POST_HARDENING_BOOTSTRAP '+
    JSON.stringify({
      pinnedRun:43962835725,
      pinnedSource:'5899d3a2ffbfab7d75613d5b028949e0133c9b39',
      samplesPerKind:9,
      trials,
      method:'paired chronological index bootstrap of median ratio',
      interval:'95% conditional percentile interval, not a universal bound',
      measuredBoundary:'fresh Node client process; initialized loopback SCO server',
      report
    })+'\n');
}
if(require.main===module)main();
module.exports={samples,main};
