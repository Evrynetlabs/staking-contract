pragma solidity 0.5.13;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./IEvrynetStaking.sol";


/**
 *   @title main evrynet Staking smart-contract
 *   @dev implements IEvrynetStaking
 */
contract EvrynetStaking is ReentrancyGuard, IEvrynetStaking {
    using SafeMath for uint256;

    // maximum number of candidates
    uint256 internal constant MAX_CANDIDATES = 128;
    // 2 epochs
    uint256 internal constant CANDIDATE_LOCKING_PERIOD = 2;
    uint256 internal constant VOTER_LOCKING_PERIOD = 2;

    struct CandidateData {
        bool isCandidate;
        uint256 totalStake;
        address owner;
        // voter's stakes for each epoch
        mapping(address => uint256) voterStake;
    }

    struct WithdrawState {
        // withdrawal cap for each epoch
        mapping(uint256 => uint256) caps;
        // list of epochs voter can withdraw
        uint256[] epochs;
    }

    mapping(address => WithdrawState) internal withdrawsState;

    // list voters of a candidate
    mapping(address => address[]) internal candidateVoters;

    mapping(address => CandidateData) internal candidateData;
    address[] public candidates;

    uint256 public startBlock;
    uint256 public epochPeriod;

    uint256 public maxValidatorSize;
    uint256 public minValidatorStake; // min (own) stake to be a validator
    uint256 public minVoterCap;

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

    modifier onlyValidVoteAmount {
        require(msg.value >= minVoterCap, "low vote amount");
        _;
    }

    /**
     * @dev this list candidates should be the validators for epoch
     * Other validators should be added after deployed
     * @param _candidates list of initial candidates
     * @param _candidateOwners owners of list candidates above
     * @param _epochPeriod number of blocks for each epoch
     * @param _startBlock start block of epoch 0
     * @param _maxValidatorSize number of validators for consensus
     * @param _minValidatorStake minimum owner's stake to make the candidate valid to be a validator
     * @param _minVoteCap minimum amount for each vote
     */
    constructor(
        address[] memory _candidates,
        address[] memory _candidateOwners,
        uint256 _epochPeriod,
        uint256 _startBlock,
        uint256 _maxValidatorSize,
        uint256 _minValidatorStake,
        uint256 _minVoteCap,
        address _admin
    ) public {
        require(_epochPeriod > 0, "epoch must be positive");
        require(_candidates.length == _candidateOwners.length, "length not match");
        require(_maxValidatorSize >= _candidates.length, "invalid _maxValidatorSize");

        epochPeriod = _epochPeriod;
        maxValidatorSize = _maxValidatorSize;
        minValidatorStake = _minValidatorStake;
        minVoterCap = _minVoteCap;

        candidates = _candidates;
        for (uint256 i = 0; i < _candidates.length; i++) {
            address candidate = candidates[i];
            candidateData[candidate] = CandidateData({isCandidate: true, owner: _candidateOwners[i], totalStake: _minValidatorStake});
            candidateData[candidate].voterStake[_candidateOwners[i]] = _minValidatorStake;
            candidateVoters[candidate].push(_candidateOwners[i]);
        }

        admin = _admin;
        startBlock = _startBlock;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "ADMIN is 0");
        admin = newAdmin;
    }

    function updateMinValidateStake(uint256 _newCap) external onlyAdmin {
        minValidatorStake = _newCap;
    }

    function updateMinVoteCap(uint256 _newCap) external onlyAdmin {
        minVoterCap = _newCap;
    }

    /**
     * @dev vote for a candidate, amount of EVRY token is msg.value
     * @param candidate address of candidate to vote for
     */
    function vote(address candidate) external payable onlyValidVoteAmount onlyActiveCandidate(candidate) {
        uint256 amount = msg.value;
        address voter = msg.sender;

        if (candidateData[candidate].voterStake[voter] == 0) {
            // push new voter to list
            candidateVoters[candidate].push(voter);
        }

        candidateData[candidate].voterStake[voter] = candidateData[candidate].voterStake[voter].add(amount);
        candidateData[candidate].totalStake = candidateData[candidate].totalStake.add(amount);

        emit Voted(voter, candidate, amount);
    }

    /**
     * @dev unvote for a candidate, amount of EVRY token to withdraw from this candidate
     * must either unvote full stake amount or remain amount >= min voter cap
     * @param candidate address of candidate to vote for
     * @param amount amount to withdraw/unvote
     */
    function unvote(address candidate, uint256 amount) external nonReentrant {
        require(amount > 0, "amount should be positive");
        uint256 curEpoch = getCurrentEpoch();
        address voter = msg.sender;

        uint256 remainAmount = candidateData[candidate].voterStake[voter].sub(amount);
        if (candidateData[candidate].owner == voter) {
            require(remainAmount >= minValidatorStake, "new stakes < minValidatorStake");
        } else {
            // normal voter, remaining amount should be either 0 or >= minVoterCap
            require(remainAmount == 0 || remainAmount >= minVoterCap, "invalid unvote amt");
        }

        candidateData[candidate].voterStake[voter] = remainAmount;
        candidateData[candidate].totalStake = candidateData[candidate].totalStake.sub(amount);

        // refund after delay X epochs
        uint256 withdrawEpoch = curEpoch.add(VOTER_LOCKING_PERIOD);
        withdrawsState[voter].caps[withdrawEpoch] = withdrawsState[voter].caps[withdrawEpoch].add(amount);
        // TODO: Check if withdrawEpoch already exists in the array
        withdrawsState[voter].epochs.push(withdrawEpoch);

        emit Unvoted(voter, candidate, amount);
    }

    /**
     * @dev register a new candidate, only can call by admin
     * if a candidate has been registered, then resigned and re-register,
     * the stakes of voters are remained the same.
     * @param _candidate address of candidate to vote for
     * @param _owner owner of the candidate
     */
    function register(address _candidate, address _owner) external onlyAdmin onlyNotCandidate(_candidate) {
        require(_candidate != address(0), "_candidate address is 0");
        require(_owner != address(0), "_owner address is 0");
        require(candidates.length < MAX_CANDIDATES, "too many candidates");

        uint256 curTotalStake = candidateData[_candidate].totalStake;

        // not current candidate
        candidateData[_candidate] = CandidateData({owner: _owner, isCandidate: true, totalStake: curTotalStake});
        candidates.push(_candidate);
        candidateVoters[_candidate].push(_owner);

        emit Registered(_candidate, _owner);
    }

    /**
     * @dev resign a candidate, only called by owner of that candidate
     * When a candidate resigns, at least minValidatorStake will be locked
     * After CANDIDATE_LOCKING_PERIOD epochs, candidate can withdraw
     * @param _candidate address of candidate to resigned
     */
    function resign(address _candidate) external onlyActiveCandidate(_candidate) onlyCandidateOwner(_candidate) {
        address payable owner = msg.sender;

        uint256 curEpoch = getCurrentEpoch();

        // remove from candidate list
        for (uint256 i = 0; i < candidates.length; i++) {
            if (candidates[i] == _candidate) {
                candidates[i] = candidates[candidates.length - 1];
                delete candidates[candidates.length - 1];
                candidates.pop();
                break;
            }
        }

        candidateData[_candidate].isCandidate = false;

        uint256 ownerStake = candidateData[_candidate].voterStake[owner];
        candidateData[_candidate].voterStake[owner] = 0;

        candidateData[_candidate].totalStake = candidateData[_candidate].totalStake.sub(ownerStake);
        //TODO: remove owner from candidateVoters[_candidate]

        // locked this fund for few epochs
        uint256 unlockEpoch = curEpoch.add(CANDIDATE_LOCKING_PERIOD);
        withdrawsState[owner].caps[unlockEpoch] = withdrawsState[owner].caps[unlockEpoch].add(ownerStake);
        // TODO: Check if unlockEpoch exists in the array
        withdrawsState[owner].epochs.push(unlockEpoch);

        emit Resigned(_candidate, curEpoch);
    }

    /**
     * @dev withdraw locked funds
     * @param epoch withdraw all locked funds from this epoch
     * @param destAddress address of destination is transfered
     */
    function withdraw(uint256 epoch, address payable destAddress) external nonReentrant returns (bool) {
        uint256 curEpoch = getCurrentEpoch();
        require(curEpoch >= epoch, "can not withdraw for future epoch");

        address sender = msg.sender;

        uint256 amount = withdrawsState[sender].caps[epoch];
        require(amount > 0, "withdraw cap is 0");

        withdrawsState[sender].caps[epoch] = 0;
        // TODO: Can call delete epocsh data here if array length is small

        // transfer funds back to destAddress
        destAddress.transfer(amount);

        emit Withdraw(sender, amount, destAddress);

        return true;
    }

    function withdrawWithIndex(uint256 epoch, uint256 index, address payable destAddress) external nonReentrant returns (bool) {
        uint256 curEpoch = getCurrentEpoch();
        require(curEpoch >= epoch, "can not withdraw for future epoch");

        address sender = msg.sender;

        uint256 amount = withdrawsState[sender].caps[epoch];
        require(amount > 0, "withdraw cap is 0");

        require(withdrawsState[sender].epochs[index] == epoch, "not correct index");

        delete withdrawsState[sender].caps[epoch];

        uint256 epochLength = withdrawsState[sender].epochs.length;
        // replace this index with last index, then delete last value
        withdrawsState[sender].epochs[index] = withdrawsState[sender].epochs[epochLength - 1];
        delete withdrawsState[sender].epochs[epochLength - 1];
        withdrawsState[sender].epochs.pop();

        // transfer funds back to owner
        destAddress.transfer(amount);

        emit Withdraw(sender, amount, destAddress);

        return true;
    }

    function updateMaxValidatorSize(uint256 newMaxValidatorSize) external onlyAdmin {
        maxValidatorSize = newMaxValidatorSize;
    }

    function getCurrentEpoch() public view returns (uint256) {
        return (block.number.sub(startBlock)).div(epochPeriod);
    }

    /**
     * Return list of candidates with stakes data, current epoch, max validator size and min cap to be a validtor
     */
    function getListCandidates()
        external
        view
        returns (address[] memory _candidates, uint256[] memory stakes, uint256 epoch, uint256 validatorSize, uint256 minValidatorCap)
    {
        epoch = getCurrentEpoch();
        validatorSize = maxValidatorSize;
        minValidatorCap = minValidatorStake;
        _candidates = candidates;
        stakes = new uint256[](_candidates.length);
        for (uint256 i = 0; i < _candidates.length; i++) {
            stakes[i] = candidateData[_candidates[i]].totalStake;
        }
    }

    function getCandidateStake(address _candidate) external view returns (uint256) {
        return candidateData[_candidate].totalStake;
    }

    function getCandidateOwner(address _candidate) external view returns (address) {
        return candidateData[_candidate].owner;
    }

    function isCandidate(address _candidate) external view returns (bool) {
        return candidateData[_candidate].isCandidate;
    }

    function getWithdrawEpochs() external view returns (uint256[] memory epochs) {
        epochs = withdrawsState[msg.sender].epochs;
    }

    function getWithdrawEpochsAndCaps() external view returns (uint256[] memory epochs, uint256[] memory caps) {
        epochs = withdrawsState[msg.sender].epochs;
        caps = new uint256[](epochs.length);
        for (uint256 i = 0; i < epochs.length; i++) {
            caps[i] = withdrawsState[msg.sender].caps[epochs[i]];
        }
    }

    function getWithdrawCap(uint256 epoch) external view returns (uint256 cap) {
        cap = withdrawsState[msg.sender].caps[epoch];
    }

    function getCandidateData(address _candidate) external view returns (bool _isActiveCandidate, address _owner, uint256 _totalStake) {
        _isActiveCandidate = candidateData[_candidate].isCandidate;
        _owner = candidateData[_candidate].owner;
        _totalStake = candidateData[_candidate].totalStake;
    }

    function getVoters(address _candidate) external view returns (address[] memory voters) {
        voters = candidateVoters[_candidate];
    }

    function getVoterStakes(address _candidate, address[] memory voters) public view returns (uint256[] memory stakes) {
        stakes = new uint256[](voters.length);
        for (uint256 i = 0; i < voters.length; i++) {
            stakes[i] = candidateData[_candidate].voterStake[voters[i]];
        }
    }

    function getVoterStake(address _candidate, address _voter) external view returns (uint256 stake) {
        stake = candidateData[_candidate].voterStake[_voter];
    }
}
