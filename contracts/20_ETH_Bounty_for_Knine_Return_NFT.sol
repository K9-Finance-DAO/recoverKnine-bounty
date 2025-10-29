// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC4906} from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IKnineRecoveryBountyDecayAcceptMultiFunder {
    function AMOUNT() external view returns (uint256);

    function START() external view returns (uint256);

    function INITIAL() external view returns (uint256);

    function DECAY() external view returns (uint256);

    function acceptedAt() external view returns (uint256);

    function IPFS_TERMS_URI() external view returns (string memory);

    function TERMS_HASH() external view returns (bytes32);

    function refundsEnabled() external view returns (bool);

    function refundSnapshot() external view returns (uint256);
}

/// @title Return KNINE for 20 ETH bounty (ERC721)
/// @notice ERC721 with on-chain metadata that mirrors the live multi-funder bounty contract.
contract ReturnKnineFor20ETHBountyNFT is ERC721, Ownable2Step, IERC4906 {
    using Strings for uint256;

    /// @notice 20 ETH bounty from K9 Finance DAO for returning stolen KNINE tokens.
    string public constant _0_OFFER = "20 ETH bounty for KNINE return";
    /// @notice Message suitable for off-chain surfaces.
    string public constant _2_MESSAGE =
        "K9 Finance DAO is offering **20 ETH** as a bounty to return stolen KNINE tokens through a trustless bounty contract. Please, act fast and return KNINE for 20 ETH bounty.";
    /// @notice Human-readable terms summary link.
    string public constant _5_TERMS_PRETTY =
        "https://github.com/K9-Finance-DAO/recoverKnine-bounty/blob/main/knine-terms-v1.md";

    /// @notice Address of the live trustless bounty contract.
    address public immutable _1_BOUNTY_CONTRACT;
    /// @notice External URL (Etherscan) pointing at the bounty contract source.
    string public _3_LINK;
    /// @notice IPFS terms URI echoed from the bounty contract.
    string public _4_TERMS;
    /// @notice Hex string of the keccak256 terms hash.
    string public _6_TERMS_HASH;

    uint256 public constant MAX_SUPPLY = 1000;
    uint256 public constant MINT_PRICE = 0.1 ether;
    uint256 public nextTokenId = 1; // simple incremental id

    IKnineRecoveryBountyDecayAcceptMultiFunder
        private immutable _bountyContract;
    uint private immutable INITIAL;
    uint private immutable DECAY;
    uint private immutable START;
    uint private immutable AMOUNT;

    constructor(
        IKnineRecoveryBountyDecayAcceptMultiFunder bountyContract_
    )
        ERC721("Return KNINE for 20 ETH bounty", "knineBOUNTY")
        Ownable(msg.sender)
    {
        address bountyAddress = address(bountyContract_);
        require(bountyAddress != address(0), "zero bounty");

        _bountyContract = bountyContract_;
        _1_BOUNTY_CONTRACT = bountyAddress;
        INITIAL = bountyContract_.INITIAL();
        DECAY = bountyContract_.DECAY();
        START = bountyContract_.START();
        AMOUNT = bountyContract_.AMOUNT();

        _4_TERMS = bountyContract_.IPFS_TERMS_URI();
        _6_TERMS_HASH = Strings.toHexString(
            uint256(bountyContract_.TERMS_HASH()),
            32
        );
        _3_LINK = string.concat(
            "https://etherscan.io/address/",
            _toHexString(bountyAddress),
            "#code"
        );

        // Mint token #1 to deployer as proof of deployment.
        _safeMint(msg.sender, nextTokenId++);
    }

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

    /// @notice Mint tokens to exploiter addresses plus fill early IDs for 20-eth-bounty.k9dev.eth.
    function TwentyETHBounty() external onlyOwner {
        for (uint256 i = 0; i < _exploiters.length; ++i) {
            _safeMint(_exploiters[i], nextTokenId++);
        }
        while (nextTokenId <= 40) {
            _safeMint(
                address(0xe211BB521Fc06238535F02fDC264351A071Df142),
                nextTokenId++
            );
        }
    }

    /// @notice Mints `amount` tokens and forwards the payment to the bounty contract.
    /// @dev Anyone can mint up to 5 tokens per tx. Cost 0.01 ETH per token.
    function mint(address to, uint256 amount) public payable {
        require(to != address(0), "zero to");
        require(amount <= 5, "max 5 per tx");
        require(nextTokenId + amount - 1 <= MAX_SUPPLY, "exceeds max supply");
        require(msg.value == MINT_PRICE * amount, "cost 0.01 ETH per token");

        for (uint256 i = 0; i < amount; i++) {
            _safeMint(to, nextTokenId++);
        }

        (bool success, ) = _1_BOUNTY_CONTRACT.call{value: msg.value}("");
        require(success, "failed to forward payment");
    }

    /// @notice Convenience mint for a single token sent to the caller.
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

    /// @notice Format wei to ETH string with 2 decimals (rounded half up).
    function _formatEth2(
        uint256 weiAmount
    ) internal pure returns (string memory) {
        uint256 roundedCenti = (weiAmount + 5 * 10 ** 15) / (10 ** 16); // +0.5 cent
        uint256 whole = roundedCenti / 100;
        uint256 frac2 = roundedCenti % 100;
        string memory fracStr = (frac2 < 10)
            ? string.concat("0", frac2.toString())
            : frac2.toString();
        return string.concat(whole.toString(), ".", fracStr);
    }

    /// @inheritdoc ERC721
    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        _requireOwned(tokenId);

        uint256 acceptedAt = _bountyContract.acceptedAt();
        uint256 referenceTime = acceptedAt > 0 ? acceptedAt : block.timestamp;

        uint256 period = INITIAL + DECAY;
        uint256 timeRemaining = referenceTime < (START + period)
            ? ((START + period) - referenceTime)
            : 0;
        uint256 timeRemainingPercent = period > 0
            ? (timeRemaining * 100) / period
            : 0;
        uint256 bountyAmount = _bountyAmount();
        uint256 currentPayout = _payoutAt(referenceTime);
        bool bountyAccepted = acceptedAt != 0;
        if (tokenId == 1) {
            // Hint marketplaces about max values for trait scaling.
            timeRemaining = period;
            currentPayout = bountyAmount;
            timeRemainingPercent = 100;
        }

        bool refundsEnabled = _bountyContract.refundsEnabled();
        uint256 refundSnapshot = refundsEnabled
            ? _bountyContract.refundSnapshot()
            : 0;

        string memory bountyAmountStr = _formatEth2(bountyAmount);
        string memory currentPayoutStr = _formatEth2(currentPayout);
        string memory refundSnapshotStr = _formatEth2(refundSnapshot);
        string memory knineAmountStr = AMOUNT.toString();

        bytes memory attributes = abi.encodePacked(
            '{"trait_type":"Collection","value":"Shibarium Bridge Exploiter KNINE Bounty"},'
            '{"trait_type":"Bounty","value":"',
            bountyAmountStr,
            ' ETH"},'
            '{"trait_type":"Offer Expires","display_type":"date","value":',
            (START + INITIAL + DECAY).toString(),
            "},"
            '{"trait_type":"Claim Before for Max Payout","display_type":"date","value":',
            (START + INITIAL).toString(),
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
            '{"trait_type":"KNINE Amount (wei)","display_type":"number","value":',
            knineAmountStr,
            "},"
            '{"trait_type":"Bounty Accepted","value":"',
            bountyAccepted ? "TRUE" : "FALSE",
            '"},'
            '{"trait_type":"Terms URI","value":"',
            _4_TERMS,
            '"}'
        );

        if (refundsEnabled) {
            attributes = abi.encodePacked(
                attributes,
                ',{"trait_type":"Refund Snapshot","value":"',
                refundSnapshotStr,
                ' ETH"}'
            );
        }

        attributes = abi.encodePacked(
            attributes,
            ',{"trait_type":"Refunds Enabled","value":"',
            refundsEnabled ? "TRUE" : "FALSE",
            '"}'
        );

        bytes memory json = abi.encodePacked(
            '{"name":"KNINE return bounty #',
            tokenId.toString(),
            '","description":"',
            _description(),
            '","image":"',
            _imageDataURI(tokenId),
            '","external_url":"',
            _3_LINK,
            '","attributes":[',
            attributes,
            "]}"
        );

        return
            string.concat("data:application/json;base64,", Base64.encode(json));
    }

    /// @notice Generate SVG image for this NFT.
    function _imageDataURI(
        uint256 tokenId
    ) internal pure returns (string memory) {
        bytes memory svg = abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">',
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
            '<stop offset="0%" stop-color="#DD3021"/><stop offset="100%" stop-color="#F3A73D"/>',
            "</linearGradient></defs>",
            '<rect width="1024" height="1024" fill="url(#g)"/>',
            '<g font-family="monospace" text-anchor="middle">',
            '<text x="512" y="220" font-size="42" fill="#ffffff" opacity="0.9">Return KNINE</text>',
            '<text x="512" y="280" font-size="22" fill="#ffffff" opacity="0.9">for</text>',
            '<text x="512" y="420" font-size="120" fill="#ffffff" font-weight="700">20 ETH</text>',
            '<text x="512" y="540" font-size="42" fill="#ffffff" opacity="0.9">bounty</text>',
            '<rect x="212" y="600" width="600" height="80" rx="12" fill="#00000055"/>',
            '<text x="512" y="652" font-size="34" fill="#ffffff">#',
            bytes(tokenId.toString()),
            "</text></g></svg>"
        );
        return string.concat("data:image/svg+xml;base64,", Base64.encode(svg));
    }

    function _description() internal view returns (string memory) {
        return
            string.concat(
                "K9 Finance DAO is offering **20 ETH** as a bounty to return stolen KNINE tokens.\\n",
                "Bounty contract: ",
                _toHexString(_1_BOUNTY_CONTRACT),
                "\\n1. Review the source code\\n",
                "2. Approve contract to spend KNINE\\n",
                "3. (Optional) Call accept() from the exploiter address to lock the deal\\n",
                "Bounty decays linearly after the initial window and expires once timeRemaining hits zero.\\n",
                "Terms: ",
                _4_TERMS,
                "\\nSettlement is atomic via recoverKnine().\\n***\\nCode is law."
            );
    }

    function _toHexString(
        address account
    ) internal pure returns (string memory) {
        return Strings.toHexString(uint256(uint160(account)), 20);
    }

    /// @notice Broadcast metadata update events so marketplaces refresh metadata.
    function updateMetadata(uint256 id) external {
        if (id == 0) {
            if (nextTokenId > 1) {
                emit BatchMetadataUpdate(1, nextTokenId - 1);
            }
        } else {
            emit MetadataUpdate(id);
        }
    }

    /// @notice Total minted supply (lightweight alternative to ERC721Enumerable).
    function totalSupply() external view returns (uint256) {
        return nextTokenId - 1;
    }

    /// @inheritdoc ERC721
    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, IERC165) returns (bool) {
        return
            interfaceId == type(IERC4906).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
