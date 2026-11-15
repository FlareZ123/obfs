'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoHandler}=require('../src');

/**
 * Fetch a source or asset through Node's standard WHATWG URL representation.
 * @param {number} port
 * @param {string} target
 * @returns {Promise<{status:number,text:string}>}
 */
async function request(port,target) {
  const response=await fetch('http://127.0.0.1:'+port+target);
  return {status:response.status,text:await response.text()};
}

test('SCO serves canonical percent-encoded Unicode and URL-special filenames',async()=>{
  const server=http.createServer(createScoHandler([
    {path:'café/hello world.mjs',sourceType:'module',code:'export const welcome=7;'},
    {path:'assets/résumé#v1.json',sourceType:'asset',code:Buffer.from('{"ok":true}')},
    {path:'assets/ratio%done.css',sourceType:'asset',code:Buffer.from('body{opacity:1}')},
    {path:'a/b.js',sourceType:'script',code:'globalThis.ready=true;'}
  ]));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Expected TCP listener');
    const port=address.port;
    const script=await request(port,'/obfs/caf%C3%A9/hello%20world.mjs');
    assert.equal(script.status,200);
    assert.match(script.text,/welcome/);
    assert.deepEqual(await request(port,'/obfs/assets/r%C3%A9sum%C3%A9%23v1.json'),{
      status:200,text:'{"ok":true}'
    });
    assert.deepEqual(await request(port,'/obfs/assets/ratio%25done.css'),{
      status:200,text:'body{opacity:1}'
    });
    assert.equal((await request(port,'/obfs/a/b.js')).status,200);
    // A percent-encoded separator should never alias another declared route.
    assert.notEqual((await request(port,'/obfs/a%2Fb.js')).status,200);
    assert.notEqual((await request(port,'/obfs/a%5Cb.js')).status,200);
    assert.notEqual((await request(port,'/obfs/%GG')).status,200);
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
