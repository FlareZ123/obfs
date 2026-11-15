'use strict';

const {obfuscateFiles} = require('./core');
const {symbolizeLocalProperties} = require('./symbol-properties');
const {createSnoLauncher} = require('./sno');
const {virtualizeRegisterChains} = require('./register-vm');
const {virtualizeExpressionGraphs} = require('./expression-vm');
const {flattenBranchBlocks} = require('./branch-blocks');
const {lowerWasmI32Functions} = require('./wasm-i32');
const {createScoHandler} = require('./sco');
const {createScoRpcClientSource} = require('./rpc-client');
const {createScoBatchMethod} = require('./rpc-batch');
const {preflightScoBatchState} = require('./rpc-batch-policy');
const {partitionScoAsyncModule,bindScoModuleExports} = require('./sco-partition');
const {partitionScoAsyncGraph,bindScoGraphExports} = require('./sco-graph');

module.exports = {symbolizeLocalProperties,lowerWasmI32Functions,flattenBranchBlocks,virtualizeRegisterChains,virtualizeExpressionGraphs,obfuscateFiles,createSnoLauncher,createScoHandler,createScoRpcClientSource,createScoBatchMethod,preflightScoBatchState,partitionScoAsyncModule,bindScoModuleExports,partitionScoAsyncGraph,bindScoGraphExports};
