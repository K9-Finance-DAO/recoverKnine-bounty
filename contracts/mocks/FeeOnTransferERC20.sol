// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice ERC20 mock that charges a fee on transferFrom to simulate fee-on-transfer tokens.
contract FeeOnTransferERC20 {
    string public name = "FeeToken";
    string public symbol = "FEE";
    uint8 public decimals = 18;

    // fee in basis points (1% = 100)
    uint256 public feeBps = 100;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function setFeeBps(uint256 bps) external {
        require(bps <= 10_000, "BPS");
        feeBps = bps;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "ALLOWANCE");
        uint256 bal = balanceOf[from];
        require(bal >= amount, "BALANCE");

        // Apply fee on incoming transfer
        uint256 fee = (amount * feeBps) / 10_000;
        uint256 net = amount - fee;

        unchecked {
            allowance[from][msg.sender] = allowed - amount;
            balanceOf[from] = bal - amount;
            balanceOf[to] += net;
        }
        emit Transfer(from, to, net);
        return true;
    }
}

