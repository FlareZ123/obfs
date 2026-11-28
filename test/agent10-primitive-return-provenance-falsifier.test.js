'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { partitionScoSelectedAsyncExports } = require('../src/sco-selective-partition');

/**
 * @param {string} body
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function partitionDirect(body) {
  const code = [
    'function identity(value) { return value; }',
    `export async function protectedOp() { ${body} }`,
    'export function visible() { return 1; }',
  ].join('\n');

  return partitionScoSelectedAsyncExports(
    { path: 'mixed.mjs', code },
    {
      seed: 17,
      privateNames: ['protectedOp'],
      privateModuleImports: [],
    },
  );
}

test('SCO refuses primitive prototype reads flowing through a local identity helper', async () => {
  const client = vm.createContext({});
  vm.runInContext(
    "String.prototype.toString = function () { return 'client-patched'; };",
    client,
  );
  vm.runInContext(
    [
      'function identity(value) { return value; }',
      "const text = 'abc';",
      'globalThis.protectedOp = () => identity(text).toString();',
    ].join('\n'),
    client,
  );

  const server = vm.createContext({});
  vm.runInContext(
    [
      'function identity(value) { return value; }',
      "const text = 'abc';",
      'globalThis.protectedOp = () => identity(text).toString();',
    ].join('\n'),
    server,
  );

  const clientResult = await vm.runInContext('protectedOp()', client);
  const serverResult = await vm.runInContext('protectedOp()', server);
  assert.equal(clientResult, 'client-patched');
  assert.equal(serverResult, 'abc');

  assert.throws(
    () => partitionDirect("const text = 'abc'; return identity(text).toString();"),
    /realm-local prototype/u,
  );
});
