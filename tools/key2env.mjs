#!/usr/bin/env node
// Encode an OpenSSH private key file to base64 for SSH_<ID>_KEY_B64.
// CLI:        node tools/key2env.mjs <keyPath> [id]
// Doubleclick: run with no args -> prompts for path + id, keeps window open.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

function encode(keyPath, id) {
  let raw;
  try {
    raw = readFileSync(keyPath);
  } catch (e) {
    console.error(`Cannot read ${keyPath}: ${e.message}`);
    return false;
  }
  const text = raw.toString('utf8');
  if (text.includes('PuTTY-User-Key-File')) {
    console.error('This is a PuTTY .ppk file. ssh2 needs OpenSSH/PEM. Convert: puttygen key.ppk -O private-openssh -o key.pem');
    return false;
  }
  if (!/BEGIN (OPENSSH|RSA|EC|DSA) PRIVATE KEY/.test(text)) {
    console.error('Warning: header does not look like a private SSH key. Encoding anyway - verify the result.');
  }
  const b64 = raw.toString('base64');
  console.log();
  console.log('ENV line (paste into Dokploy):');
  console.log(`SSH_${id.toUpperCase()}_KEY_B64=${b64}`);
  console.log();
  console.log(`Length: ${b64.length} chars`);
  return true;
}

async function interactive() {
  const rl = createInterface({ input: stdin, output: stdout });
  let keyPath = (await rl.question('Path to key file (you can drag the file into this window): ')).trim();
  keyPath = keyPath.replace(/^["']|["']$/g, '');
  const id = (await rl.question('Connection ID (e.g. web1): ')).trim() || 'srvx';
  encode(keyPath, id);
  await rl.question('\nPress Enter to close...');
  rl.close();
}

const [, , argPath, argId = 'srvx'] = process.argv;
if (argPath) {
  process.exit(encode(argPath, argId) ? 0 : 1);
} else {
  interactive();
}
