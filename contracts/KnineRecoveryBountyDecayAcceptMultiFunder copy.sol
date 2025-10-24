// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title   KnineRecoveryBountyDecayAcceptMultiFunder
 * @author  Shima @ K9 Finance DAO
 * @notice  Exploiter can `accept()` to freeze decay. `recoverKnine()` pays based on freeze (or now)
 *          and returns KNINE to the Shibarium Bridge. Remaining ETH is refunded pro‑rata to funders
 *          via a snapshot + batched distribution with pull fallback.
 *
 * @dev    Multiple funders can send ETH to the contract after deployment to increase the bounty pool.
 * TermsURI: ipfs://TODO
 */
contract KnineRecoveryBountyDecayAcceptMultiFunder {
    // ===== Constants =====
    string public constant IPFS_TERMS_URI = "ipfs://TODO";
    IERC20 public constant KNINE =
        IERC20(0x91fbB2503AC69702061f1AC6885759Fc853e6EaE);
    address public constant EXPLOITER =
        0x999E025a2a0558c07DBf7F021b2C9852B367e80A;

    /// @notice  Shibarium Bridge (ERC20PredicateProxy)
    ///          Location where KNINE will be returned to when calling `recoverKnine()`
    ///          See: https://etherscan.io/address/0x6aca26bfce7675ff71c734bf26c8c0ac4039a4fa#code
    address public constant SHIBARIUM_BRIDGE =
        0x6Aca26bFCE7675FF71C734BF26C8c0aC4039A4Fa;

    /// @notice 248.9894 Billion KNINE (with 18 decimals)
    uint256 public constant AMOUNT = 248989400000000000000000000000;

    /**
     * @notice Minimum funding amount to be considered a funder.
     * @dev    Any ETH sent below this amount will be rejected.
     *         Prevents dust funders that would complicate proportional refunds.
     */
    uint256 public constant MIN_FUNDING = 0.01 ether;

    // ===== Timeline =====

    /// @notice  Bounty claim start timestamp
    /// @dev     starts immediately on contract deployment
    uint256 public immutable START;
    /// @notice (optional) initial claim window (in seconds), before reward decay starts, where exploiter can claim 100% of the bounty
    uint256 public immutable INITIAL;
    /// @notice Time window for bounty claim (in seconds) during which available claim decreases linearly
    uint256 public immutable DECAY;
    /// @notice Keccak256 of human‑readable terms (e.g., IPFS text) for safe‑harbor / scope.
    bytes32 public immutable TERMS_HASH;

    // ===== Acceptance / finalization =====

    /// @notice @notice Timestamp (if any) at which the exploiter froze the decay; 0 if not accepted.
    uint256 public acceptedAt;

    /// @notice True once KNINE is successfully recovered and bounty paid.
    bool public finalized;

    /* ====== Multi‑Funder Accounting ====== */

    mapping(address => uint256) public fundedAmounts;
    address[] public funders;
    uint256 public totalFunded;

    // ===== Minimal reentrancy guard =====
    uint256 private _unlocked = 1;
    modifier nonReentrant() {
        require(_unlocked == 1, "REENTRANCY");
        _unlocked = 0;
        _;
        _unlocked = 1;
    }

    // ====== Events =======
    event BountyFunded(address indexed funder, uint256 amount);
    event Accepted(uint256 at, bytes32 termsHash);
    event DealFinalized(
        address indexed exploiter,
        uint256 paidEth,
        bytes32 termsHash
    );
    event Refunded(address indexed to, uint256 amount);

    /**
     *
     * @param initialPeriod seconds to set initial (100% bounty claim) window.
     * @param decayPeriod   seconds to set for the decay claim window
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

    /**
     * @notice  Exploiter calls to accept bounty and freeze the decay at the current time by showing readiness.
     *          Once accepted, as long as exploiter does not remove allowance, bounty cannot be revoked or reneged by K9 Finance DAO
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
    function _payoutAt(
        uint256 ts
    ) internal view returns (uint256 payoutAmount) {
        payoutAmount = address(this).balance;
        uint256 t = (ts > START) ? (ts - START) : 0;
        if (t <= INITIAL) return payoutAmount;
        if (t >= INITIAL + DECAY) return 0;
        return (payoutAmount * (INITIAL + DECAY - t)) / DECAY;
    }

    /**
     * @notice  Pulls KNINE into `SHIBARIUM_BRIDGE` and pays the ETH bounty to exploiter.
     * @dev     Uses `acceptedAt` if present (exploiter called accept), else `block.timestamp`.
     *          Sets `finalized` BEFORE sending ETH to prevent re‑acceptance via callback.
     */
    function recoverKnine() external {
        require(!finalized, "FINALIZED");
        uint256 ref = (acceptedAt > 0) ? acceptedAt : block.timestamp;
        uint256 pay = _payoutAt(ref);
        require(pay > 0, "EXPIRED");

        uint balStart = KNINE.balanceOf(SHIBARIUM_BRIDGE);
        require(
            KNINE.transferFrom(EXPLOITER, SHIBARIUM_BRIDGE, AMOUNT),
            "TRANSFER_FAIL"
        );

        if (KNINE.balanceOf(SHIBARIUM_BRIDGE) < balStart + AMOUNT) {
            revert("wtf"); // super duper check that we got the KNINE back
        }

        // Prevent any re‑acceptance during ETH send.
        // will fail if exploiter tries reentrancy (using 7702 magic, EOA to contract shinanigans)
        finalized = true;

        (bool ok, ) = payable(EXPLOITER).call{value: pay}("");
        require(ok, "ETH_PAY_FAIL");
        emit DealFinalized(EXPLOITER, pay, TERMS_HASH);
    }

    /* ======= Multi‑Funder ETH Handling ======= */

    /// @notice Allow funding contract with ETH bounty after creation,
    ///         tracking amounts contributed by different addresses.
    /// @dev    only accept funding above `MIN_FUNDING` to avoid dust funders.
    ///         rejects any further funding if deal was finalized, or time expired.
    receive() external payable {
        require(!finalized, "FINALIZED");
        require(timeRemaining() > 0, "FUNDING_CLOSED");
        require(msg.value >= MIN_FUNDING, "MIN_FUNDING");

        if (fundedAmounts[msg.sender] == 0) {
            funders.push(msg.sender);
        }

        fundedAmounts[msg.sender] += msg.value;
        totalFunded += msg.value;

        emit BountyFunded(msg.sender, msg.value);
    }

    // ===== Refund Logic =====


    function _refundsAllowed() internal view returns (bool) {
        if (finalized) return true; // after exploiter is paid
        if (block.timestamp < START + INITIAL + DECAY) return false;
        // Prevent reneging after exploiter called `accept` and valid acceptance is still in force
        if (acceptedAt > 0) {
            if (
                KNINE.allowance(EXPLOITER, address(this)) >= AMOUNT &&
                KNINE.balanceOf(EXPLOITER) >= AMOUNT
            ) {
                return false;
            }
        }
        return true;
    }

    
    /**
     * @notice After bounty is finalized or expired (without accept), allows proportional refunds to multiple funders.
     * @dev    If `acceptedAt>0` AND exploiter still has BOTH allowance and balance >= AMOUNT, refunds are blocked
     */
    function refundEth() external {
        uint256 excess = address(this).balance;
        // loop all funders and issue proportional refunds
        // skip last funder to avoid dust calculation issues - transfer remaining balance to last funder after loop
        for (uint256 i = 0; i < funders.length - 1; i++) {
            // NOTE: not worried about underflow on funders.length - 1 
            // because no funders means we never have balance to refund
            address funder = funders[i];
            uint256 refund = (fundedAmounts[funder] * excess) / totalFunded; // full allocation
            if (refund > 0) {
                (bool ok, ) = payable(funder).call{value: refund}("");
                require(ok, "REFUND_FAIL");
            }
        }
        // refund remaining balance to last funder to avoid dust issues
        address lastFunder = funders[funders.length - 1];
        uint256 lastRefund = address(this).balance;
        if (lastRefund > 0) {
            (bool ok, ) = payable(lastFunder).call{value: lastRefund}("");
            require(ok, "REFUND_FAIL");
        }
    }

    /* ======= View Helpers ======= */

    /// @notice Convenience function to check time remaining for bounty claim
    function timeRemaining() public view returns (uint256) {
        if (block.timestamp >= START + INITIAL + DECAY) {
            return 0;
        } else {
            return (START + INITIAL + DECAY) - block.timestamp;
        }
    }

    /// @notice Convenience function to check current payout amount
    function currentPayout() public view returns (uint256) {
        uint256 ref = (acceptedAt > 0) ? acceptedAt : block.timestamp;
        return _payoutAt(ref);
    }
}
