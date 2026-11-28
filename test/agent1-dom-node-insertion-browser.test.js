'use strict';
const {test}=require('node:test');
const {main}=require('./agent1-dom-node-insertion-browser');

test('real Chromium Node-vs-DOMString insertion source fidelity and safe rewrite yield',{
  skip:process.platform!=='linux'?
    'Chrome source observer witness runs on Ubuntu CI':false,
  timeout:180000
},async()=>{await main();});
