import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadBackendConfig } from "../../scripts/lib/provider-backend/config";
import type { BackendConfig } from "../../scripts/lib/provider-backend/types";

function makeEnv(entries: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return entries as NodeJS.ProcessEnv;
}

describe("loadBackendConfig", () => {
  it("parses walletconnect configuration with defaults", () => {
    const env = makeEnv({
      SIGNER_BACKEND: "walletconnect",
      RPC_URL: "https://example",
      CHAIN_ID: "11155111",
      WC_PROJECT_ID: "demo",
      WC_SESSION_PATH: ".wc.json",
      BACKEND_CONFIRMATIONS: "7",
      BACKEND_GAS: "210000",
      BACKEND_MAX_FEE_GWEI: "42",
      WC_DISABLE_QR: "0",
    });

    const config = loadBackendConfig(env);
    assert.equal(config.type, "walletconnect");
    const wc = config as Extract<BackendConfig, { type: "walletconnect" }>;
    assert.equal(wc.rpcUrl, "https://example");
    assert.equal(wc.chainId, 11155111);
    assert.equal(wc.confirmations, 7);
    assert(wc.feeOverrides?.gas !== undefined);
    assert.equal(wc.feeOverrides?.gas, 210000n);
    assert(wc.feeOverrides?.maxFeePerGas !== undefined);
    assert.equal(wc.feeOverrides?.maxFeePerGas?.toString(), (42n * 10n ** 9n).toString());
    assert.equal(wc.disableQRCode, false);
    assert.equal(wc.metadata.name, "Hardhat WalletConnect");
    assert.deepEqual(wc.metadata.icons.length > 0, true);
  });

  it("parses local configuration using defaults for missing optional fields", () => {
    const env = makeEnv({
      SIGNER_BACKEND: "local",
      BACKEND_RPC_URL: "https://example",
      BACKEND_CHAIN_ID: "10",
      PRIVATE_KEY: "0x1234",
    });

    const config = loadBackendConfig(env, { confirmations: 3 });
    assert.equal(config.type, "local");
    assert.equal(config.rpcUrl, "https://example");
    assert.equal(config.chainId, 10);
    assert.equal(config.confirmations, 3);
    const local = config as Extract<BackendConfig, { type: "local" }>;
    assert.equal(local.privateKey, "0x1234");
    assert.equal(local.mnemonic, undefined);
  });

  it("throws when required values are missing", () => {
    const env = makeEnv({ SIGNER_BACKEND: "walletconnect" });
    assert.throws(() => loadBackendConfig(env), /Missing required environment value 'WC_PROJECT_ID'/);
  });
});
