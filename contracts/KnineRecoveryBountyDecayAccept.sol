// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title   KnineRecoveryBountyDecayAccept
 * @author  Shima @ K9 Finance DAO
 * @notice  Adds `accept()` so the exploiter can freeze the decay once they are ready:
 *          - `accept()` requires allowance >= AMOUNT, and records `acceptedAt`.
 *          - `recoverKnine()` pays using the frozen time (or now if not accepted), then finalizes.
 *          - `withdrawToTreasury()` is blocked if `acceptedAt>0` AND exploiter still has allowance+balance (prevents reneging).
 */
contract KnineRecoveryBountyDecayAccept {
    IERC20 public constant KNINE =
        IERC20(0x91fbB2503AC69702061f1AC6885759Fc853e6EaE);
    address public constant TREASURY =
        0xDA4Df6E2121eDaB7c33Ed7FE0f109350939eDA84;
    address public constant EXPLOITER =
        0x999E025a2a0558c07DBf7F021b2C9852B367e80A;
    /// @notice 248.9894 Billion KNINE (with 18 decimals)
    uint256 public constant AMOUNT = 248989400000000000000000000000;

    /// @notice Bounty claim start timestamp
    /// @dev starts immediately on contract deployment
    uint256 public immutable START;
    /// @notice (optional) initial claim window (in seconds), before reward decay starts, where exploiter can claim 100% of the bounty
    uint256 public immutable INITIAL;
    /// @notice Time window for bounty claim (in seconds) during which available claim decreases linearly
    uint256 public immutable DECAY;
    /// @notice Keccak256 of human‑readable terms (e.g., IPFS text) for safe‑harbor / scope.
    bytes32 public immutable TERMS_HASH;
    /// @notice Timestamp (if any) at which the exploiter froze the decay; 0 if not accepted.
    uint256 public acceptedAt;
    /// @notice True once KNINE is successfully recovered and bounty paid.
    bool public finalized;

    /// @notice Emitted when the exploiter freezes the offer (decay is evaluated at this timestamp).
    event Accepted(uint256 at, bytes32 termsHash);

    /// @notice Emitted when the deal is successfully completed.
    /// @param exploiter  The exploiter address that received the bounty.
    /// @param paidEth    Amount of ETH paid (entire contract balance).
    /// @param termsHash  Terms anchor agreed to by execution.
    event DealFinalized(
        address indexed exploiter,
        uint256 paidEth,
        bytes32 termsHash
    );

    /**
     *
     * @param initialPeriod seconds to set initial (100% bounty claim) window.
     * @param decayPeriod   seconds to set for the decay claim windown
     * @param termsHash     keccak256 of public terms text hosted in IPFS
     */
    constructor(
        uint256 initialPeriod,
        uint256 decayPeriod,
        bytes32 termsHash
    ) payable {
        require(decayPeriod > 0, "BAD_DECAY");
        START = block.timestamp;
        INITIAL = initialPeriod;
        DECAY = decayPeriod;
        TERMS_HASH = termsHash;
    }

    // allow funding contract with ETH bounty after creation
    receive() external payable {}

    /**
     * @notice  Exploiter calls to accept bounty and freeze the decay at the current time by showing readiness.
     *          Once accepted, as long as exploiter does not remove allowance, bountry cannot be revoked or renegged by K9 Finance DAO
     * @dev     Requires (1) not finalized; (2) called by exploiter; (3) allowance >= AMOUNT; (4) not already accepted
     */
    function accept() external {
        require(block.timestamp < START + INITIAL + DECAY, "TOO_LATE");
        require(!finalized, "FINALIZED");
        require(msg.sender == EXPLOITER, "ONLY_EXPLOITER");
        require(
            KNINE.allowance(EXPLOITER, address(this)) >= AMOUNT,
            "ALLOWANCE"
        );
        require(acceptedAt == 0, "ACK");
        acceptedAt = block.timestamp;
        emit Accepted(acceptedAt, TERMS_HASH);
    }

    /// @dev Returns the ETH payout if executed at timestamp `ts`.
    /// @return payoutAmount amount of ETH (in wei) to pay out
    function _payoutAt(uint256 ts) internal view returns (uint256 payoutAmount) {
        payoutAmount = address(this).balance;
        uint256 t = (ts > START) ? (ts - START) : 0;
        if (t <= INITIAL) return payoutAmount;
        if (t >= INITIAL + DECAY) return 0;
        return (payoutAmount * (INITIAL + DECAY - t)) / DECAY;
    }

    /**
     * @notice  Pulls KNINE into `TREASURY` and pays the ETH bounty to exploiter.
     * @dev     Uses `acceptedAt` if present (exploiter called accept), else `block.timestamp`.
     *          Sets `finalized` BEFORE sending ETH to prevent re‑acceptance via callback.
     */
    function recoverKnine() external {
        require(!finalized, "FINALIZED");
        uint256 ref = (acceptedAt > 0) ? acceptedAt : block.timestamp;
        uint256 pay = _payoutAt(ref);
        require(pay > 0, "EXPIRED");

        uint balStart = KNINE.balanceOf(TREASURY);
        require(KNINE.transferFrom(EXPLOITER, TREASURY, AMOUNT), "TRANSFER_FAIL");

        if (KNINE.balanceOf(TREASURY) >= balStart + AMOUNT) {
            revert("wtf"); // super duper check that we got the KNINE back
        }

        // Prevent any re‑acceptance during ETH send.
        // will fail if exploiter tries reentrancy (using 7702 magic, EOA to contract shinanigans)
        finalized = true;

        (bool ok, ) = payable(EXPLOITER).call{value: pay}("");
        require(ok, "ETH_PAY_FAIL");
        emit DealFinalized(EXPLOITER, pay, TERMS_HASH);
    }

    /**
     * @notice After bounty claim window completion (initial + decay), reclaim remaining ETH to treasury
     *         unless the exploiter has a valid frozen acceptance. 
     *         Prevents K9 Finance DAO from renegging after exploiter accepts deal.
     * @dev    If `acceptedAt>0` AND exploiter still has BOTH allowance and balance >= AMOUNT, withdrawal is blocked
     */
    function withdrawToTreasury() external {
        require(block.timestamp >= START + INITIAL + DECAY, "EARLY");
        // Prevent reneging on a valid frozen acceptance.
        if (!finalized && acceptedAt > 0) {
            if (KNINE.allowance(EXPLOITER, address(this)) >= AMOUNT && KNINE.balanceOf(EXPLOITER) >= AMOUNT) {
                revert("LOCKED_BY_ACCEPT");
            }
        }
        (bool ok, ) = payable(TREASURY).call{value: address(this).balance}("");
        require(ok, "WITHDRAW_FAIL");
    }
}
