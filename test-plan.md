# KnineRecoveryBountyDecayAcceptMultiFunder – Comprehensive Test Plan

## Contract Snapshot & Timeline
- Hardcoded addresses: `KNINE`, `EXPLOITER`, `SHIBARIUM_BRIDGE`.
- Time windows: `INITIAL` (freeze at 100%), `DECAY` (linear drop to 0), `START = deployment timestamp`.
- `accept()` freezes the **ratio** based on timestamp; actual payout uses the **current** ETH balance at recovery.
- `recoverKnine()` pulls `AMOUNT` of KNINE to bridge, sends ETH payout, sets `finalized`, then enables refunds.
- Funding via `receive()` while bounty open, enforcing `MIN_FUNDING` and tracking funders for refunds.
- Refund state: snapshot on first enable, payouts via batch push with pull fallback (`owed`).

## Scenario Axes We Must Cover
| Axis | Values to Cover |
| --- | --- |
| Funder composition | 1 solo, 2 uneven, 3 mixed, 5 funders (equal & skewed), repeat top-ups by same funder |
| Funding timing | Before accept, between accept and recover, after expiry (expect revert) |
| Acceptance timing | Not called, within INITIAL, within DECAY, attempt after DECAY (fail) |
| Recovery timing | Immediately after funding, during INITIAL, mid-DECAY, after DECAY (fail), after refunds enabled |
| Refund trigger source | Post-finalize auto enable, manual enable after expiry, enable only after exploiter allowance removed |
| Refund delivery | Successful push, push failure -> `owed` -> pull claim, claim before batch, multiple batches |
| Negative behaviors | Bad caller, insufficient allowance/balance, overdose batches, reentrancy attempts |

Use the matrix above to ensure every axis combination is exercised at least once. The scenario IDs below reference which axes they cover.

## Test Suites & Scenario IDs

### Suite 0 – Deployment & Static Invariants
- **D0.1** Deploy with real parameters `(1900800, 604800, termsHash)` → verify immutables, zeroed state.
- **D0.2** Mock KNINE wiring (when running locally) – mint `AMOUNT` to `EXPLOITER`, configure blacklist owner, baseline balances.

### Suite 1 – Funding & Accounting Paths
- **F1.1** (Axes: solo funder, pre-accept) Fund with `≥ MIN_FUNDING` → `BountyFunded` event, arrays update once for repeated top-ups from same address.
- **F1.2** Reject `< MIN_FUNDING` (revert `MIN_FUNDING`).
- **F1.3** Reject after `finalized` (revert `FINALIZED`).
- **F1.4** Reject once refunds enabled (`REFUNDS_STARTED`).
- **F1.5** Reject after timeline expiry without acceptance (`FUNDING_CLOSED`).
- **F1.6** (Axes: 2,3,5 funders) Multi-funder contributions: assert totals, order, proportional weights. Include top-up by one funder after accept to show payout scaling.

### Suite 2 – Acceptance & Decay Freeze
- **A2.1** Only exploiter can call (others → `ONLY_EXPLOITER`).
- **A2.2** Acceptance during INITIAL (captures Scenario `S_INITIAL`). Record `acceptedAt` and event.
- **A2.3** Acceptance mid DECAY (Scenario `S_DECAY`). Calculate expected frozen ratio.
- **A2.4** Attempt after `INITIAL+DECAY` → `TOO_LATE`.
- **A2.5** Insufficient allowance or allowance revoked before call → `ALLOWANCE`.
- **A2.6** Double accept → `ACK`.

### Suite 3 – Recovery Flows (Simulate Gnosis Safe batch: unblacklist → recover → reblacklist)
- **R3.1** (Scenario `S1` – 1 funder, no accept) Recover during INITIAL → full payout, `refundsEnabled=true`, `refundSnapshot` equals leftover ETH.
- **R3.2** (Scenario `S2` – 2 funders, accept during INITIAL, extra funding after accept) Recover late but payout equals frozen ratio applied to final balance.
- **R3.3** (Scenario `S3` – 3 funders, accept mid DECAY) Move clock into decay, call accept, add more funding, wait further, recover → payout matches frozen partial ratio.
- **R3.4** (Scenario `S4` – 5 funders, no accept, recover mid DECAY) Ensure payout matches on-the-fly decay and leftover stored for refunds.
- **R3.5** Negative: recover without unblacklisting → expect `TRANSFER_FAIL` (or bridge balance check `wtf`).
- **R3.6** Negative: recover after DECAY expiry without prior accept → `EXPIRED`.
- **R3.7** Allowance revoked or exploiter balance short between accept and recover → `TRANSFER_FAIL`.

### Suite 4 – Refund Enablement Paths
- **E4.1** Auto-enable after successful recover (from Suites R3.1–R3.4).
- **E4.2** Manual enable by calling `refundBatch` post-expiry when `accept` never happened (Scenario `S5`).
- **E4.3** Post-expiry but exploiter acceptance still valid (allowance + balance INTACT) → `_enableRefunds` guarded (`LOCKED_OR_EARLY`). Remove allowance to unblock, then enable.
- **E4.4** Re-enter refunds when already enabled → no-op, state unchanged.

### Suite 5 – Refund Distribution Mechanics
- **P5.1** `refundBatch(batchSize)` with partial batches across funders (covers `refundCursor` advancement, idempotency, proportionality for 2/3/5-funder matrices).
- **P5.2** `refundAllEth` equals iterating full `refundBatch` (single funder & multi-funder).
- **P5.3** Push failure simulation (malicious receiver) → `owed` credited, later `claimRefund()` pays remaining and emits events.
- **P5.4** Funder self-claims before any batch; later batch is a no-op due to `refunded[target] == target`.
- **P5.5** `refundBatch(0)` reverts `BAD_BATCH_SIZE`.
- **P5.6** `refundBatch` with zero funders (contract deployed but never funded) → `NO_FUNDERS`.
- **P5.7** Attempt to claim when nothing owed → `NOTHING_DUE` / `REFUNDS_NOT_ENABLED` as appropriate.
- **P5.8** Forced ETH after snapshot (send via helper) → verify snapshot stays unchanged, dust retained.

### Suite 6 – View & Helper Functions
- **V6.1** `timeRemaining()` monotonic decrease, zero at expiry.
- **V6.2** `currentPayout()` before/after accept vs manual `_payoutAt` calculations.
- **V6.3** `refundOwed(addr)` matches `(target - refunded) + owed` in all refund scenarios (before batch, after batch, post-claim).

### Suite 7 – Defensive & Edge Conditions
- **N7.1** Reentrancy guard: use a contract attempting to reenter `refundBatch`/`claimRefund` via fallback → ensure `REENTRANCY` revert.
- **N7.2** Fallback safety: external ETH forced in via `selfdestruct` equivalent (use helper contract) should not disrupt payouts (document that `refundSnapshot` ignores post-snapshot funds).
- **N7.3** Calls to `recoverKnine()` or `accept()` once `finalized` → `FINALIZED`.
- **N7.4** Pause/resume impersonation boundaries in scripts to ensure Hardhat state resets cleanly (script-only hygiene check).

## Scenario Reference Map
| Scenario ID | Axes Covered | Description |
| --- | --- | --- |
| S1 | 1 funder, no accept, recover in INITIAL | Baseline happy path, verifies full payout & refunds snapshot |
| S2 | 2 funders (70/30), accept in INITIAL, top-up after accept | Confirms accept freezes ratio but payout scales with final balance |
| S3 | 3 funders, accept mid DECAY, recover later | Tests partial payout freeze, verifies leftover refunds |
| S4 | 5 funders, no accept, recover mid DECAY | Confirms live decay calculation and refund pro-rata for many funders |
| S5 | 4 funders, no accept, let bounty expire and trigger refunds manually | Exercises expiry-driven refunds without recovery |
| S6 | Any funder set, accept attempted after expiry | Negative acceptance timing |
| S7 | Any funder set, recover attempt without allowance/blacklist lift | Negative recovery |
| S8 | Malicious funder reverts on receive, claim via pull | Refund fallback pathway |

Each regression or interactive run should pick scenarios ensuring all axes are covered at least once.

## Interactive Script Coverage (`scripts/interactive-bounty-v2.ts`)
Design the script to guide operators through the following flows, pausing between steps for inspection:
1. **Environment Prep** – Reset fork or local chain, deploy new bounty with supplied parameters, wire mock KNINE if on local network.
2. **Flow A (Scenario S1)** – Fund with single sponsor, recover immediately (no accept). Show payout math and refund snapshot.
3. **Flow B (Scenario S2)** – Multi-funder contributions, exploiter accepts during INITIAL, another funder tops up, later perform Safe-style batch recovery.
4. **Flow C (Scenario S3)** – Advance time into DECAY, exploiter accepts, additional contributions post-accept, wait further, recover and compare frozen ratio.
5. **Flow D (Scenario S4)** – Populate 5 funders, recover mid DECAY without acceptance, then distribute refunds via batches + manual claim.
6. **Flow E (Scenario S5 & S8)** – Let contract expire without recovery, trigger refunds manually, include reverting receiver to demonstrate pull-claim fallback.
7. **Flow F (Scenario S6 & S7)** – Showcase negative cases: acceptance too late, recovery without unblacklisting or after allowance revoked.
8. **View & Diagnostics** – Query helper views after each phase to validate expectations (`timeRemaining`, `currentPayout`, `refundOwed`).

The interactive runner should expose toggles for quick time travel, funding presets (1–5 funders, custom ETH amounts), allowance management, and blacklist flips to simulate the Safe batch. Logging should capture events, balances (ETH & KNINE), payout calculations, and refund distributions.
