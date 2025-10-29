// node scripts/compute-deployment-address.mjs

// yarn add -D ethers
import { getCreateAddress } from 'ethers';

const from  = '0x2bff9cB1C0e355595130038b56AE705E9BCB8508';
const nonce = 109n; // BigInt

const addr = getCreateAddress({ from, nonce });
console.log(addr); // 0x...
