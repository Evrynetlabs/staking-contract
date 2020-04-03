pragma solidity 0.5.13;

import "../EvrynetStaking.sol";


/**
 *   @title Mockcontract for testing reentrancy attack
 */
contract MockEvrynetStaking is EvrynetStaking {
    constructor(
        address[] memory _candidates,
        address[] memory candidateOwners,
        uint256 _epochPeriod,
        uint256 _startBlock,
        uint256 _maxValidatorSize,
        uint256 _minValidatorStake,
        uint256 _minVoteCap,
        address _admin
    ) public EvrynetStaking(_candidates, candidateOwners, _epochPeriod, _startBlock, _maxValidatorSize, _minValidatorStake, _minVoteCap, _admin) {}

    function withdraw(uint256 epoch, address payable destAddress) external nonReentrant returns (bool) {
        uint256 curEpoch = getCurrentEpoch();
        require(curEpoch >= epoch, "can not withdraw for future epoch");
        address payable sender = msg.sender;

        uint256 amount = withdrawsState[sender].caps[epoch];
        require(amount > 0, "withdraw cap is 0");
        // transfer funds back to destAddress
        (bool success, ) = destAddress.call.value(amount)("");
        require(success, "send value not success");
        withdrawsState[sender].caps[epoch] = 0;
        return true;
    }
}
