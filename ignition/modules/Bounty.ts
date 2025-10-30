import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { keccak256, toHex } from "viem";

export default buildModule("Bounty", (m) => {
  const initial = m.getParameter("initialPeriod", 3 * 24 * 60 * 60); // 3d
  const decay   = m.getParameter("decayPeriod",   14 * 24 * 60 * 60); // 14d
  const terms   = m.getParameter("termsHash",     keccak256(toHex("K9 Terms v2")));

  const bounty = m.contract("KnineRecoveryBountyDecayAcceptMultiFunder", [initial, decay, terms]);

  return { bounty };
});
