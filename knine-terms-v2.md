# KNINE Recovery Bounty — Terms

## Header (hash-bound fields)

Version: 2  
ContractVariant: `KnineRecoveryBountyDecayAcceptMultiFunder`  
ChainId: 1  
BountyContract: `0x5EA23706708F727F1AF45718c4903DdA2526D4d0`  
KnineToken: `0x91fbB2503AC69702061f1AC6885759Fc853e6EaE`  
Treasury (K9 DAO Safe): `0xDA4Df6E2121eDaB7c33Ed7FE0f109350939eDA84`  
ShibariumBridge (ERC20PredicateProxy): `0x6Aca26bFCE7675FF71C734BF26C8c0aC4039A4Fa`  
Exploiter: `0x999E025a2a0558c07DBf7F021b2C9852B367e80A`  
Amount (KNINE, 18 decimals): `248989400000000000000000000000`  
InitialPeriod: `1900800 seconds (22 days)`  
DecayPeriod: `604800 seconds (7 days)`  
PayoutAsset: `ETH`  

---

## 1) Offer

These terms set out a one-time, on-chain bounty (funded in **ETH**) for the return of **Amount** KNINE from **Exploiter** to the **ShibariumBridge** using the contract at **BountyContract**.

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

> **Freeze semantics:** `accept()` freezes **time** (the `ts` used to compute the payout factor), **not** an absolute ETH amount. Additional funding after `accept()` but before settlement increases the ETH payment proportionally.

## 5) Payout Schedule (payoutFactor)

Let `t = max(0, ts − START)`, where `ts` is the reference time (either `acceptedAt` or the current block time):

- `factor = 1` if `t ≤ InitialPeriod`  
- `factor = 0` if `t ≥ InitialPeriod + DecayPeriod`  
- otherwise `factor = (InitialPeriod + DecayPeriod − t) / DecayPeriod`

## 6) Settlement Mechanics (including temporary un-blacklisting)

To prevent any race where tokens could move once un-restricted, settlement is executed by the K9 DAO Safe in **a single atomic transaction** comprised of the following sub-calls:

1. **Un-blacklist Exploiter (temporary):**
   `KnineToken.changeBlackStatus([Exploiter])`
2. **Recover + Pay (atomic):**
   `BountyContract.recoverKnine()`
   – Pulls **Amount** KNINE from **Exploiter** and transfers it to **ShibariumBridge**;
   – Pays ETH bounty to **Exploiter** according to Section 4;
   – Sets `finalized = true` and enables funder refunds.
3. **Re-blacklist Exploiter (nice-to-have):**
   `KnineToken.changeBlackStatus([Exploiter])`

If any sub-step fails, the **entire** transaction reverts (no change to blacklist; no assets move).

## 7) How to Claim (your steps)

**Recommended path (with Acceptance):**

1. From **Exploiter**, call `approve(BountyContract, Amount)` on **KnineToken**.
2. Call `accept()` from **Exploiter** before expiry to freeze the payout factor.
3. We will execute the **atomic Safe batch** in Section 6 (you or anyone may also call `recoverKnine()` if the token is un-restricted).

**Alternative path (without Acceptance):**

- You may skip `accept()` and proceed with approval only; payout then uses the current time when `recoverKnine()` executes. If the computed payout is 0, the transaction reverts.

## 8) Anti-Reneging / Refund Lock

As long as **Acceptance** is in force (i.e., `acceptedAt > 0` and **Exploiter** still has both `allowance ≥ Amount` and token **balance ≥ Amount**), the bounty **cannot be withdrawn from under you**:

- The contract **blocks the start of refunds** while a valid acceptance remains in place.
- After successful settlement (`recoverKnine()`), `finalized = true` and the ETH payment to **Exploiter** occurs **before** refunds are enabled.

## 9) Funding & Refunds (multi-funder model)

- Anyone may fund the bounty during the window by sending **ETH ≥ 0.01** to **BountyContract**; contributions and funders are tracked on-chain.
- After `recoverKnine()` (or after expiry if no valid acceptance remains), the contract **snapshots** the remaining ETH and returns it **pro-rata** to the recorded funders via `refundBatch()` / `refundAllEth()`.
- If a push refund to a funder address fails, the amount is recorded to `owed[funder]` and may be **pulled** at any time via `claimRefund()`.
- Integer rounding may leave negligible **dust** unassigned in the contract by design.

> There is **no** function that withdraws the remaining ETH to the K9 Treasury in this variant.

## 10) Conditions & Risks

- **Atomicity:** Settlement is purely on-chain and atomic; no discretionary review.
- **Receiver:** **Exploiter** must be able to receive ETH; if the ETH transfer fails, the settlement reverts.
- **Finality:** On successful payment, `finalized = true` and the bounty cannot be reused.
- **All-or-Nothing:** Payment requires the **full Amount**; partial transfers revert.
- **Precision:** **Amount** uses token base units (18 decimals).
- **Blacklist toggle:** The un-blacklist/re-blacklist calls in Section 6 execute **in the same transaction** as `recoverKnine()`. If `recoverKnine()` fails, the blacklist state remains unchanged.

## 11) Covenant

Upon successful completion exactly as described, we agree not to initiate new civil claims solely regarding the **returned KNINE** covered by this offer. This is not immunity from regulators, law enforcement, exchanges, or other third parties outside our control. We reserve all rights regarding assets or conduct **outside** the exact on-chain steps above.

## 12) Code-Is-Law

This bounty is governed exclusively by the deployed bytecode at **BountyContract** (variant `KnineRecoveryBountyDecayAcceptMultiFunder`). If any statement here conflicts with the deployed bytecode at **BountyContract**, the **smart contract controls**.

## 13) Notices

For coordination or questions contact:

**Telegram:**
@turtlebacon
@buzz0x
@mrshimamoto

**On-chain messaging:**
`0xDA4Df6E2121eDaB7c33Ed7FE0f109350939eDA84` (k9safe.eth)

Public announcements linking these terms to **BountyContract** and the hash of this document may be posted from **Treasury**.

## 14) Law & Venue

Governing law and exclusive venue: Panama.

## 15) Entire Agreement

This document (anchored by its Keccak-256 hash stored on-chain in the contract) together with the deployed contract constitutes the entire offer.
