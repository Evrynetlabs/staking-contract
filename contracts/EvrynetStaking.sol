pragma solidity 0.5.11;

import "./IEvrynetStaking.sol";

/**
 * @title Helps contracts guard against reentrancy attacks.
 */
contract ReentrancyGuard {

    /// @dev counter to allow mutex lock with only one SSTORE operation
    uint256 private guardCounter = 1;

    /**
     * @dev Prevents a function from calling itself, directly or indirectly.
     * Calling one `nonReentrant` function from
     * another is not supported. Instead, you can implement a
     * `private` function doing the actual work, and an `external`
     * wrapper marked as `nonReentrant`.
     */
    modifier nonReentrant() {
        guardCounter += 1;
        uint256 localCounter = guardCounter;
        _;
        require(localCounter == guardCounter, "Reentrant");
    }
}

/**
 * Math operations with safety checks
 */
library SafeMath {
    function mul(uint a, uint b) internal pure returns (uint) {
        uint c = a * b;
        require(a == 0 || c / a == b);
        return c;
    }

    function div(uint a, uint b) internal pure returns (uint) {
        require(b > 0);
        uint c = a / b;
        require(a == b * c + a % b);
        return c;
    }

    function sub(uint a, uint b) internal pure returns (uint) {
        require(b <= a);
        return a - b;
    }

    function add(uint a, uint b) internal pure returns (uint) {
        uint c = a + b;
        require(c >= a);
        return c;
    }

    function max(uint a, uint b) internal pure returns (uint) {
        return a >= b ? a : b;
    }

    function min(uint a, uint b) internal pure returns (uint) {
        return a < b ? a : b;
    }
}


contract EvrynetStaking is ReentrancyGuard, IEvrynetStaking {

    using SafeMath for uint;

    // maximum number of candidates
    uint constant internal MAX_CANDIDATES = 128;
    // 2 epochs
    uint constant internal CANDIDATE_LOCKING_PERIOD = 2;
    uint constant internal VOTER_LOCKING_PERIOD = 2;

    struct CandidateData {
        bool isCandidate;
        uint totalStake;
        address owner;
        // voter's stakes for each epoch
        mapping(address => uint) voterStake;
    }

    struct WithdrawState {
        // withdrawal cap for each epoch
        mapping(uint => uint) caps;
        // list of epochs voter can withdraw
        uint[] epochs;
    }

    mapping(address => WithdrawState) withdrawsState;

    // list voters of a candidate
    mapping(address => address[]) public candidateVoters;

    mapping(address => CandidateData) public candidateData;
    address[] public candidates;

    uint public startBlock;
    uint public epochPeriod;

    uint public maxValidatorSize;
    uint public minValidatorStake; // min (own) stake to be a validator
    uint public minVoterCap;

    address public admin;

    modifier onlyAdmin {
        require(msg.sender == admin, "ADMIN ONLY");
        _;
    }

    modifier onlyActiveCandidate(address candidate) {
        require(candidateData[candidate].isCandidate == true, "only active candidate");
        _;
    }

    modifier onlyNotCandidate(address candidate) {
        require(candidateData[candidate].isCandidate == false, "only not active candidate");
        _;
    }

    modifier onlyCandidateOwner(address candidate) {
        require(candidateData[candidate].owner == msg.sender, "not owner");
        _;
    }

    modifier onlyValidVoteCap {
        require(msg.value >= minVoterCap, "low vote amout");
        _;
    }

    /**
    * @dev check if sender can unvote with amount _cap
    * @dev _cap must be positive, not greater than current voter's stake
    * @dev if voter is owner of the _candidate, remaing amt must not be less than minValidatorStake
    */
    modifier onlyValidUnvoteAmount (address _candidate, uint256 _cap) {
        require(_cap > 0, "_cap should be positive");
        address voter = msg.sender;
        uint voterStake = candidateData[_candidate].voterStake[voter];
        require(voterStake >= _cap, "not enough to unvote");
        if (candidateData[_candidate].owner == voter) {
            require(voterStake.sub(_cap) >= minValidatorStake, "new stakes < minValidatorStake");
        } else {
            // normal voter, remaining amount should be either 0 or >= minVoterCap
            uint remainAmt = voterStake.sub(_cap);
            require(remainAmt == 0 || remainAmt >= minVoterCap, "invalid unvote amt");
        }
        _;
    }

     /**
     * @dev this list candidates should be the validators for epoch
     * @dev other validators should be added after deployed
     * @param _candidates list of initial candidates
     * @param candidateOwners owners of list candidates above
     * @param _epochPeriod number of blocks for each epoch
     * @param _startBlock start block of epoch 0
     * @param _maxValidatorSize number of validators for consensus
     * @param _minValidatorStake minimum owner's stake to make the candidate valid to be a validator
     * @param _minVoteCap minimum amount for each vote
    */
    constructor(
        address[] memory _candidates,
        address[] memory candidateOwners,
        uint _epochPeriod,
        uint _startBlock,
        uint _maxValidatorSize,
        uint _minValidatorStake,
        uint _minVoteCap,
        address _admin) public
    {
        require(_epochPeriod > 0, "epoch must be positive");
        require(_candidates.length == candidateOwners.length, "length not match");

        epochPeriod = _epochPeriod;
        maxValidatorSize = _maxValidatorSize;
        minValidatorStake = _minValidatorStake;
        minVoterCap = _minVoteCap;

        require(_maxValidatorSize >= _candidates.length, "invalid _maxValidatorSize");

        candidates = _candidates;
        for(uint i = 0; i < _candidates.length; i++) {
            candidateData[_candidates[i]] = CandidateData({
                isCandidate: true,
                owner: candidateOwners[i],
                totalStake: _minValidatorStake
            });
            candidateData[_candidates[i]].voterStake[candidateOwners[i]] = _minValidatorStake;
            candidateVoters[_candidates[i]].push(candidateOwners[i]);
        }

        admin = _admin;
        startBlock = _startBlock;
    }

    function () external payable {}

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "ADMIN 0");
        admin = newAdmin;
    }

    function updateMinValidateStake(uint _newCap) external onlyAdmin {
        minValidatorStake = _newCap;
    }

    function updateMinVoteCap(uint _newCap) external onlyAdmin {
        minVoterCap = _newCap;
    }

    event Voted(address voter, address candidate, uint amount);

    /**
     * @dev vote for a candidate, amount of EVRY token is msg.value
     * @param candidate address of candidate to vote for
    */
    function vote(address candidate) external payable onlyValidVoteCap onlyActiveCandidate(candidate) {
        uint amount = msg.value;
        address voter = msg.sender;

        if (candidateData[candidate].voterStake[voter] == 0) {
            // push new voter to list
            candidateVoters[candidate].push(voter);
        }

        candidateData[candidate].voterStake[voter] = candidateData[candidate].voterStake[voter].add(amount);
        candidateData[candidate].totalStake = candidateData[candidate].totalStake.add(amount);

        emit Voted(voter, candidate, amount);
    }

    event Unvoted(address voter, address candidate, uint amount);

    /**
     * @dev unvote for a candidate, amount of EVRY token to withdraw from this candidate
     * @dev must either unvote full stake amount or remain amount >= min voter cap
     * @param candidate address of candidate to vote for
     * @param amount amount to withdraw/unvote
    */
    function unvote(address candidate, uint amount) external nonReentrant onlyValidUnvoteAmount(candidate, amount) {
        uint curEpoch = getCurrentEpoch();
        address voter = msg.sender;

        candidateData[candidate].voterStake[voter] = candidateData[candidate].voterStake[voter].sub(amount);

        candidateData[candidate].totalStake = candidateData[candidate].totalStake.sub(amount);

        // refund after delay X epochs
        uint withdrawEpoch = curEpoch.add(VOTER_LOCKING_PERIOD);
        withdrawsState[voter].caps[withdrawEpoch] = withdrawsState[voter].caps[withdrawEpoch].add(amount);
        // TODO: Check if withdrawEpoch already exists in the array
        withdrawsState[voter].epochs.push(withdrawEpoch);

        emit Unvoted(voter, candidate, amount);
    }

    event Registered(address candidate, address owner);

    /**
     * @dev register a new candidate, only can call by admin
     * @dev if a candidate has been registered, then resigned and re-register,
     * @dev the stakes of voters are remained the same.
     * @param _candidate address of candidate to vote for
     * @param _owner owner of the candidate
    */
    function register(address _candidate, address _owner) external onlyAdmin onlyNotCandidate(_candidate) {
        require(_candidate != address(0), "_candidate address is missing");
        require(_owner != address(0), "_owner address is missing");

        uint curTotalStake = candidateData[_candidate].totalStake;

        require(candidates.length < MAX_CANDIDATES, "too many candidates");
        // not current candidate
        candidateData[_candidate] = CandidateData({
            owner: _owner,
            isCandidate: true,
            totalStake: curTotalStake
        });
        candidates.push(_candidate);
        candidateVoters[_candidate].push(_owner);

        emit Registered(_candidate, _owner);
    }

    event Resigned(address _candidate, uint _epoch);

    /**
     * @dev resign a candidate, only called by owner of that candidate
     * @dev when a candidate resigns, at least minValidatorStake will be locked
     * @dev after CANDIDATE_LOCKING_PERIOD epochs candidate can withdraw
     * @param _candidate address of candidate to resigned
    */
    function resign(address _candidate) external onlyActiveCandidate(_candidate) onlyCandidateOwner(_candidate) {
        address payable owner = msg.sender;

        uint curEpoch = getCurrentEpoch();

        // remove from candidate list
        for(uint i = 0; i < candidates.length; i++) {
            if (candidates[i] == _candidate) {
                candidates[i] = candidates[candidates.length - 1];
                delete candidates[candidates.length - 1];
                candidates.length--;
                break;
            }
        }

        candidateData[_candidate].isCandidate = false;

        uint ownerStake = candidateData[_candidate].voterStake[owner];
        candidateData[_candidate].voterStake[owner] = 0;

        candidateData[_candidate].totalStake = candidateData[_candidate].totalStake.sub(ownerStake);

        // locked this fund for few epochs
        uint unlockEpoch = curEpoch.add(CANDIDATE_LOCKING_PERIOD);
        withdrawsState[owner].caps[unlockEpoch] = withdrawsState[owner].caps[unlockEpoch].add(ownerStake);
        // TODO: Check if unlockEpoch exists in the array
        withdrawsState[owner].epochs.push(unlockEpoch);

        emit Resigned(_candidate, curEpoch);
    }

    event Withdraw(address _staker, uint _amount);

    /**
     * @dev withdraw locked funds
     * @param epoch withdraw all locked funds from this epoch
     * @param destAddress address of destination is transfered
    */
    function withdraw(uint epoch, address payable destAddress) external nonReentrant returns(bool) {
        uint curEpoch = getCurrentEpoch();
        require(curEpoch >= epoch, "can not withdraw for future epoch");

        address payable sender = msg.sender;

        uint amount = withdrawsState[sender].caps[epoch];
        withdrawsState[sender].caps[epoch] = 0;

        // TODO: Can call delete epocsh data here if array length is small

        require(amount > 0, "withdraw cap is 0");

        // transfer funds back to destAddress
        destAddress.transfer(amount);

        return true;
    }

    function withdrawWithIndex(uint epoch, uint index, address payable destAddress) external nonReentrant returns(bool) {
        uint curEpoch = getCurrentEpoch();
        require(curEpoch >= epoch, "can not withdraw for future epoch");

        address payable sender = msg.sender;

        require(withdrawsState[sender].epochs[index] == epoch, "not correct index");

        uint amount = withdrawsState[sender].caps[epoch];
        require(amount > 0, "withdraw cap is 0");

        delete withdrawsState[sender].caps[epoch];

        uint epochLength = withdrawsState[sender].epochs.length;
        // replace this index with last index, then delete last value
        withdrawsState[sender].epochs[index] = withdrawsState[sender].epochs[epochLength - 1];
        delete withdrawsState[sender].epochs[epochLength - 1];
        withdrawsState[sender].epochs.length--;

        // transfer funds back to owner
        destAddress.transfer(amount);

        return true;
    }

    function updateMaxValidatorSize(uint newMaxValidatorSize) external onlyAdmin {
        maxValidatorSize = newMaxValidatorSize;
    }

    function getCurrentEpoch() public view returns(uint) {
        return (block.number.sub(startBlock)).div(epochPeriod);
    }

    /**
    * Return list of candidates with stakes data, current epoch, max validator size and min cap to be a validtor
    */
    function getListCandidates()
        external view
        returns(address[] memory _candidates, uint[] memory stakes, uint epoch, uint validatorSize, uint minValidatorCap)
    {
        epoch = getCurrentEpoch();
        validatorSize = maxValidatorSize;
        minValidatorCap = minValidatorStake;
        _candidates = candidates;
        stakes = new uint[](_candidates.length);
        for(uint i = 0; i < _candidates.length; i++) {
            stakes[i] = candidateData[_candidates[i]].totalStake;
        }
    }

    function getCandidateStake(address _candidate) public view returns(uint256) {
        return candidateData[_candidate].totalStake;
    }

    function getCandidateOwner(address _candidate) public view returns(address) {
        return candidateData[_candidate].owner;
    }

    function isCandidate(address _candidate) public view returns(bool) {
        return candidateData[_candidate].isCandidate;
    }

    function getWithdrawEpochs() public view returns(uint[] memory epochs) {
        epochs = withdrawsState[msg.sender].epochs;
    }

    function getWithdrawEpochsAndCaps() public view returns(uint[] memory epochs, uint[] memory caps) {
        epochs = withdrawsState[msg.sender].epochs;
        caps = new uint[](epochs.length);
        for(uint i = 0; i < epochs.length; i++) {
            caps[i] = withdrawsState[msg.sender].caps[epochs[i]];
        }
    }

    function getWithdrawCap(uint epoch) public view returns(uint cap) {
        cap = withdrawsState[msg.sender].caps[epoch];
    }

    function getCandidateData(address _candidate)
        public view
        returns(bool _isActiveCandidate, address _owner, uint _totalStake)
    {
        _isActiveCandidate = candidateData[_candidate].isCandidate;
        _owner = candidateData[_candidate].owner;
        _totalStake = candidateData[_candidate].totalStake;
    }

    function getVoters(address _candidate) public view returns(address[] memory voters) {
        voters = candidateVoters[_candidate];
    }

    function getVoterStakes(address _candidate, address[] memory voters) public view returns(uint[] memory stakes) {
        stakes = new uint[](voters.length);
        for(uint i = 0; i < voters.length; i++) {
            stakes[i] = candidateData[_candidate].voterStake[voters[i]];
        }
    }

    function getVoterStake(address _candidate, address _voter)
        public view
        returns(uint stake)
    {
        stake = candidateData[_candidate].voterStake[_voter];
    }
}