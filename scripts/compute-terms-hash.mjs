// node scripts/compute-terms-hash.mjs
import fs from 'node:fs';
import { keccak256, toUtf8Bytes } from 'ethers';

const text = fs.readFileSync('knine-terms-v1.md', 'utf8'); // UTF-8, no BOM
console.log( keccak256(toUtf8Bytes(text)) );
