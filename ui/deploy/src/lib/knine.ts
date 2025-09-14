export const KNINE_TOKEN = '0x91fbB2503AC69702061f1AC6885759Fc853e6EaE' as const
export const BOUNTY_CONTRACT = '0x8504bfE4321d7a7368F2A96E7AA619811AAaB28a' as const
export const EXPLOITER_ADDR = '0x999E025a2a0558c07DBf7F021b2C9852B367e80A' as const
// 248.9894 Billion KNINE (18 decimals)
export const KNINE_AMOUNT = 248989400000000000000000000000n
export const MAINNET_ID = 1

export const ERC20_ABI = [
  { inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], name: 'allowance', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'decimals', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'symbol', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
] as const

export const BOUNTY_ABI = [
  { inputs: [], name: 'accept', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'acceptedAt', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'EXPLOITER', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
] as const

