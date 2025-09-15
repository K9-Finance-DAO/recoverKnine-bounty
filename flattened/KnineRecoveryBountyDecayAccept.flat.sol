// Sources flattened with hardhat v3.0.6 https://hardhat.org

/*

TermsURI: ipfs://bafkreigeqwkn2fojl4ruo7xokv6zm4xrfnq4w2xopoc3cxuiuajsik55dq
Helper DApp: 
 _  _____    _____ _                              ____    _    ___  
| |/ / _ \  |  ___(_)_ __   __ _ _ __   ___ ___  |  _ \  / \  / _ \ 
| ' / (_) | | |_  | | '_ \ / _` | '_ \ / __/ _ \ | | | |/ _ \| | | |
| . \\__, | |  _| | | | | | (_| | | | | (_|  __/ | |_| / ___ \ |_| |
|_|\_\ /_/  |_|   |_|_| |_|\__,_|_| |_|\___\___| |____/_/   \_\___/ 

 ____  _     ___   _     ___   _  _____  ____  ___        
| |_  \ \_/ | |_) | |   / / \ | |  | |  | |_  | |_)       
|_|__ /_/ \ |_|   |_|__ \_\_/ |_|  |_|  |_|__ |_| \       
 ___   ___   _     _     _____  _                         
| |_) / / \ | | | | |\ |  | |  \ \_/                      
|_|_) \_\_/ \_\_/ |_| \|  |_|   |_|   
                   

             ██▓▒░░░░░░░░▒▓██             
          █▒░   ░▒▒▒▓▓▒▒▒░░  ░▒██         
       ▓▓░ ░▒▓▓▒░░░░░░░░░░▒▓▓▒░ ░▓█       
     █▓░ ░▓▓░░   ░░░░░▒░░░  ░░▒▓░ ░▓█     
    █░ ░▓▒░   ░░▒▓▒░░░░▒▓▒░░   ░▒▓▒ ▒▓    
   ▓░ ▓▓░   ░░▒▓▓▒▓▓▒▒▓▓▒▓▓▒░░   ░▓▓░░▓█  
 █▒░░▓▒░  ░░░▒▓░ ░░▒▓▓  ░░▒▓▒░░░  ░▒▓░░▓█ 
 ▓░░▓▒░ ░░▒▓▓▒▓ ░░░░▓▓ ░░░▒▓▒▒▓▒░░ ░▒▓░▒▓ 
█▒ ▒▓░░░░▒▓▓▓▓▓░░░░░▓▓ ░░░▒▓▓▓▓▓▒░░░░▒▒░▓▓
▓░░▓▒░░░▒▓░ ░░▓▓▒▒▒▓▓▓▒▒▒▓▓▒ ░░▒▓▒░░░▒▓░▒▓
▓ ░▓░░░░▒▓░░░░▒▓█▓█▓▒▓▓█▓█▓ ░░░▒▓▒░░░░▓░░▓
▓ ░▓▒░░▒░▓░░░░▒▓█▓░   ░▒▓█▓░░░░▒▓▒▒░░▒▓░░▓
▓ ░▓▒░▒░░▓▓▒▒▒▓▓▒  ░░░░░▒▓▓▒▒▒▓▓▓░░▒▒▒▓░░▓
▓░░▓▒░░░░░▒▓▓█▓░ ░░░░░░░░░▓▓█▓▓▓░░░░░▒▓░▒▓
▓▒ ▒▓▒░░░░░▒▓▒  ░▓▓▒░▒▓▒▒░░▒▓▓▒░░░░░▒▓▒░▓▓
 ▓░░▓▓▒░░░▒▓▒ ░░░▒▒▓▒░▒▓▒░░░▒▓▓▒░░░▒▒▓░▒▓ 
 █▓░░▓▓▒░░▒▓▓░░░░░░░░░░░░░░▒▒▓▓▒░░▒▓▓░░▓█ 
  █▓░░▓▓▒▒░▒▓█▓▒▓▓▓█▓█▓▓▓▓▒▓█▓▒░▒▒▓▓░░▓█  
    ▓▒░░▓▓▒▒▒▒▓▓▓▓▒▒▒▒▒▒▓▓▓▓▒▒▒▒▓▓▒ ▒▓    
     █▓▒░░▓▓▓▒▒▒░░░▒░░▒░░▒▒▒▒▓▓▓▒░▒▓█     
       █▓▒░░▒▓▓▓▓▓▒▒▓▓▒▒▒▓▓▓▓▒░░▒▓▓       
         ▓▓▓▒░░░░▒▒▓▓▓▓▒▒░░░░▒▓▓█         
             ██▓▓▓▒▒▒▒▒▒▓▓▓██         

*/
// SPDX-License-Identifier: MIT

// File contracts/KnineRecoveryBountyDecayAccept.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title   KnineRecoveryBountyDecayAccept
 * @author  Shima @ K9 Finance DAO
 * @notice  Adds `accept()` so the exploiter can freeze the decay once they are ready:
 *          - `accept()` requires allowance >= AMOUNT, and records `acceptedAt`.
 *          - `recoverKnine()` pays using the frozen time (or now if not accepted), then finalizes.
 *          - `withdrawToTreasury()` is blocked if `acceptedAt>0` AND exploiter still has allowance+balance (prevents reneging).
 *
 * TermsURI: ipfs://bafkreigeqwkn2fojl4ruo7xokv6zm4xrfnq4w2xopoc3cxuiuajsik55dq
 */
contract KnineRecoveryBountyDecayAccept {
    string public constant IPFS_TERMS_URI =
        "ipfs://bafkreigeqwkn2fojl4ruo7xokv6zm4xrfnq4w2xopoc3cxuiuajsik55dq";

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
        require(
            KNINE.transferFrom(EXPLOITER, TREASURY, AMOUNT),
            "TRANSFER_FAIL"
        );

        if (KNINE.balanceOf(TREASURY) < balStart + AMOUNT) {
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
            if (
                KNINE.allowance(EXPLOITER, address(this)) >= AMOUNT &&
                KNINE.balanceOf(EXPLOITER) >= AMOUNT
            ) {
                revert("LOCKED_BY_ACCEPT");
            }
        }
        (bool ok, ) = payable(TREASURY).call{value: address(this).balance}("");
        require(ok, "WITHDRAW_FAIL");
    }
}


// File npm/@openzeppelin/contracts@5.4.0/token/ERC20/IERC20.sol

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (token/ERC20/IERC20.sol)

pragma solidity >=0.4.16;

/**
 * @dev Interface of the ERC-20 standard as defined in the ERC.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the value of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the value of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the
     * allowance mechanism. `value` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

