// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockKnineBlacklistable {
    string public name = "KNINE";
    string public symbol = "KNINE";
    uint8  public decimals = 18;

    address public immutable owner; // set to K9 SAFE in tests
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    mapping(address => bool) public blacklist;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(address _owner) { owner = _owner; }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        require(!blacklist[from], "BLACKLISTED");
        uint256 a = allowance[from][msg.sender];
        require(a >= value, "allowance");
        uint256 b = balanceOf[from];
        require(b >= value, "balance");
        allowance[from][msg.sender] = a - value;
        balanceOf[from] = b - value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
        return true;
    }

    // === Blacklist ===
    function changeBlackStatus(address[] calldata users) external {
        require(msg.sender == owner, "ONLY_OWNER");
        for (uint256 i; i < users.length; i++) {
            address u = users[i];
            blacklist[u] = !blacklist[u]; // toggle like the real interface
        }
    }
}
