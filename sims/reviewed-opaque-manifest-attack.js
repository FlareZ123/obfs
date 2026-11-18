'use strict';

// Actual pre-fix source from commit 0875dc83f22d455cafbd20cb98daea2bdc9ca38b
// preserved as Git blob d7a4e94ecdb1e5fd9a5e013578138a8bb256138a.
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const oldCheck=require('./fixtures/reviewed-opaque-legacy.cjs').assertReviewedOpaqueAssets;
const newCheck=require('../src/reviewed-assets').assertReviewedOpaqueAssets;
const beforeDuplicateCheck=require('./fixtures/reviewed-opaque-pre-duplicate.cjs').assertReviewedOpaqueAssets;

/**
 * @typedef {{path:string,sha256:string}} ReviewedAsset
 * @typedef {{path:string,sourceType:string,code:Buffer}} PublicAsset
 * @typedef {{files:PublicAsset[],reviewed:ReviewedAsset[]}} Scenario
 * @param {string|Buffer} bytes
 * @returns {string}
 */
function sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}
const safe=Buffer.from('body{color:teal}');
const unsafe=Buffer.from('unreviewed-source=OriginalSource_3113');
const safeFile={path:'theme.css',sourceType:'asset',code:safe};
const unsafeFile={path:'preferences.txt',sourceType:'asset',code:unsafe};
const safeReview={path:'theme.css',sha256:sha256(safe)};
const unsafeReview={path:'preferences.txt',sha256:sha256(unsafe)};

/** @returns {Scenario} */
function alternateManifestIterator(){
  const reviewed=[safeReview];
  Object.defineProperty(reviewed,Symbol.iterator,{value:function*(){yield unsafeReview;}});
  return {files:[unsafeFile],reviewed};
}

/** @returns {Scenario} */
function alternateFileIterator(){
  const files=[unsafeFile];
  Object.defineProperty(files,Symbol.iterator,{value:function*(){yield safeFile;}});
  return {files,reviewed:[safeReview]};
}

/** @returns {Scenario} */
function manifestGrowthDuringValidation(){
  /** @type {ReviewedAsset[]} */
  const reviewed=[];
  let appended=false;
  reviewed.push({
    get path(){
      if(!appended){appended=true;reviewed.push(unsafeReview);}
      return 'theme.css';
    },
    sha256:sha256(safe)
  });
  return {files:[safeFile,unsafeFile],reviewed};
}

/**
 * @param {typeof newCheck} checker
 * @param {()=>Scenario} scenario
 * @returns {boolean}
 */
function accepts(checker,scenario){
  const {files,reviewed}=scenario();
  try{checker(files,reviewed);return true;}
  catch(error){
    if(!(error instanceof Error))throw error;
    return false;
  }
}

/** @type {Array<[string,()=>Scenario]>} */
const cases=[
  ['manifest iterator injected unindexed permission',alternateManifestIterator],
  ['published file iterator concealed unreviewed bytes',alternateFileIterator],
  ['getter expanded reviewed inventory after initial length',manifestGrowthDuringValidation]
];
for(const [name,make] of cases){
  assert.equal(accepts(oldCheck,make),true,name+' old implementation');
  assert.equal(accepts(newCheck,make),false,name+' indexed snapshot');
  console.log(JSON.stringify({case:name,oldAccepted:true,newAccepted:false}));
}
console.log('3/3 historical manifest bypasses refused by indexed snapshot');

/** @returns {Scenario} */
function duplicatesInsteadOfRequiredDistinctPaths(){
  return {files:[safeFile,safeFile],reviewed:[safeReview,unsafeReview]};
}
assert.equal(accepts(oldCheck,duplicatesInsteadOfRequiredDistinctPaths),true);
assert.equal(accepts(beforeDuplicateCheck,duplicatesInsteadOfRequiredDistinctPaths),true);
assert.equal(accepts(newCheck,duplicatesInsteadOfRequiredDistinctPaths),false);
console.log('1/1 duplicate-publication old/current-prepatch accept, fixed checker refuses');
