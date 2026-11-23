'use strict';

const {test}=require('node:test');
const {main}=require('./sco-host-ipv6-browser');

test('real IPv6 Chromium native versus SCO host lock, active script parity',{
  skip:process.platform==='win32',timeout:60000
},main);
