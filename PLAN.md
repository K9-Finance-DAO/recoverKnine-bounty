# Provider Backend Plan (WalletConnect + Hardware) for Hardhat 3 + viem

This document captures the full plan, rationale, status, and next steps for adding a reusable, secure “provider backend” that enables deployments without putting private keys on the VM (e.g., signing on a phone via WalletConnect, or on a hardware wallet), while remaining compatible with Hardhat 3 and the viem toolbox.

## Goals

- Avoid raw private keys on the VM for production deployments.
- Support multiple signer backends via a single abstraction:
  - WalletConnect (mobile wallet, QR-based).
  - Hardware wallets (Ledger, Trezor) via USB/HID.
  - Local/dev signer (optional) for non-secret usage.
- Keep compatibility with Hardhat 3 + viem workflows (tests, artifacts, verification).
- Make the backend reusable across repos, with minimal switching cost between signers/networks.

## Non-Goals

- Building a full UI or replacing frontend WalletConnect flows.
- Deep custody/KMS integrations (Fireblocks, Safe, etc.). These can be added later as new backends.

## Context and Constraints

- Project uses Hardhat 3 with `@nomicfoundation/hardhat-viem` (no ethers v5-style signers by default).
- Many community WalletConnect + Hardhat plugins expect ethers and/or pre-HH3 patterns. We need a native integration approach.
- For WalletConnect in Node, signing uses `eth_sendTransaction` (wallet-side broadcast), not raw `eth_signTransaction` in most mobile wallets.
- Contract verification remains via `@nomicfoundation/hardhat-verify` after we have the on-chain address.

## Architecture Overview

- Public RPC Client (viem) for reads, gas estimation, receipts, and (for account-based) transaction submission.
- Signer Backend abstraction with two modes:
  - Account mode (local/hardware): expose a viem `WalletClient` for programmatic signing and tx submission.
  - Remote mode (WalletConnect): expose `sendTransaction(tx)` that submits JSON-RPC requests to the connected wallet.
- Deployment utility orchestrates both modes:
  - Account mode: use `walletClient.deployContract`.
  - Remote mode: encode constructor data with `viem.encodeDeployData`, estimate fees with the public client, then call `eth_sendTransaction` through the remote signer and wait for receipt with the public client.

## Directory Structure

- scripts/lib/provider-backend/
  - types.ts — shared types and backend interfaces.
  - config.ts — env-driven config loader with defaults and validation.
  - clients.ts — helpers to construct viem Public/Wallet clients with custom chains.
  - artifacts.ts — helpers to read Hardhat artifacts and encode deployment data.
  - storage.ts — simple JSON file key-value storage for WC session persistence.
  - walletconnect.ts — WalletConnect remote signer backend implementation.
  - index.ts — re-exports for convenience.
- test/provider-backend/
  - config.test.ts — config loader unit tests.
  - walletconnect.test.ts — WC backend behaviour tests (using a fake provider).

## Phased Plan and Tasks

Phase 1 — Foundations [Completed]
- Capture requirements, supported flows, and constraints.
- Decide library structure and shared interfaces.
- Add a clear env-driven configuration loader with sane defaults.

Phase 2 — Shared Infrastructure [Completed]
- Implement `SignerBackend` interfaces: account vs remote modes.
- Implement `clients.ts` (defineChain + public/wallet clients) and `artifacts.ts` (encode deploy data).
- Implement env parsing (RPC URL, chain ID, confirmations, gas overrides, chain metadata).
- Add test(s) for config parsing and helper checks.

Phase 3 — WalletConnect Backend [Completed]
- Implement `WalletConnectBackend` with:
  - QR rendering (terminal) via `qrcode-terminal`, switchable via injected generator.
  - Session persistence to disk (path configurable).
  - Chain switching and dynamic chain add (`wallet_switchEthereumChain` / `wallet_addEthereumChain`).
  - Transaction submission via `eth_sendTransaction`.
  - Hooks to stub provider and QR generator for tests.
- Write tests to validate connect, chain switching/adding, and tx submission.

Phase 4 — Hardware Backends (Ledger/Trezor) [Planned]
- Ledger backend:
  - HID transport + `@ledgerhq/hw-app-eth` signers.
  - Create a viem `Account` with `signTransaction/signMessage`.
  - Construct a viem `WalletClient` and route through `deployContract`.
- Trezor backend:
  - `@trezor/connect` for EIP-1559 signing.
  - Similar account wiring to Ledger.
- Tests with mocks (or device simulators) to validate payload shapes.

Phase 5 — Deployment Helper + Hardhat Integration [Planned]
- Implement `deployContractWithBackend`:
  - Account mode: pass `{ client: { wallet, public } }` to `viem.deployContract`.
  - Remote mode: use `encodeDeployData` + `eth_sendTransaction` → `waitForTransactionReceipt`.
  - Support `confirmations` and fee overrides from the backend config.
- Build a new script `scripts/deploy-with-backend.ts` that:
  - Loads config from env.
  - Deploys these two contracts:
    - `contracts/5_ETH_Bounty_for_Knine_Return_ERC20.sol:ReturnKnineFor5ETHBountyERC20`
    - `contracts/5_ETH_Bounty_for_Knine_Return_NFT.sol:ReturnKnineFor5ETHBountyNFT`
  - Calls `hardhat-verify` to verify each address.
  - Prints addresses and Etherscan links.

Phase 6 — Testing Strategy [Planned/Partial]
- Unit tests: config loader, WC backend (done). Add tests for deploy orchestration with mocks.
- Integration (when available):
  - Run on a dev chain (Hardhat in-process) for the account-mode path.
  - For remote-mode, use the fake provider in node:test.
- Provide a dry-run flag to print the tx request without sending.

Phase 7 — DX & Documentation [In Progress]
- Provide `.env.example` with all knobs and safe defaults.
- Document commands and environment variables.
- Provide troubleshooting and safety guidelines.

Phase 8 — Integration & Rollout [Planned]
- Confirm Sepolia end-to-end deployment from a phone via WalletConnect.
- Confirm verification via `@nomicfoundation/hardhat-verify`.
- Optionally publish the backend lib or template for reuse across projects.

## What’s Implemented So Far

Core Library and Tests
- types/config/clients/artifacts/storage implemented:
  - scripts/lib/provider-backend/types.ts
  - scripts/lib/provider-backend/config.ts
  - scripts/lib/provider-backend/clients.ts
  - scripts/lib/provider-backend/artifacts.ts
  - scripts/lib/provider-backend/storage.ts
- WalletConnect backend:
  - scripts/lib/provider-backend/walletconnect.ts
  - Remote signer mode with QR, session persistence, chain switching/adding, tx submission.
  - Test hooks (provider/QR stubs) for deterministic tests.
- Tests:
  - test/provider-backend/config.test.ts
  - test/provider-backend/walletconnect.test.ts
- Dependencies added for WC and QR:
  - package.json: `@walletconnect/ethereum-provider`, `qrcode-terminal`.

Existing Deployment Script (Hot Wallet Path)
- scripts/deploy-sepolia.ts — deploys and verifies the ERC20 and NFT using viem’s deployer (programmatic signer via private key). This remains useful for non-sensitive setups.

## What Remains

- Implement hardware backends (Ledger/Trezor) as account-mode backends.
- Implement `deployContractWithBackend` orchestration utility.
- New script `scripts/deploy-with-backend.ts` to use the backends and verify.
- Additional tests for the deploy orchestration (both account and remote paths).
- Add `.env.example` and docs with all environment variables and examples.

## Next Actions

1. Implement deploy orchestrator (remote + account modes) and add tests with fakes/mocks.
2. Create `scripts/deploy-with-backend.ts` wiring the orchestrator to our two contracts and verification.
3. Add Ledger backend skeleton (compile-time only), guarded behind optional dependency, and write mock-based tests.
4. Write documentation: `.env.example`, usage steps, and troubleshooting.

## Justification for Design Choices

- Hardhat 3 + viem: We work natively with viem’s `PublicClient`/`WalletClient` and Hardhat’s artifact/verify tasks. This avoids compatibility issues with ethers-only plugins.
- WalletConnect in Node: Using `eth_sendTransaction` and QR flow is the most widely-supported method in mobile wallets, and avoids handling raw private keys.
- Abstraction by mode (account vs remote): Clean separation between transports that can produce raw signed txs (hardware/local) and those that cannot (WC), simplifying the deploy orchestration.
- Session persistence to JSON file: Avoids rescanning QR every run; easy to audit and delete.
- Injected loader/QR generators: Improves testability without introducing heavyweight mocks or side effects in CI.

## Environment Variables

Common
- SIGNER_BACKEND: `walletconnect` | `ledger` | `trezor` | `local` (default: walletconnect)
- BACKEND_RPC_URL (or PROVIDER_RPC_URL | RPC_URL): HTTP RPC URL
- BACKEND_CHAIN_ID (or PROVIDER_CHAIN_ID | CHAIN_ID): numeric chain id
- BACKEND_CONFIRMATIONS (or DEPLOY_CONFIRMATIONS): required confirmations (default 1)
- BACKEND_GAS, BACKEND_GAS_PRICE_GWEI, BACKEND_MAX_FEE_GWEI, BACKEND_MAX_PRIORITY_FEE_GWEI, BACKEND_NONCE: fee overrides (optional)
- BACKEND_CHAIN_NAME (or CHAIN_NAME): human-readable chain name for `wallet_addEthereumChain`
- BACKEND_NATIVE_CURRENCY_NAME | BACKEND_NATIVE_CURRENCY_SYMBOL | BACKEND_NATIVE_CURRENCY_DECIMALS: custom currency (optional)
- BACKEND_BLOCK_EXPLORERS (or CHAIN_BLOCK_EXPLORERS): comma-separated block explorer URLs

WalletConnect
- WC_PROJECT_ID: project ID from WalletConnect Cloud (required)
- WC_SESSION_PATH: file path for persisted session JSON (default: `.walletconnect-session.json`)
- WC_DISABLE_QR: set to `1` to print URI instead of rendering ASCII QR
- WC_RELAY_URL: custom relay (optional)
- WC_APP_NAME, WC_APP_DESCRIPTION, WC_APP_URL, WC_APP_ICON or WC_APP_ICONS: app metadata

Ledger (planned)
- LEDGER_DERIVATION_PATH: e.g., `m/44'/60'/0'/0/0` (optional)
- LEDGER_ACCOUNT_INDEX: numeric index override (optional)

Trezor (planned)
- TREZOR_DERIVATION_PATH
- TREZOR_ACCOUNT_INDEX
- TREZOR_MANIFEST_EMAIL, TREZOR_MANIFEST_APP_URL (required by SDK)

## Usage (Current)

Hot Wallet (existing script)
- Ensure `.env` has `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY`, plus Etherscan API key.
- Run: `npx hardhat run --network sepolia scripts/deploy-sepolia.ts`

WalletConnect (after Phase 5)
- Set env: `SIGNER_BACKEND=walletconnect`, `BACKEND_RPC_URL`, `BACKEND_CHAIN_ID`, `WC_PROJECT_ID`.
- Run: `npx hardhat run --network sepolia scripts/deploy-with-backend.ts`
- Scan the QR with a mobile wallet and approve transactions.

Hardware (after Phase 4)
- Set env: `SIGNER_BACKEND=ledger` or `trezor` and related vars.
- Run the same `deploy-with-backend.ts` script.

## Testing

- Unit tests use Node’s test runner and stubs to validate logic in isolation.
- Integration tests will target a local Hardhat network for account-mode, and use a fake WC provider for remote-mode.
- In some environments, Hardhat may warn about WSL; use `HARDHAT_SKIP_WSL_CHECK=1` when running tests if needed.

## Risks and Mitigations

- WalletConnect availability: If relay/modals fail, we print URI fallback and persist sessions to reduce friction.
- Gas estimation: Provide fee override knobs and confirm waits.
- Hardware support: Node/HID quirks on different OSes. Start with mocks; gate optional deps.
- Security: No private keys are written for WC or hardware paths; session JSON is not sensitive but should still be treated carefully.

## File References

- scripts/lib/provider-backend/types.ts
- scripts/lib/provider-backend/config.ts
- scripts/lib/provider-backend/clients.ts
- scripts/lib/provider-backend/artifacts.ts
- scripts/lib/provider-backend/storage.ts
- scripts/lib/provider-backend/walletconnect.ts
- scripts/lib/provider-backend/index.ts
- test/provider-backend/config.test.ts
- test/provider-backend/walletconnect.test.ts
- scripts/deploy-sepolia.ts

---

This plan is meant to be self-contained so work can resume from a fresh context. See “Next Actions” for the immediate implementation priorities.
