pragma solidity 0.5.11;


/*
 * interface for EvrynetStaking
 */
interface IEvrynetStaking {
    function vote(address candidate) external payable;

    function unvote(address candidate, uint256 amount) external;

    // function resign(address _candidate) external;
    function withdraw(uint256 epoch, address payable destAddress) external returns (bool);

    function withdrawWithIndex(uint256 epoch, uint256 index, address payable destAddress)
        external
        returns (bool);
    // function getListCandidates() external view
    // returns(address[] memory _candidates, uint[] memory stakes, uint epoch, uint validatorSize, uint minValidatorCap);
}
