'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { transform } = require('./transform');

/** @param {string} dir @param {string} [prefix] @returns {Record<string,string>} */
function readTree(dir, prefix = '') {
  /** @type {Record<string,string>} */
  const files = {};
  for (const item of fs.readdirSync(path.join(dir, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, item.name);
    if (item.isDirectory()) Object.assign(files, readTree(dir, relative));
    if (item.isFile() && /\.(?:c|m)?js$/i.test(item.name)) files[relative.replace(/\\/g, '/')] = fs.readFileSync(path.join(dir, relative), 'utf8');
  }
  return files;
}

/** @param {string[]} args @returns {Record<string,string|boolean>} */
function parseOptions(args) {
  /** @type {Record<string,string|boolean>} */
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if (!['--input','--output','--seed','--allowed-host','--closed-world'].includes(name)) throw new Error('Unknown option: ' + name);
    if (name === '--closed-world') options.closedWorld = true;
    else {
      if (!args[i+1] || args[i+1].startsWith('--')) throw new Error('Missing value for ' + name);
      options[name.slice(2)] = args[++i];
    }
  }
  return options;
}

/**
 * Add an inexpensive runtime host gate. It is deterrence only because the
 * threat model gives an attacker control over the running environment.
 * @param {string} code
 * @param {string} mode
 * @param {string} host
 * @returns {string}
 */
function withHostGate(code, mode, host) {
  if (!/^[a-zA-Z0-9._-]{1,253}$/.test(host)) throw new Error('Invalid host');
  const observed = mode === 'sno' ? 'globalThis.process?.env?.OBFS_MACHINE_ID' : 'globalThis.location?.hostname';
  const guard = `if (${observed} !== ${JSON.stringify(host)}) throw new Error("Unauthorized host");\n`;
  // Preserve a shebang on executable CJS scripts.
  if (code.startsWith('#!')) {
    const offset = code.indexOf('\n');
    return offset < 0 ? code + '\n' + guard : code.slice(0,offset+1) + guard + code.slice(offset+1);
  }
  return guard + code;
}

/**
 * Atomically publish individual files under an exclusive output-directory lock.
 * The lock prevents concurrent builders from interleaving output writes.
 * @param {'coo'|'sno'} mode
 * @param {string[]} args
 * @returns {{renamed:number, diagnostics:string[], files:number}}
 */
function build(mode, args) {
  const options = parseOptions(args);
  if (!options.input || !options.output) throw new Error('Requires --input DIR and --output DIR');
  const input = path.resolve(String(options.input));
  const output = path.resolve(String(options.output));
  if (input === output || output.startsWith(input + path.sep)) throw new Error('Output must be outside input directory');
  const inputFiles = readTree(input);
  const result = transform(inputFiles, { seed: typeof options.seed === 'string' ? options.seed : undefined, closedWorld: options.closedWorld === true });
  fs.mkdirSync(output, { recursive: true });
  const trueInput = fs.realpathSync(input);
  const trueOutput = fs.realpathSync(output);
  if (trueOutput === trueInput || trueOutput.startsWith(trueInput + path.sep)) throw new Error('Output resolves inside input directory');
  const lock = path.join(output, '.obfs.lock');
  const fd = fs.openSync(lock, 'wx');
  try {
    for (const [name, source] of Object.entries(result.files)) {
      const destination = path.join(output, name);
      fs.mkdirSync(path.dirname(destination), { recursive:true });
      const code = options['allowed-host'] ? withHostGate(source, mode, String(options['allowed-host'])) : source;
      const temp = destination + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
      try {
        fs.writeFileSync(temp, code, { flag:'wx' });
        fs.renameSync(temp, destination);
      } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
    }
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
  return { renamed: result.renamed, diagnostics: result.diagnostics, files:Object.keys(result.files).length };
}

module.exports = { build, parseOptions, readTree, withHostGate };
