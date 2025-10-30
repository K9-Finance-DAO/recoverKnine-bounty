// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ReceiverRevertsOnReceive {
    bool public revertOnReceive = true;

    function setRevertOnReceive(bool enabled) external {
        revertOnReceive = enabled;
    }

    receive() external payable {
        if (revertOnReceive) revert("NOPE");
    }

    function claim() external {
        payable(msg.sender).transfer(address(this).balance);
    }
}
