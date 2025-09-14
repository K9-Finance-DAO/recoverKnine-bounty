// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title  KnineRecoveryBounty
 * @author Shima @ K9 Finance DAO
 * @notice One-shot, all-or-nothing KNINE recovery offer funded in ETH.
 *         Payout = 100% of this contract's ETH balance at execution time.
 */
contract KnineRecoveryBounty is Ownable {
    IERC20 public immutable KNINE =
        IERC20(0x91fbB2503AC69702061f1AC6885759Fc853e6EaE);
    address public immutable TREASURY =
        0xDA4Df6E2121eDaB7c33Ed7FE0f109350939eDA84;
    address public immutable EXPLOITER =
        0x999E025a2a0558c07DBf7F021b2C9852B367e80A;
    uint256 public immutable AMOUNT = 248989400000000000000000000000;
    /// @notice After this timestamp, owner may reclaim remaining ETH and offer expires.
    uint256 public immutable DEADLINE;
    /// @notice Keccak256 of human‑readable terms (e.g., IPFS text) for safe‑harbor / scope.
    bytes32 public immutable TERMS_HASH;

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
     * @param deadline  Expiry timestamp before deal is void and owner (treasury) can withdraw the bounty.
     * @param termsHash keccak256 of public terms text hosted in IPFS
     * @dev   Contract is payable so you can seed the bounty in the deployment tx.
     */
    constructor(uint256 deadline, bytes32 termsHash) payable Ownable(TREASURY) {
        require(deadline > block.timestamp, "bad");
        DEADLINE = deadline;
        TERMS_HASH = termsHash;
    }

    // allow funding contract with ETH bounty after creation
    receive() external payable {}

    /**
     * @notice Pulls KNINE from exploiter to treasury and pays the entire ETH bounty to exploiter.
     * @dev    Requires exploiter to have set allowance >= AMOUNT to this contract.
     *         Reverts if called after deadline.
     */
    function recoverKnine() external {
        require(block.timestamp <= DEADLINE, "expired");
        // TODO: verify we do not need safeERC20
        KNINE.transferFrom(EXPLOITER, TREASURY, AMOUNT); // all-or-nothing pull
        uint256 pay = address(this).balance;
        (bool ok, ) = payable(EXPLOITER).call{value: pay}("");
        require(ok, "pay");
        emit DealFinalized(EXPLOITER, pay, TERMS_HASH);
    }
    
    /**
     * @notice After the deadline, owner (treasury) may reclaim any remaining ETH (offer not taken).
     */
    function ownerWithdraw() external onlyOwner {
        require(block.timestamp > DEADLINE, "early");
        (bool ok, ) = payable(TREASURY).call{value: address(this).balance}("");
        require(ok, "wd");
    }
}
