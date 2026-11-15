'use strict';

const {obfuscateFiles} = require('./core');
const {createSnoLauncher} = require('./sno');
const {createScoHandler} = require('./sco');

module.exports = {obfuscateFiles,createSnoLauncher,createScoHandler};
