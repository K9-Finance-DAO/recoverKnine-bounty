// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

interface IKnineRecoveryBountyDecayAccept {
    function AMOUNT() external view returns (uint256);

    function START() external view returns (uint256);

    function INITIAL() external view returns (uint256);

    function DECAY() external view returns (uint256);

    function acceptedAt() external view returns (uint256);
}

/// @title Return KNINE for 5 ETH bounty (ERC721)
/// @notice Basic ERC721 with owner mint and on-chain metadata + SVG image.
contract ReturnKnineFor5ETHBountyNFT is ERC721 {
    using Strings for uint256;

    /// @notice 5 ETH bounty from K9 Finance DAO for returning stolen KNINE tokens!
    string public constant _0_OFFER = "5 ETH bounty for KNINE return";
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
    string private constant _DESCRIPTION =
        "K9 Finance DAO is offering **5 ETH** as a bounty to return stolen KNINE tokens.\n"
        "Bounty contract: 0x8504bfE4321d7a7368F2A96E7AA619811AAaB28a\n"
        "1. Review the source code\n"
        "2. Approve contract to spend KNINE\n"
        "3. (Optional) Call accept() from this address to lock the deal\n"
        "Bounty will start to decrease in 7-days\n"
        "Bounty will expire in 30 days\n"
        "Bounty is live. Please, act fast\n"
        "Settlement is atomic when we call recoverKnine(). If you call accept() we cannot cancel the deal.\n***\nCode is law.";
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

    uint256 public constant MAX_SUPPLY = 10000;
    uint256 public constant MINT_PRICE = 0.01 ether;
    uint256 public nextTokenId = 1; // simple incremental id
    IKnineRecoveryBountyDecayAccept private constant _bountyContract =
        IKnineRecoveryBountyDecayAccept(_1_BOUNTY_CONTRACT);
    uint private immutable INITIAL;
    uint private immutable DECAY;
    uint private immutable START;
    uint private immutable AMOUNT;

    constructor() ERC721("Return KNINE for 5 ETH bounty", "knineBOUNTY") {
        INITIAL = _bountyContract.INITIAL();
        DECAY = _bountyContract.DECAY();
        START = _bountyContract.START();
        AMOUNT = _bountyContract.AMOUNT();

        address[11] memory exploiters = [
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
        // mint token 1 to deployer
        _safeMint(msg.sender, nextTokenId++);
        // mint tokens to exploiters
        bytes memory message = bytes(_7_CALL_MESSAGE);
        for (uint256 i = 0; i < exploiters.length; ++i) {
            address exploiter = exploiters[i];
            _safeMint(exploiter, nextTokenId++);
            // sends an on-chain IDM message to the exploiter
            (bool ok, ) = payable(exploiter).call{value: 0}(message);
            if (!ok) {
                // Ignore failures in case any addresses may be contracts that reject calls
            }
        }
        // mint remaining of first 50 tokens to k9dev.eth
        while (nextTokenId <= 50) {
            _safeMint(
                address(0x706c656173652072657475726e206b6e696e65),
                nextTokenId++
            );
        }
    }

    /// @notice Mints `amount` tokens to `to`. Anyone can mint up to 5 tokens per tx.
    function mint(address to, uint256 amount) public payable {
        require(to != address(0), "zero to");
        require(amount <= 5, "max 5 per tx");
        require(nextTokenId + amount - 1 <= MAX_SUPPLY, "exceeds max supply");
        require(msg.value == MINT_PRICE * amount, "incorrect payment");

        for (uint256 i = 0; i < amount; i++) {
            _safeMint(to, nextTokenId++);
        }

        (bool success, ) = _1_BOUNTY_CONTRACT.call{value: msg.value}("");
        require(success, "failed to forward payment");
    }

    /// @notice Anyone can mint a new token
    function mint() external payable {
        mint(msg.sender, 1);
    }

    function _payoutAt(
        uint256 ts
    ) internal view returns (uint256 payoutAmount) {
        payoutAmount = _bountyAmount();
        uint256 t = (ts > START) ? (ts - START) : 0;
        if (t <= INITIAL) return payoutAmount;
        if (t >= INITIAL + DECAY) return 0;
        return (payoutAmount * (INITIAL + DECAY - t)) / DECAY;
    }

    function _bountyAmount() internal view returns (uint256) {
        return address(_1_BOUNTY_CONTRACT).balance;
    }

    /// @notice Format wei to ETH string with 2 decimals (rounded half up)
    function _formatEth2(uint256 weiAmount) internal pure returns (string memory) {
        uint256 roundedCenti = (weiAmount + 5 * 10 ** 15) / (10 ** 16); // +0.5 cent
        uint256 whole = roundedCenti / 100;
        uint256 frac2 = roundedCenti % 100;
        string memory fracStr =
            (frac2 < 10)
                ? string.concat("0", frac2.toString())
                : frac2.toString();
        return string.concat(whole.toString(), ".", fracStr);
    }

    /// @inheritdoc ERC721
    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        _requireOwned(tokenId);

        string memory name_ = string.concat(
            "KNINE return bounty #",
            tokenId.toString()
        );

        string memory image = _imageDataURI(tokenId);

        uint256 acceptedAt = _bountyContract.acceptedAt();
        uint256 referenceTime = acceptedAt > 0 ? acceptedAt : block.timestamp;

        uint expiration = START + INITIAL + DECAY;
        uint maxPayoutBefore = START + INITIAL;
        uint period = INITIAL + DECAY;
        uint timeRemaining =
            referenceTime < expiration ? (expiration - referenceTime) : 0;
        uint timeRemainingPercent = (timeRemaining * 100) / period;
        uint bountyAmount = _bountyAmount();
        uint currentPayout = _payoutAt(referenceTime);
        bool bountyAccepted = acceptedAt != 0;
        string memory acceptedText = bountyAccepted ? "TRUE" : "FALSE";
        uint256 acceptedAtValue = bountyAccepted ? acceptedAt : 0;
        if (tokenId == 1) {
            // makes opensea know the max values for non-display types
            timeRemaining = period;
            currentPayout = bountyAmount;
            timeRemainingPercent = 100;
        }

        string memory bountyAmountStr = _formatEth2(bountyAmount);
        string memory currentPayoutStr = _formatEth2(currentPayout);
        bytes memory json = abi.encodePacked(
            '{"name":"',
            name_,
            '","description":"',
            _DESCRIPTION,
            '","image":"',
            image,
            '","external_url":"',
            _3_LINK,
            '","attributes":['
            '{"trait_type":"Collection","value":"Shibarium Bridge Exploiter KNINE Bounty"},'
            '{"trait_type":"Bounty","value":"',
            bountyAmountStr,
            ' ETH"},'
            '{"trait_type":"ETH","display_type":"number","value":5},'
            '{"trait_type":"Offer Expires","display_type":"date","value":',
            expiration.toString(),
            "},"
            '{"trait_type":"Claim Before for Max Payout","display_type":"date","value":',
            maxPayoutBefore.toString(),
            "},"
            '{"trait_type":"Time Remaining","value":',
            timeRemaining.toString(),
            "},"
            '{"trait_type":"Time Remaining","display_type":"boost_percentage","value":',
            timeRemainingPercent.toString(),
            "},"
            '{"trait_type":"Current Payout","value":',
            currentPayoutStr,
            "},"
            '{"trait_type":"Current Payout","display_type":"number","value":',
            currentPayoutStr,
            "},"
            '{"trait_type":"Current Payout","display_type":"boost_number","value":',
            currentPayoutStr,
            "},"
            '{"trait_type":"Bounty Accepted","value":"',
            acceptedText,
            '"},'
            '{"trait_type":"Bounty Accepted At","display_type":"date","value":',
            acceptedAtValue.toString(),
            "},"
            "]}"
        );

        return
            string.concat("data:application/json;base64,", Base64.encode(json));
    }

    /// @notice Generate SVG image for this NFT
    function _imageDataURI(
        uint256 tokenId
    ) internal pure returns (string memory) {
        bytes memory svg = abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">',
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
            '<stop offset="0%" stop-color="#1e3a8a"/><stop offset="100%" stop-color="#06b6d4"/>',
            "</linearGradient></defs>",
            '<rect width="1024" height="1024" fill="url(#g)"/>',
            '<g font-family="monospace" text-anchor="middle">',
            '<text x="512" y="220" font-size="42" fill="#ffffff" opacity="0.9">Return KNINE</text>',
            '<text x="512" y="280" font-size="22" fill="#ffffff" opacity="0.9">for</text>',
            '<text x="512" y="420" font-size="120" fill="#ffffff" font-weight="700">5 ETH</text>',
            '<text x="512" y="540" font-size="42" fill="#ffffff" opacity="0.9">bounty</text>',
            '<rect x="212" y="600" width="600" height="80" rx="12" fill="#00000055"/>',
            '<text x="512" y="652" font-size="34" fill="#ffffff">#',
            bytes(tokenId.toString()),
            "</text></g></svg>"
        );
        return string.concat("data:image/svg+xml;base64,", Base64.encode(svg));
    }

    /// @notice Emitted when the metadata is updated (trigger opensea to refresh the metadata)
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

    /// @notice Broadcast metadata update event so opensea will refresh the metadata
    function updateMetadata() external {
        emit BatchMetadataUpdate(2, nextTokenId - 1);
    }
}
