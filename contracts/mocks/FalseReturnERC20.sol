// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice ERC20-like that returns false for transferFrom and does not move balances.
/// Used to test delta guard in bounty contract.
contract FalseReturnERC20 {
    string public name = "FalseRet";
    string public symbol = "FRET";
    uint8 public decimals = 18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(
        address /* from */,
        address /* to */,
        uint256 /* amount */
    ) external pure returns (bool) {
        // Does nothing and returns false
        return false;
    }
}
