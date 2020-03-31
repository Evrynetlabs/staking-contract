pragma solidity 0.5.13;


/**
 *   @title EvrynetStaking interface
 */
interface IEvrynetStaking {
    /**
     * @dev vote for a candidate, amount of EVRY token is msg.value
     * @param candidate address of candidate to vote for
     */
    function vote(address candidate) external payable;

    /**
     * @dev unvote for a candidate
     * With voter, the amount of EVRY token to withdraw must either unvote full stake amount or remain amount >= min voter cap
     * With owner, remain amount >= min validator cap
     * @param candidate address of candidate to vote for
     * @param amount amount to withdraw/unvote
     */
    function unvote(address candidate, uint256 amount) external;

    /**
     * @dev register a new candidate, only can call by admin
     * @param _candidate address of candidate to vote for
     * @param _owner owner of the candidate
     */
    function register(address _candidate, address _owner) external;

    /**
     * @dev resign a candidate, only called by owner of that candidate
     * When a candidate resigns, at least minValidatorStake will be locked
     * After CANDIDATE_LOCKING_PERIOD epochs, candidate can withdraw
     * @param _candidate address of candidate to resigned
     */
    function resign(address _candidate) external;

    /**
     * @dev withdraw locked funds
     * @param epoch withdraw all locked funds from this epoch
     * @param destAddress address of destination is transfered
     */
    function withdraw(uint256 epoch, address payable destAddress) external returns (bool);

    /**
     * @dev withdraw locked funds
     * @param epoch withdraw all locked funds from this epoch
     * @param destAddress address of destination is transfered
     * @param index the position of epoch index in withdrawsState array
     */
    function withdrawWithIndex(uint256 epoch, uint256 index, address payable destAddress) external returns (bool);

    /**
     * @dev get the basic info for calculate the next candidates list
     * Return list of candidates with stakes data, current epoch, max validator size and min cap to be a validtor
     */
    function getListCandidates()
        external
        view
        returns (address[] memory _candidates, uint256[] memory stakes, uint256 epoch, uint256 validatorSize, uint256 minValidatorCap);

    /**
     * @dev Emitted when a candidate is voted
     */
    event Voted(address voter, address candidate, uint256 amount);

    /**
     * @dev Emitted when a candidate is unvoted
     */
    event Unvoted(address voter, address candidate, uint256 amount);

    /**
     * @dev Emitted when a new candidate is registered
     */
    event Registered(address candidate, address owner);

    /**
     * @dev Emitted when a new candidate is resign
     */
    event Resigned(address _candidate, uint256 _epoch);

    /**
     * @dev Emitted when staker withdraw Evry token from staking contract
     */
    event Withdraw(address _staker, uint256 _amount, address _destAddress);
}
