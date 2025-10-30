import { describe, it } from "node:test";
import { network } from "hardhat";
import { parseEther, getAddress } from "viem";

describe("00 - Minimal Impersonation Test", () => {
  it("should impersonate and send transaction", async () => {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [deployer] = await viem.getWalletClients();

    const testAddr = getAddress("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");

    // Get transport for RPC calls
    const transport: any = (publicClient as any).transport;

    // Impersonate
    await transport.request({
      method: "hardhat_impersonateAccount",
      params: [testAddr],
    });

    // Set balance
    await transport.request({
      method: "hardhat_setBalance",
      params: [testAddr, `0x${parseEther("10").toString(16)}`],
    });

    // Try to send ETH
    await transport.request({
      method: "eth_sendTransaction",
      params: [{
        from: testAddr,
        to: deployer.account.address,
        value: `0x${parseEther("1").toString(16)}`,
      }],
    });

    console.log("✓ Impersonation and transaction successful!");
  });
});
