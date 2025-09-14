
Below are three **IPFS‑ready Terms** templates—one for each bounty contract variant. They’re written to be copy‑pasted as standalone Markdown files. Each contains a **canonically ordered header block** (so hashing is predictable), clear definitions, mechanics, and disclaimers. After you fill in the placeholders (addresses, amounts, times), pin the file to IPFS and use the **Keccak‑256** of the **exact file bytes** as `termsHash` in the bounty contract.

> **Not legal advice.** This is a community‑safety template. Have counsel review and adapt for your jurisdiction and facts.

---

## A) TERMS — All‑or‑Nothing Bounty (`KnineRecoveryBounty`)

**File name suggestion:** `terms-knine-recovery-fixed.md`

```markdown
# KNINE Recovery Bounty — All‑or‑Nothing (v1)

## Canonical Header (fill every field; keep order and spacing)
Version: 1
ContractVariant: KnineRecoveryBounty
ChainId: <CHAIN_ID>
BountyContract: <BOUNTY_CONTRACT_ADDRESS>
KnineToken: <KNINE_TOKEN_ADDRESS>
Treasury: <TREASURY_ADDRESS>
Exploiter: <EXPLOITER_ADDRESS>
Amount: <AMOUNT_IN_TOKEN_UNITS>
Deadline: <UNIX_TIMESTAMP>
PayoutAsset: ETH

---

## 1) Purpose
This public offer encourages the return of **KNINE** tokens removed during the [Shibarium bridge incident] by providing an on‑chain bounty.

## 2) Parties & Scope
- **Offering Party (“we/us”)**: The KNINE project/team/DAO operating the **Treasury** address above.
- **Returning Party (“you”)**: The controller of **Exploiter** at the time of execution.
- **Scope**: Return of exactly **Amount** KNINE tokens from **Exploiter** to **Treasury** on **ChainId**.

## 3) Consideration (What you get)
If you (or any caller) successfully execute the on‑chain flow below **on or before `Deadline`**, you will receive **all ETH held** by **BountyContract** at that moment.

## 4) On‑chain Mechanics (Code‑is‑Law)
Execution is permissionless and governed solely by the deployed contract **BountyContract** (variant `KnineRecoveryBounty`):
1. You must set `IERC20(KNINE).approve(BountyContract, Amount)` from **Exploiter**.
2. A transaction calls `recoverKnine()` on **BountyContract**.
3. The contract pulls `Amount` KNINE via `transferFrom(Exploiter, Treasury)` and pays **entire ETH balance** to **Exploiter**.
4. The contract permanently finalizes (one‑time use).

If any step fails, **no payment** is made and the entire transaction reverts.

## 5) Expiry & Withdrawal
After `Deadline`, we may recover any remaining ETH by calling `ownerWithdraw`. Before `Deadline`, we will not use `ownerWithdraw`.

## 6) Safe Harbor & Reservations
- We will not initiate new civil claims against **Exploiter** solely concerning the **returned KNINE** covered by this Terms file once the deal finalizes on‑chain.
- This is **not** immunity from government action. We cannot restrict or influence regulators, prosecutors, exchanges, or third parties.
- We reserve all rights regarding assets or conduct **outside** the exact on‑chain steps above.

## 7) Fairness & Conflicts
- If there is any discrepancy between this document and the bytecode of **BountyContract**, **the smart contract controls**.
- Payout is in **ETH**; ensure **Exploiter** can receive ETH (contract fallback must accept).

## 8) Contact
For coordination or questions: <CONTACT_METHOD(S)>

## 9) Governing Law / Venue
These Terms are governed by <LAW/VENUE>. You agree disputes are resolved exclusively there.

## 10) Entire Agreement
This file (hash‑anchored in the contract as `termsHash`) and the on‑chain code comprise the entire offer.

```

---

## B) TERMS — Linear Decay Bounty (`KnineRecoveryBountyDecay`)

**File name suggestion:** `terms-knine-recovery-decay.md`

```markdown
# KNINE Recovery Bounty — Linear Decay (v1)

## Canonical Header (fill every field; keep order and spacing)
Version: 1
ContractVariant: KnineRecoveryBountyDecay
ChainId: <CHAIN_ID>
BountyContract: <BOUNTY_CONTRACT_ADDRESS>
KnineToken: <KNINE_TOKEN_ADDRESS>
Treasury: <TREASURY_ADDRESS>
Exploiter: <EXPLOITER_ADDRESS>
Amount: <AMOUNT_IN_TOKEN_UNITS>
Start: <UNIX_TIMESTAMP_AT_DEPLOY>
InitialPeriod: <SECONDS>
DecayPeriod: <SECONDS>
PayoutAsset: ETH

---

## 1) Purpose
Same as the fixed bounty, but payout **decays linearly** after an initial full‑reward window.

## 2) Consideration
If you execute the on‑chain flow (Section 4), the contract pays ETH according to:
- **100%** of contract ETH during `InitialPeriod` (from `Start`), then
- Linearly decreasing to **0** over `DecayPeriod`.

Once the linear function reaches 0, no bounty remains.

## 3) Mechanics (Code‑is‑Law)
Variant `KnineRecoveryBountyDecay` at **BountyContract**:
1. From **Exploiter**, set `approve(BountyContract, Amount)`.
2. Call `recoverKnine()`.
3. Contract pulls KNINE to **Treasury** and pays the **current decayed ETH** to **Exploiter**; then finalizes.

## 4) Expiry & Withdrawal
After `Start + InitialPeriod + DecayPeriod` we may reclaim any remaining ETH via `ownerWithdraw`.

## 5) Safe Harbor, Conflicts, Contact, Law
As in Sections 6–10 of the fixed bounty (incorporated by reference). Where there is conflict, the contract code controls.

```

---

## C) TERMS — Decay with Acceptance Freeze (`KnineRecoveryBountyDecayAccept`)

**File name suggestion:** `terms-knine-recovery-decay-accept.md`

```markdown
# KNINE Recovery Bounty — Decay with Acceptance Freeze (v1)

## Canonical Header (fill every field; keep order and spacing)
Version: 1
ContractVariant: KnineRecoveryBountyDecayAccept
ChainId: <CHAIN_ID>
BountyContract: <BOUNTY_CONTRACT_ADDRESS>
KnineToken: <KNINE_TOKEN_ADDRESS>
Treasury: <TREASURY_ADDRESS>
Exploiter: <EXPLOITER_ADDRESS>
Amount: <AMOUNT_IN_TOKEN_UNITS>
Start: <UNIX_TIMESTAMP_AT_DEPLOY>
InitialPeriod: <SECONDS>
DecayPeriod: <SECONDS>
PayoutAsset: ETH

---

## 1) Purpose
Adds a fairness safeguard so you can **freeze** the payout level once you are ready to proceed.

## 2) Consideration
- During `InitialPeriod`, bounty = **100%** of contract ETH.
- Then the bounty decays linearly to **0** across `DecayPeriod`.
- If you call **`accept()`**, the payout is **frozen** at the then‑current level and remains claimable at that level **so long as**:
  - `allowance(Exploiter → BountyContract) ≥ Amount`, **and**
  - `balanceOf(Exploiter) ≥ Amount`.

## 3) Mechanics (Code‑is‑Law)
Variant `KnineRecoveryBountyDecayAccept` at **BountyContract**:

**Freeze (optional, only Expoliter):**
1. From **Exploiter**, ensure both allowance and balance ≥ **Amount**.
2. Call `accept()` to freeze the payout level at the current time (`acceptedAt` is recorded on‑chain).

**Finalize:**
1. We (or anyone) can call `recoverKnine()` at any time afterward.
2. Contract uses the frozen timestamp (or “now” if not frozen) to compute payout.
3. Contract pulls **Amount** KNINE from **Exploiter** to **Treasury**, **then** pays frozen ETH amount to **Exploiter**; finalizes.

**Anti‑reneging:**  
If `acceptedAt > 0` **and** the allowance & balance checks above remain true, `withdrawToTreasury()` is **blocked** (we can’t withdraw funds out from under a valid acceptance).

## 4) Expiry & Withdrawal
After `Start + InitialPeriod + DecayPeriod`, we may reclaim any remaining ETH via `withdrawToTreasury()`, **except** when blocked by a valid frozen acceptance (see Anti‑reneging).

## 5) Safe Harbor, Conflicts, Contact, Law
As in Sections 6–10 of the fixed bounty (incorporated by reference). Where there is conflict, the contract code controls.

```

---

## How to compute and verify `termsHash`

> **Important:** Ethereum uses **Keccak‑256**, *not* NIST SHA‑3‑256. Newlines and whitespace matter. Hash the **raw file bytes** exactly as pinned to IPFS.

Pick one method:

* **Foundry (cast)**

  ```bash
  cast keccak file:terms-knine-recovery-fixed.md
  ```
* **Node (ethers v6)**

  ```js
  import fs from 'node:fs';
  import { keccak256, toUtf8Bytes } from 'ethers';

  const text = fs.readFileSync('terms-knine-recovery-fixed.md', 'utf8'); // UTF-8, no BOM
  console.log( keccak256(toUtf8Bytes(text)) );
  ```
* **CLI keccak** (if installed)

  ```bash
  keccak256sum terms-knine-recovery-fixed.md
  ```

Use the resulting `0x…` as the `termsHash` when deploying each bounty.

---

## Pinning to IPFS

Use your preferred pinning service or IPFS CLI:

```bash
ipfs add terms-knine-recovery-fixed.md
# returns a CID; reference as ipfs://<CID>
```

You may also publish a **signed** message from your Treasury address linking the CID(s), for extra authenticity.

---

## Final checklist before deployment

* [ ] Replace all placeholders (`<…>`) in the selected Terms file.
* [ ] Compute Keccak‑256; confirm it matches the `termsHash` set in the contract constructor.
* [ ] Fund the bounty contract with the intended ETH.
* [ ] (If using the **Accept** variant) Communicate simple steps to the exploiter:

  * Approve + (optionally) `accept()` from **Exploiter** to freeze payout.
  * We will multicall `unblacklist → recoverKnine() → reblacklist` in a single transaction.
* [ ] Post on‑chain announcement (e.g., `eth_sendTransaction` with a short note) referencing the IPFS CID and bounty contract address.
