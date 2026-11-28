'use strict';

const {obfuscateFiles} = require('./core');
const {assertReviewedOpaqueAssets}=require('./reviewed-assets');
const {verifyPublishedDeployment}=require('./deployment-audit');
const {symbolizeLocalProperties} = require('./symbol-properties');
const {createSnoLauncher} = require('./sno');
const {virtualizeRegisterChains} = require('./register-vm');
const {virtualizeExpressionGraphs} = require('./expression-vm');
const {flattenBranchBlocks} = require('./branch-blocks');
const {flattenStatementFlow} = require('./statement-flow');
const {lowerPolyvariantAffine} = require('./affine-native');
const {lowerWasmI32Functions} = require('./wasm-i32');
const {createScoHandler} = require('./sco');
const {createScoKeyedIsolation}=require('./rpc-keyed-isolation');
const {createScoRpcClientSource} = require('./rpc-client');
const {createScoBatchMethod} = require('./rpc-batch');
const {preflightScoBatchState} = require('./rpc-batch-policy');
const {partitionScoAsyncModule,bindScoModuleExports} = require('./sco-partition');
const {partitionScoSelectedAsyncExports,createScoSelectedHandler}=require('./sco-selective-partition');
const {verifyScoPrivateSourceDigests}=require('./sco-private-integrity');
const {partitionScoAsyncGraph,bindScoGraphExports,createScoGraphHandler} = require('./sco-graph');
const {partitionScoSelectedGraph,bindScoSelectedGraphExports,createScoSelectedGraphHandler} = require('./sco-selected-graph');

module.exports = {verifyPublishedDeployment,assertReviewedOpaqueAssets,lowerPolyvariantAffine,verifyScoPrivateSourceDigests,partitionScoSelectedAsyncExports,createScoSelectedHandler,createScoKeyedIsolation,symbolizeLocalProperties,lowerWasmI32Functions,flattenBranchBlocks,flattenStatementFlow,virtualizeRegisterChains,virtualizeExpressionGraphs,obfuscateFiles,createSnoLauncher,createScoHandler,createScoRpcClientSource,createScoBatchMethod,preflightScoBatchState,partitionScoAsyncModule,bindScoModuleExports,partitionScoAsyncGraph,bindScoGraphExports,createScoGraphHandler,partitionScoSelectedGraph,bindScoSelectedGraphExports,createScoSelectedGraphHandler};
