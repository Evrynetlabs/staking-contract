pragma solidity 0.5.13;

import "../IEvrynetStaking.sol";


/**
 *   @title contract to test reentrancy attack
 */
contract ReentrancyAttacker {
    IEvrynetStaking stakingSC;
    uint256 counter;
    uint256 epoch;

    constructor(address _stakingSC) public {
        stakingSC = IEvrynetStaking(_stakingSC);
    }

    function vote(address _candidates) external payable {
        stakingSC.vote.value(msg.value)(_candidates);
    }

    function unvote(address _candidates, uint256 amount) external {
        stakingSC.unvote(_candidates, amount);
    }

    function doubleWithdraw(uint256 _epoch) external {
        counter = 2;
        epoch = _epoch;
        require(stakingSC.withdraw(epoch, address(this)), "withdraw success");
    }

    function() external payable {
        if (counter == 0) return;
        counter--;
        require(stakingSC.withdraw(epoch, address(this)), "withdraw not success");
    }
}
