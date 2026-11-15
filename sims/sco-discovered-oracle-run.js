'use strict';

const {runDiscovered}=require('./sco-synchronizing-oracle');

if(require.main===module){
  runDiscovered(2).then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}
