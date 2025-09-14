# KNINE Recovery Bounty — Terms

## Header (hash-bound fields; fill placeholders before hashing)
Version: 1  
ContractVariant: KnineRecoveryBountyDecayAccept  
ChainId: 1  
BountyContract: <BOUNTY_CONTRACT_ADDRESS>  
KnineToken: 0x91fbB2503AC69702061f1AC6885759Fc853e6EaE  
Treasury: 0xDA4Df6E2121eDaB7c33Ed7FE0f109350939eDA84  
Exploiter: 0x999E025a2a0558c07DBf7F021b2C9852B367e80A  
Amount (base units, 18d): 248989400000000000000000000000  
InitialPeriod: <FILL>  
DecayPeriod: <FILL>  
PayoutAsset: ETH

---

## 1) Offer
These terms set out a one-time on-chain bounty, funded in ETH, for the return of **Amount** KNINE from **Exploiter** to **Treasury** using the contract at **BountyContract**.

## 2) Parties
- **Offering Party (“we/us”)**: The K9 Finance DAO (K9 Foundation) controlling **Treasury**.  
- **Returning Party (“you”)**: The controller of **Exploiter** at execution time.

## 3) Definitions
- **START** — the contract’s on-chain deployment timestamp.  
- **InitialPeriod** — duration (seconds) after START with 100% payout factor.  
- **DecayPeriod** — duration (seconds) immediately following the initial period during which the payout factor decreases linearly to 0.  
- **Acceptance** — calling `accept()` from **Exploiter** while `allowance(EXPLOITER → BountyContract) ≥ Amount`, which **freezes the reference time** used in the payout schedule.

## 4) Consideration (What you get)
If the on-chain settlement completes, you receive an ETH payment computed by the contract as:
- **With Acceptance:** `ETH balance at execution × payoutFactor(acceptedAt)`  
- **Without Acceptance:** `ETH balance at execution × payoutFactor(block.timestamp)`  
The payment is sent **only** to **Exploiter** in the same transaction that transfers **Amount** KNINE from **Exploiter** to **Treasury** via `transferFrom`. Partial returns are not paid.

## 5) Payout Schedule (payoutFactor)
Let `t = max(0, ts − START)`, where `ts` is the reference time (acceptedAt or current time):
- `factor = 1` if `t ≤ InitialPeriod`  
- `factor = 0` if `t ≥ InitialPeriod + DecayPeriod`  
- otherwise `factor = (InitialPeriod + DecayPeriod − t) / DecayPeriod`

**Freeze semantics:** `accept()` freezes **time** (the `ts` used in the formula), **not** an absolute ETH amount.

## 6) How to Claim
### **Path A — With Acceptance (Recommended)**  
1) From **Exploiter**, approve `Amount` for **BountyContract** on **KnineToken**.  
2) Call `accept()` from **Exploiter** before expiry.  
3) Anyone calls `recoverKnine()`: the contract pulls KNINE → **Treasury**, pays ETH → **Exploiter**, and sets `finalized = true`.

#### **Anti‑reneging:**  
A **fairness safeguard** has been added to protect **Exploiter** if `accept()` is called.

If `acceptedAt > 0` **and** the allowance & balance checks above remain true, `withdrawToTreasury()` is **blocked** and  `withdrawToTreasury()` **reverts** (`LOCKED_BY_ACCEPT`) (we can’t withdraw funds out from under a valid acceptance).

### **Path B — Without Acceptance**  
1) Approve `Amount`.  
2) Anyone calls `recoverKnine()` before expiry; payout uses the current time.

If the computed payout is 0, `recoverKnine()` reverts and no assets move.

## 7) Expiry & Withdrawal
After `START + InitialPeriod + DecayPeriod`,  we may reclaim any remaining ETH to **Treasury** via `withdrawToTreasury()`, **except** when blocked by a valid frozen acceptance (see Anti‑reneging).

> This prevents withdrawing bounty funds after you have accepted **and** remain able to perform the return.  

## 8) Conditions & Risks
- **Atomicity:** Settlement is entirely on-chain and atomic; there is no discretionary review.  
- **Receiver:** **Exploiter** must be able to receive ETH; if the ETH transfer fails, the transaction reverts.  
- **Finality:** On successful payment, `finalized = true` and the bounty may not be used again.  
- **All-or-Nothing:** Payment requires transfer of the full **Amount**; partial transfers revert.  
- **Precision:** **Amount** is expressed in token base units (18 decimals).

## 9) Covenant
Upon successful on-chain completion, we agree not to initiate new civil claims solely regarding the **returned KNINE** covered by this offer. This is not immunity from regulators, law enforcement, exchanges, or other third parties outside our control. We reserve all rights regarding assets or conduct **outside** the exact on‑chain steps above.

## 10) Code‑Is‑Law
The bounty is governed exclusively by the deployed bytecode at **BountyContract** (variant `KnineRecoveryBountyDecayAccept`). If any statement here conflicts with the deployed bytecode at **BountyContract**, the **smart contract controls**.

## 11) Notices
For coordination or questions: <CONTACT(S)/PGP/ENS/EMAIL>. 


Public announcements linking these terms to **BountyContract** and the hash of this document may be posted from **Treasury**.

## 12) Law & Venue
Governing law and exclusive venue: <FILL>.

## 13) Entire Agreement
This document (anchored by its Keccak-256 hash stored on-chain in the contract) together with the deployed contract constitutes the entire offer.

