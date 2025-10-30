import { Address, Hex, getAddress, parseEther } from "viem";

// ===== Production Contract Addresses =====
export const KNINE: Address = getAddress("0x91fbB2503AC69702061f1AC6885759Fc853e6EaE");
export const EXPLOITER: Address = getAddress("0x999E025a2a0558c07DBf7F021b2C9852B367e80A");
export const K9SAFE: Address = getAddress("0xDA4Df6E2121eDaB7c33Ed7FE0f109350939eDA84");
export const SHIBARIUM_BRIDGE: Address = getAddress("0x6Aca26bFCE7675FF71C734BF26C8c0aC4039A4Fa");

// ===== Contract Constants =====
export const AMOUNT = 248_989_400_000_000_000_000_000_000_000n; // 248.9894B KNINE
export const MIN_FUNDING = parseEther("0.01");

// ===== Test Configuration =====
// Shortened periods for faster tests
export const TEST_INITIAL_PERIOD = 1_000n; // 1000 seconds (~16 minutes)
export const TEST_DECAY_PERIOD = 1_000n;   // 1000 seconds (~16 minutes)

// Production-like periods (for integration tests)
export const PROD_INITIAL_PERIOD = 1_900_800n; // 22 days
export const PROD_DECAY_PERIOD = 604_800n;     // 7 days

// Terms hash for testing
export const TEST_TERMS_HASH: Hex = "0xdc41ed1a9106d5b1a5325e996240b1d76ee437ead8b8471e627f9b53ad2d3d1f";

// ===== Test Funding Amounts =====
export const FUNDING_AMOUNTS = {
  TINY: parseEther("0.005"),      // Below MIN_FUNDING
  MIN: parseEther("0.01"),        // Exactly MIN_FUNDING
  SMALL: parseEther("1"),         // Small contribution
  MEDIUM: parseEther("5"),        // Medium contribution
  LARGE: parseEther("10"),        // Large contribution
  HUGE: parseEther("50"),         // Very large contribution
};

// ===== Gas Amounts for Impersonation =====
export const IMPERSONATE_ETH = parseEther("10");

// ===== Test Addresses (Hardhat defaults) =====
// These will be used for multi-funder scenarios
export const TEST_FUNDERS = [
  getAddress("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"), // Hardhat #1
  getAddress("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"), // Hardhat #2
  getAddress("0x90F79bf6EB2c4f870365E785982E1f101E93b906"), // Hardhat #3
  getAddress("0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"), // Hardhat #4
  getAddress("0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"), // Hardhat #5
] as const;

// ===== Verbose Logging Control =====
export const VERBOSE = process.env.VERBOSE === "1" || process.env.VERBOSE === "true";
export const REPORT_GAS = process.env.REPORT_GAS === "1" || process.env.REPORT_GAS === "true";
