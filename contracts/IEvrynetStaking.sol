pragma solidity 0.5.11;

/*
* interface for EvrynetStaking
*/
interface IEvrynetStaking {
    function vote(address candidate) external payable;
    function unvote(address candidate, uint amount) external;
    // function resign(address _candidate) external;
    function withdraw(uint epoch, address payable destAddress) external returns(bool);
    // function withdrawWithIndex(uint epoch, uint index) external returns(bool);
    // function getListCandidates() external view
        // returns(address[] memory _candidates, uint[] memory stakes, uint epoch, uint validatorSize, uint minValidatorCap);
}