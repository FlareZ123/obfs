'use strict';

const {obfuscateFiles} = require('./core');
const {createSnoLauncher} = require('./sno');
const {createScoHandler} = require('./sco');
const {createScoRpcClientSource} = require('./rpc-client');

module.exports = {obfuscateFiles,createSnoLauncher,createScoHandler,createScoRpcClientSource};
