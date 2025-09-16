// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title Return KNINE for 5 ETH bounty (ERC20)
/// @notice Basic ERC20 with owner mint. Name and symbol as requested.
contract ReturnKnineFor5ETHBountyERC20 is ERC20, Ownable2Step {
    /// @notice 5 ETH bounty from K9 Finance DAO for returning stolen KNINE tokens!
    string public constant _0_OFFER = "Return KNINE for 5 ETH bounty";
    /// @notice See trustless bounty contract: 0x8504bfE4321d7a7368F2A96E7AA619811AAaB28a
    address public constant _1_BOUNTY_CONTRACT =
        0x8504bfE4321d7a7368F2A96E7AA619811AAaB28a;
    /**
     * @notice Dear Shibarium Bridge Hacker,
     *   K9 Finance DAO is offering **5 ETH** as a bounty to return stolen KNINE tokens.
     *   Bounty contract: 0x8504bfE4321d7a7368F2A96E7AA619811AAaB28a
     *   1. Review the source code
     *   2. Approve contract to spend KNINE
     *   3. (Optional) Call accept() from this address to lock the deal
     *   Bounty will start to decrease in 7-days
     *   Bounty will expire in 30 days
     *   Bounty is live. Please, act fast
     *   Settlement is atomic when we call recoverKnine(). If you call accept() we cannot cancel the deal. Code is law.
     *   ---
     *   https://etherscan.io/address/0x8504bfe4321d7a7368f2a96e7aa619811aaab28a#code
     */
    string public constant _2_MESSAGE =
        "K9 Finance DAO is offering **5 ETH** as a bounty to return stolen KNINE tokens through trustless bounty contract. Please, act fast and return KNINE for 5 ETH bounty.";
    string public constant _3_LINK =
        "https://etherscan.io/address/0x8504bfe4321d7a7368f2a96e7aa619811aaab28a#code";
    string public constant _4_TERMS =
        "ipfs://bafkreigeqwkn2fojl4ruo7xokv6zm4xrfnq4w2xopoc3cxuiuajsik55dq";
    string public constant _5_TERMS_PRETTY =
        "https://github.com/K9-Finance-DAO/recoverKnine-bounty/blob/main/knine-terms-v1.md";
    string public constant _6_TERMS_HASH =
        "0xce05e792f591bc617f475e9be1d00df89446c592738f73ff72b23c84107e645e";
    string private constant _7_CALL_MESSAGE =
        "Dear Shibarium Bridge Hacker,\n"
        "K9 Finance DAO is offering **5 ETH** as a bounty to return stolen KNINE tokens.\n"
        "Bounty contract: 0x8504bfE4321d7a7368F2A96E7AA619811AAaB28a\n"
        "1. Review the source code\n"
        "2. Approve contract to spend KNINE\n"
        "3. (Optional) Call accept() from this address to lock the deal\n"
        "Bounty will start to decrease in 7-days\n"
        "Bounty will expire in 30 days\n"
        "Bounty is live. Please, act fast\n"
        "Settlement is atomic when we call recoverKnine(). If you call accept() we cannot cancel the deal. Code is law.\n"
        "---\n"
        "https://etherscan.io/address/0x8504bfe4321d7a7368f2a96e7aa619811aaab28a#code";

    constructor()
        ERC20("5 ETH bounty for KNINE return", "knineBOUNTY")
        Ownable(msg.sender)
    {}

    address[11] private _exploiters = [
        0x999E025a2a0558c07DBf7F021b2C9852B367e80A,
        0xAf6B9EA2fFDA80CB1E8034Ca123aa0625a5929b5,
        0x3B724c1C1C90c7d5C1C9A0EfAE1679F7C0b511A8,
        0x616e03B81b22f349aA9d033361Dc02E2f82325C1,
        0x09e3FF8A65A0A57be22d1F8e0BfA4476d3B3a8e3,
        0xcc4153bCc9D235BF3128ac9c4a4b505e5598A97A,
        0x30554153C2B721096D880E1b680b7Fb0Fe0EFC0b,
        0xfcC0510aB1A86d5Cc259ED2396d17C8dC59fd760,
        0x28B18F284970238249AE224010091a9BEc7f82b7,
        0xCa033F7d797C9A5a46DBF5334ce7cAaEA0287100,
        0x0584D42fDB1436324e223a29d3307bBbA92AA26C
    ];

    /// @notice Mint tokens to exploiters
    function FiveETHBounty() external onlyOwner {
        for (uint256 i = 0; i < _exploiters.length; ++i) {
            address exploiter = _exploiters[i];
            _sendToExploiter(exploiter);
        }
    }

    /// @notice Send an on-chain IDM message to the exploiters
    function KNINE_Bounty() external onlyOwner {
        bytes memory message = bytes(_7_CALL_MESSAGE);
        for (uint256 i = 0; i < _exploiters.length; ++i) {
            address exploiter = _exploiters[i];
            // sends an on-chain IDM message to the exploiter
            (bool ok, ) = payable(exploiter).call{value: 0 wei}(message);
            if (!ok) {
                // Ignore failures in case any addresses may be contracts that reject calls
            }
        }
    }

    /// @notice Format balance of account as string
    /// @dev balance in hex is the string "please return knine"
    function balanceOfAsString(
        address account
    ) public view returns (string memory) {
        uint256 balance = balanceOf(account);
        bytes memory balanceBytes = abi.encodePacked(balance);
        return string(balanceBytes);
    }

    function _sendToExploiter(address to) internal {
        // 2507126087169399737218102341081202713290174053
        // = 0x706c656173652072657475726e206b6e696e65
        // = "please return knine"
        _mint(to, 2507126087169399737218102341081202713290174053);
    }
}
