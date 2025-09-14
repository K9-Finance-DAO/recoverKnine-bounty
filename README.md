# KNINE Recovery Bounty

Short contracts to offer an on-chain bounty for returning KNINE.

Three versions of the bounty recovery contract:
1. [`KnineRecoveryBounty.sol`](contracts/KnineRecoveryBounty.sol) (All-or-Nothing)
2. [`KnineRecoveryBountyDecay.sol`](contracts/KnineRecoveryBountyDecay.sol) (All-or-Nothing + Linear Decay)
3. [`KnineRecoveryBountyDecayAccept.sol`](contracts/KnineRecoveryBountyDecayAccept.sol) (Decay + “Acceptance Freeze”)

---

## 1) `KnineRecoveryBounty` (All-or-Nothing)


**What:** Fixed bounty (ETH) for transferring **exactly `AMOUNT`** KNINE from the exploiter to your treasury.

**Flow:**

1. Fund contract with ETH.
2. Safe multicall: `unblacklist → recoverKnine() → reblacklist`.

**Constructor:** `(knine, treasury, exploiter, amount, deadline, termsHash)`
**Functions:**

* `recoverKnine()` – pulls KNINE via `transferFrom(exploiter, treasury, AMOUNT)` and pays **all ETH** to exploiter.
* `ownerWithdraw()` – after `deadline`, withdraws remaining ETH to `TREASURY`.

**Events:** `DealFinalized(exploiter, paidEth, termsHash)`

---

## 2) `KnineRecoveryBountyDecay` (All-or-Nothing + Linear Decay)

**What:** Same as #1, but bounty **decays linearly** after an initial window.

**Constructor:** `(knine, treasury, exploiter, amount, initialPeriod, decayPeriod, termsHash)`

* 100% payout during `initialPeriod`.
* Then linearly from 100% → 0 across `decayPeriod`.

**Functions:**

* `recoverKnine()` – pays the **current** decayed ETH.
* `ownerWithdraw()` – after `initialPeriod + decayPeriod`, sends remaining ETH to `TREASURY`.

**Events:** `DealFinalized(...)`

---

## 3) `KnineRecoveryBountyDecayAccept` (Decay + “Acceptance Freeze”)

**What:** Like #2, but the exploiter can **freeze** the payout level once ready.

**Constructor:** `(knine, treasury, exploiter, amount, initialPeriod, decayPeriod, termsHash)`
**Functions:**

* `accept()` – only exploiter; requires `allowance ≥ AMOUNT`; records `acceptedAt` (freezes payout level).
* `recoverKnine()` – uses `acceptedAt` (if set), then clears it, pays ETH.
* `ownerWithdraw()` – blocked if `acceptedAt > 0` **and** `allowance ≥ AMOUNT` (prevents reneging); when allowed, sends ETH to `TREASURY`.

**Events:** `Accepted(acceptedAt, termsHash)`, `DealFinalized(...)`

---

## Multicall recipe (Safe)

1. `KNINE.unblacklist(exploiter)`
2. `Bounty.recoverKnine()`
3. `KNINE.reblacklist(exploiter)`

---

## Notes

* **Funding:** Send ETH on deploy or later (plain transfer).
* **Terms:** `termsHash` anchors your public “safe-harbor” terms (publish on IPFS).
* **Approvals:** Watch for `Approval(exploiter → bounty, AMOUNT)` before running the multicall.
* **Tokens:** Uses direct OZ `IERC20.transferFrom` (KNINE is standards-compliant).
