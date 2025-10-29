// node scripts/compute-terms-hash-v2.mjs
import fs from 'node:fs';
import { keccak256, toUtf8Bytes } from 'ethers';

const text = fs.readFileSync('knine-terms-v2.md', 'utf8'); // UTF-8, no BOM
console.log( keccak256(toUtf8Bytes(text)) );
