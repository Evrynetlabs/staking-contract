pragma solidity 0.5.13;


/**
*   @title EvrynetStaking interface
*/
interface IEvrynetStaking {
    function vote(address candidate) external payable;

    function unvote(address candidate, uint256 amount) external;

    function register(address _candidate, address _owner) external;

    function resign(address _candidate) external;
    
    function withdraw(uint256 epoch, address payable destAddress) external returns (bool);

    function withdrawWithIndex(uint256 epoch, uint256 index, address payable destAddress)
        external
        returns (bool);
    function getListCandidates() external view
    returns(address[] memory _candidates, uint[] memory stakes, uint epoch, uint validatorSize, uint minValidatorCap);
}
