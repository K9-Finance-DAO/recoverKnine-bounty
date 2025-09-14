import fs from 'node:fs'
import path from 'node:path'

const src = path.join('artifacts', 'contracts', 'KnineRecoveryBountyDecayAccept.sol', 'KnineRecoveryBountyDecayAccept.json')
const dstDir = path.join('ui', 'deploy', 'public', 'artifacts')
const dst = path.join(dstDir, 'KnineRecoveryBountyDecayAccept.json')

if (!fs.existsSync(src)) {
  console.error('Artifact not found. Run: pnpm build:contracts')
  process.exit(1)
}

fs.mkdirSync(dstDir, { recursive: true })

// Copy as-is, UI loader supports both Hardhat and minimal JSON
fs.copyFileSync(src, dst)
console.log('Exported artifact to', dst)

