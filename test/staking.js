const EvrynetStaking = artifacts.require("EvrynetStaking.sol");

const BN = web3.utils.BN;

const { expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');

const Helper = require("./helper.js");
const { zeroAddress, oneEvrynet, assertEqual } = require("./helper.js");

let admin;
let epochPeriod = new BN(50);
let startBlock = new BN(0);
let maxValidatorsSize = new BN(40);
let minValidatorStake = new BN(10).mul(oneEvrynet); // 10 evrynet
let minVoterCap = new BN(oneEvrynet); // 1 evrynet
let ownerUnlockPeriod = new BN(2);
let voterUnlockPeriod = new BN(2);
let stakingSC;
let candidates;
let owners;

contract("EvrynetStaking", function (accounts) {
    before("one time global init", async () => {
        admin = accounts[0];
        candidates = [accounts[1], accounts[2]];
        owners = [accounts[1], accounts[3]];
        stakingSC = await EvrynetStaking.new(candidates, owners, epochPeriod, startBlock, maxValidatorsSize, minValidatorStake, minVoterCap, admin);
    });

    describe("test constructor", async () => {
        it("revert if epochPeriod = 0", async () => {
            await expectRevert(EvrynetStaking.new(candidates, owners, new BN(0), startBlock, maxValidatorsSize, minValidatorStake, minVoterCap, admin), "epoch must be positive");
        });

        it("revert if length not match", async () => {
            await expectRevert(EvrynetStaking.new(candidates, [accounts[1]], epochPeriod, startBlock, maxValidatorsSize, minValidatorStake, minVoterCap, admin), "length not match");
        });

        it("revert if invalid _maxValidatorSize", async () => {
            await expectRevert(EvrynetStaking.new(candidates, owners, epochPeriod, startBlock, new BN(1), minValidatorStake, minVoterCap, admin), "invalid _maxValidatorSize");
        });
    });

    describe("test basic read operation after init", async () => {
        it("getListCandidates", async () => {
            let data = await stakingSC.getListCandidates();
            assert(data._candidates = candidates, "unexpected candidates");
            assert(data.stakes.length == candidates.length, "unexpected stakes length");
            data.stakes.forEach(stake => {
                assertEqual(stake, minValidatorStake);
            });
            assertEqual(data.validatorSize, maxValidatorsSize, "unexpected max validators size");
            assertEqual(data.minValidatorCap, minValidatorStake, "unexpected min validator stake");
        })

        it("test get candidate info function", async () => {
            candidates.forEach(async (candidate, i) => {
                let isCandidate = await stakingSC.isCandidate(candidate);
                assert(isCandidate, "should be candidate");
                let stake = await stakingSC.getCandidateStake(candidate);
                assertEqual(stake, minValidatorStake, "unexected stakes");
                let actualOwner = await stakingSC.getCandidateOwner(candidate);
                assert(actualOwner == owners[i], "unexpected owner");
                let candidateData = await stakingSC.getCandidateData(candidate);
                assert(candidateData._isActiveCandidate, "should be candidate");
                assert(candidateData._owner == owners[i], "unexpected owner");
                assertEqual(candidateData._totalStake, minValidatorStake, "unexected stakes");
            });
        });

        it("getCurrentEpoch", async () => {
            let blockNumber = await Helper.getCurrentBlock();
            let expectedEpoch = getEpoch(new BN(blockNumber), startBlock, epochPeriod);
            let actualEpoch = await stakingSC.getCurrentEpoch();
            assertEqual(expectedEpoch, actualEpoch, "unexpected epoch");
        });
    });

    describe("test admin set params", async () => {
        let stakingSC;
        before("using local variable so this will not affect global one", async () => {
            stakingSC = await EvrynetStaking.new(candidates, owners, epochPeriod, startBlock, maxValidatorsSize, minValidatorStake, minVoterCap, admin);
        });
        it("updateMaxValidatorSize", async () => {
            await expectRevert(stakingSC.updateMaxValidatorSize(new BN(80), { from: accounts[1] }), "ADMIN ONLY");
            await stakingSC.updateMaxValidatorSize(new BN(80), { from: admin });
            let maxValidatorsSize = await stakingSC.maxValidatorSize();
            assertEqual(maxValidatorsSize, new BN(80), "unexpected maxValidatorsSize");
        });
        it("updateMinValidateStake", async () => {
            await expectRevert(stakingSC.updateMinValidateStake(new BN(100), { from: accounts[2] }), "ADMIN ONLY");
            await stakingSC.updateMinValidateStake(new BN(10).pow(new BN(5)), { from: admin });
            let minValidatorStake = await stakingSC.minValidatorStake();
            assertEqual(minValidatorStake, new BN(10).pow(new BN(5)), "unexpected max validator size");
        });
        it("updateMinVoteCap", async () => {
            await expectRevert(stakingSC.updateMinVoteCap(new BN(30), { from: accounts[3] }), "ADMIN ONLY")
            await stakingSC.updateMinVoteCap(new BN(3).mul(new BN(10).pow(new BN(5))), { from: admin });
            let actualMinVoteCap = await stakingSC.minVoterCap();
            assertEqual(actualMinVoteCap, new BN(3).mul(new BN(10).pow(new BN(5))), "unexpected minVoterCap");
        });

    });

    describe("test transfer admin", async () => {
        it("test revert when set admin address to zero", async () => {
            await expectRevert(stakingSC.transferAdmin(zeroAddress, { from: admin }), "ADMIN is 0");
        });

        it("test revert if msg.sender is not admin", async () => {
            await expectRevert(stakingSC.transferAdmin(zeroAddress, { from: accounts[1] }), "ADMIN ONLY");
        });

        it("test transfer admin success", async () => {
            let newAdmin = accounts[6];
            await stakingSC.transferAdmin(newAdmin, { from: admin });
            let actualNewAdmin = await stakingSC.admin();
            assert(actualNewAdmin == newAdmin, "new admin missmatch");
            //set admin back to normal
            await stakingSC.transferAdmin(admin, { from: newAdmin });
        });
    });

    describe("test register", async () => {
        let newCandidate = accounts[4];
        let newOwner = accounts[5];
        it("revert if not admin", async () => {
            await expectRevert(stakingSC.register(newCandidate, newOwner, { from: accounts[1] }), "ADMIN ONLY");
        });

        it("revert if register candidate is zero address", async () => {
            await expectRevert(stakingSC.register(zeroAddress, newOwner, { from: admin }), "_candidate address is 0");
        });

        it("revert if register candidate owner is zero address", async () => {
            await expectRevert(stakingSC.register(newCandidate, zeroAddress, { from: admin }), "_owner address is 0");
        });

        it("revert if too many candidates", async () => {
            let admin = accounts[0];
            let candidates = [accounts[1], accounts[2]];
            let owners = [accounts[1], accounts[3]];
            let stakingSC = await EvrynetStaking.new(candidates, owners, epochPeriod, startBlock, maxValidatorsSize, minValidatorStake, minVoterCap, admin);
            for (let i = 2; i < 128; i++) {
                let addrHex = web3.utils.randomHex(20);
                await stakingSC.register(addrHex, admin, { from: admin });
            }
            let addrHex = web3.utils.randomHex(20);
            await expectRevert(stakingSC.register(addrHex, admin, { from: admin }), "too many candidates");
        });

        it("register success", async () => {
            await stakingSC.register(newCandidate, newOwner, { from: admin });
            // revert if candidate is existed
            await expectRevert(stakingSC.register(newCandidate, newOwner, { from: admin }), "only not active candidate");
            // getListCandidates
            let data = await stakingSC.getListCandidates();
            //update data for candidates and owner
            candidates = data._candidates;
            owners.push(newOwner);
            let stakes = data.stakes;
            assert(candidates.length == 3, "unexpected candidates length")
            assert(candidates.length == stakes.length, "stakes and candidates lengths are mismatch")
            assert(candidates.includes(newCandidate), "new candidate is not included");
            for (let i = 0; i < candidates.length; i++) {
                if (candidates[i] == newCandidate) // stake of new register candidate shoule be zero
                    assert(stakes[i] == 0, "stake is not zero");
            }
            //get Owner
            let actualOwner = await stakingSC.getCandidateOwner(newCandidate);
            assert(actualOwner == newOwner, "unexpected owner");
        });
    });

    describe("vote", async () => {
        let votedCandidate;
        let voter;
        let voter2;
        before("get account", async () => {
            votedCandidate = candidates[2];
            voter = accounts[6];
            voter2 = accounts[7];
        })

        it("test revert if not vote for valid candidate", async () => {
            await expectRevert(stakingSC.vote(accounts[7], { from: voter, value: minVoterCap }), "only active candidate");
        });

        it("test revert if vote cap is too small", async () => {
            let invalidVoteCap = new BN(minVoterCap).sub(new BN(1));
            await expectRevert(stakingSC.vote(votedCandidate, { from: voter, value: invalidVoteCap }), "low vote amount");
        });

        it("test vote success", async () => {
            let voteAmount = new BN(3).mul(oneEvrynet); // 3 evrynet
            let txResult = await stakingSC.vote(votedCandidate, { from: voter, value: voteAmount });
            expectEvent(txResult, "Voted", {
                voter: voter,
                candidate: votedCandidate,
                amount: voteAmount,
            });
            let voterStake = await stakingSC.getVoterStake(votedCandidate, voter);
            assertEqual(voterStake, voteAmount, "unexpected voter stake");
            let votes = await stakingSC.getVoters(votedCandidate);
            assert(votes.includes(voter), "voter is not added");
            // vote more evrynet to this candidate
            await stakingSC.vote(votedCandidate, { from: voter, value: new BN(5).mul(oneEvrynet) });
            voterStake = await stakingSC.getVoterStake(votedCandidate, voter);
            voteAmount = voteAmount.add(new BN(5).mul(oneEvrynet));
            assertEqual(voterStake, voteAmount, "unexpected voter stake");
            let totalStake = await stakingSC.getCandidateStake(votedCandidate);
            assertEqual(totalStake, voteAmount, "totalStake is unexpected");
            // another voter votes for this candidate
            let voteAmount2 = new BN(2).mul(oneEvrynet);
            await stakingSC.vote(votedCandidate, { from: voter2, value: voteAmount2 });
            votes = await stakingSC.getVoters(votedCandidate);
            assert(votes.includes(voter2), "voter is not added");
            assertEqual(await stakingSC.getVoterStake(votedCandidate, voter2), voteAmount2, "unexpected voter stake");
            totalStake = await stakingSC.getCandidateStake(votedCandidate);
            assertEqual(totalStake, voteAmount.add(voteAmount2), "totalStake is unexpected");
            let stakes = await stakingSC.getVoterStakes(votedCandidate, [voter, voter2]);
            assertEqual(stakes[0], voteAmount);
            assertEqual(stakes[1], voteAmount2);
        });
    });


    describe("unvote", async () => {
        let votedCandidate;
        let votedOwners;
        let voter;
        let voter2;
        let destAddress;

        before("get account", async () => {
            votedCandidate = candidates[2];
            votedOwners = owners[2];
            voter = accounts[6];
            voter2 = accounts[7];
            destAddress = accounts[8];

            // before this test the stake of voter and voter2 is 0.8 and 0.2 evrynet, repectively
            let currentStake = await stakingSC.getVoterStake(votedCandidate, voter);
            assertEqual(currentStake, new BN(8).mul(oneEvrynet));
            currentStake = await stakingSC.getVoterStake(votedCandidate, voter2);
            assertEqual(currentStake, new BN(2).mul(oneEvrynet));

        });

        it("test revert if invalid unvote amount for voter", async () => {
            await expectRevert(stakingSC.unvote(votedCandidate, new BN(0), { from: voter }), "amount should be positive");
            // unvoting with amount higher than current amount will overflow
            await expectRevert(stakingSC.unvote(votedCandidate, new BN(9).mul(oneEvrynet), { from: voter }), "subtraction overflow");
            // test unvote should leave the balance is neither zero nor greater than min voter cap
            let invalidUnvote = new BN(71).mul(oneEvrynet).div(new BN(10));
            await expectRevert(stakingSC.unvote(votedCandidate, invalidUnvote, { from: voter }), "invalid unvote amt");
        });

        it("test revert if invalid unvote amount for owner", async () => {
            let currentStake = await stakingSC.getVoterStake(votedCandidate, votedOwners);
            assertEqual(currentStake, new BN(0), "not zero balance");
            await stakingSC.vote(votedCandidate, { from: votedOwners, value: new BN(14).mul(oneEvrynet) });
            await expectRevert(
                stakingSC.unvote(votedCandidate, new BN(4).mul(oneEvrynet).add(new BN(1)), { from: votedOwners }),
                "new stakes < minValidatorStake"
            );
        });

        it("unvote successfull for voter", async () => {
            // unvote completely
            let txResult = await stakingSC.unvote(votedCandidate, new BN(8).mul(oneEvrynet), { from: voter });
            expectEvent(txResult, "Unvoted", {
                voter: voter,
                candidate: votedCandidate,
                amount: new BN(8).mul(oneEvrynet),
            });
            //check new stake
            let newVoterStake = await stakingSC.getVoterStake(votedCandidate, voter);
            assertEqual(newVoterStake, new BN(0), "unexpected new voter stake");

            // unvote to minVoterCap
            txResult = await stakingSC.unvote(votedCandidate, new BN(1).mul(oneEvrynet), { from: voter2 });
            expectEvent(txResult, "Unvoted", {
                voter: voter2,
                candidate: votedCandidate,
                amount: new BN(1).mul(oneEvrynet),
            });
            //check new stake
            newVoterStake = await stakingSC.getVoterStake(votedCandidate, voter2);
            assertEqual(newVoterStake, minVoterCap, "unexpected new voter stake");

            // check withdrawVoterStake
            let unvoteEpoch = getEpoch(txResult.receipt.blockNumber, startBlock, epochPeriod);
            let unlockEpoch = unvoteEpoch.add(voterUnlockPeriod);
            let withdrawVoterCap = await stakingSC.getWithdrawCap(unlockEpoch, { from: voter2 });
            assertEqual(withdrawVoterCap, new BN(1).mul(oneEvrynet), "unexpected withdrawVoterCap");

            //unvote from other epoch and checks
            let newBlock = getFirstBlock(unvoteEpoch.add(new BN(1)), startBlock, epochPeriod);
            await time.advanceBlockTo(newBlock);
            await stakingSC.unvote(votedCandidate, new BN(1).mul(oneEvrynet), { from: voter2 });
            let currentBlock = await Helper.getCurrentBlock()

            let withdrawEpochs = await stakingSC.getWithdrawEpochs({ from: voter2 });
            assert(withdrawEpochs.length == 2, "unexpected withdrawEpochs.length");
            assertEqual(withdrawEpochs[0], new BN(unlockEpoch));
            assertEqual(withdrawEpochs[1], new BN(unlockEpoch).add(new BN(1)));

            let data = await stakingSC.getWithdrawEpochsAndCaps({ from: voter2 });
            assert(data[1].length == 2, "unexpected withdrawStakes.length");
        });

        it("unvote successfull for owner", async () => {
            await stakingSC.unvote(votedCandidate, new BN(4).mul(oneEvrynet), { from: votedOwners });
            //check new stake
            let newVoterStake = await stakingSC.getVoterStake(votedCandidate, voter);
            assertEqual(newVoterStake, new BN(0), "unexpected new voter stake");
        });


        it("withdraw after unvote", async () => {
            let withdrawData = await stakingSC.getWithdrawEpochsAndCaps({ from: voter });
            assert(withdrawData.epochs.length > 0, "empty withdrawData");
            let withdrawValue = withdrawData.caps[0];
            let withdrawEpoch = withdrawData.epochs[0];
            // need to wait until withdrawEpoch, otherwise revert it
            await expectRevert(stakingSC.withdraw(withdrawEpoch, voter, { from: voter }), "can not withdraw for future epoch");
            let unlockBlock = getFirstBlock(withdrawEpoch, startBlock, epochPeriod);
            await time.advanceBlockTo(unlockBlock);
            let initBalance = await Helper.getBalancePromise(destAddress);
            let txResult = await stakingSC.withdraw(withdrawEpoch, destAddress, { from: voter });
            await expectEvent(txResult, "Withdraw", {
                _staker: voter,
                _amount: withdrawValue,
                _destAddress: destAddress
            });
            let newBalance = await Helper.getBalancePromise(destAddress);
            let actualReceiveAmount = new BN(newBalance).sub(initBalance);
            assertEqual(actualReceiveAmount, withdrawValue);
            // no withdraw cap left to withdraw
            await expectRevert(stakingSC.withdraw(withdrawEpoch, voter, { from: voter }), "withdraw cap is 0");
        });

        it("withdrawWithIndex after unvote", async () => {
            // vote - unvote with minVoterCap
            await stakingSC.vote(votedCandidate, { from: voter2, value: new BN(1).mul(oneEvrynet) });
            await stakingSC.unvote(votedCandidate, minVoterCap, { from: voter2 });
            // check withdrawData
            let withdrawData = await stakingSC.getWithdrawEpochsAndCaps({ from: voter2 });
            assert(withdrawData.epochs.length > 0, "empty withdrawData");
            let withdrawValue = withdrawData.caps[withdrawData.caps.length - 1];
            let withdrawEpoch = withdrawData.epochs[withdrawData.epochs.length - 1];
            // need to wait until withdrawEpoch, otherwise revert it
            await expectRevert(stakingSC.withdrawWithIndex(withdrawEpoch, new BN(withdrawData.caps.length - 1), voter2, { from: voter2 }), "can not withdraw for future epoch");
            let unlockBlock = getFirstBlock(withdrawEpoch, startBlock, epochPeriod);
            // move to unlock block
            await time.advanceBlockTo(unlockBlock);
            // wrong index
            await expectRevert(stakingSC.withdrawWithIndex(withdrawEpoch, new BN(0), voter2, { from: voter2 }), "not correct index");
            // tx success
            let initBalance = await Helper.getBalancePromise(destAddress);
            let txResult = await stakingSC.withdrawWithIndex(withdrawEpoch, new BN(withdrawData.caps.length - 1), destAddress, { from: voter2 });
            await expectEvent(txResult, "Withdraw", {
                _staker: voter2,
                _amount: withdrawValue,
                _destAddress: destAddress
            });
            let newBalance = await Helper.getBalancePromise(destAddress);
            let actualReceiveAmount = new BN(newBalance).sub(initBalance);
            assertEqual(actualReceiveAmount, withdrawValue);
            // no withdraw cap left to withdraw
            await expectRevert(stakingSC.withdrawWithIndex(withdrawEpoch, new BN(0), voter2, { from: voter2 }), "withdraw cap is 0");
        });

        it("sepcial case: unvote after candidate is resign", async () => {
            let admin = accounts[0];
            let candidates = [accounts[1], accounts[2]];
            let owners = [accounts[1], accounts[3]];
            let newCandidate = accounts[4];
            let newOwner = accounts[5];
            let voter = accounts[6];
            let stakingSC = await EvrynetStaking.new(candidates, owners, epochPeriod, startBlock, maxValidatorsSize, minValidatorStake, minVoterCap, admin);
            //register - vote - resign
            await stakingSC.register(newCandidate, newOwner, { from: admin });
            let firstOwnerVote = new BN(2).mul(oneEvrynet);
            await stakingSC.vote(newCandidate, { from: newOwner, value: firstOwnerVote });
            await stakingSC.vote(newCandidate, { from: voter, value: minVoterCap });
            await stakingSC.resign(newCandidate, { from: newOwner });
            // still can unvote now
            await stakingSC.unvote(newCandidate, minVoterCap, { from: voter, });
            let currentBlock = await Helper.getCurrentBlock();
            let unlockEpoch = getEpoch(currentBlock, startBlock, epochPeriod).add(voterUnlockPeriod);
            await stakingSC.getWithdrawCap(unlockEpoch, { from: voter });
        });
    });


    describe("test resign", async () => {
        let stakingSC;
        let candidates;
        let owners;
        before("recreate local staking contract", async () => {
            candidates = [accounts[1], accounts[2], accounts[4]];
            owners = [accounts[1], accounts[3], accounts[5]];
            stakingSC = await EvrynetStaking.new(candidates, owners, epochPeriod, startBlock, maxValidatorsSize, minValidatorStake, minVoterCap, admin);
        });

        it("test revert if not owner", async () => {
            await expectRevert(stakingSC.resign(candidates[0], { from: admin }), "not owner");
        });

        it("test revert if not candidate", async () => {
            await expectRevert(stakingSC.resign(accounts[3], { from: admin }), "only active candidate");
        });

        it("test resign successfull", async () => {
            //a person votes for this candidate before resign 
            await stakingSC.vote(candidates[1], { from: accounts[6], value: minVoterCap });
            //get previous candidate data length
            let candidateData = await stakingSC.getListCandidates();
            let lengthCandidate = candidateData._candidates.length;
            //resign
            let txResult = await stakingSC.resign(candidates[1], { from: owners[1] });
            let resignEpoch = getEpoch(txResult.receipt.blockNumber, startBlock, epochPeriod);
            expectEvent(txResult, "Resigned", {
                _candidate: candidates[1],
                _epoch: resignEpoch,
            });

            let isCandidate = await stakingSC.isCandidate(candidates[1]);
            assert(!isCandidate, "candidate shoule be removed");
            let currentOwnerStake = await stakingSC.getVoterStake(candidates[1], owners[1]);
            assertEqual(currentOwnerStake, new BN(0), "current owner stake should be zero");
            // voter of resign candidate still unvote to withdraw fund
            await stakingSC.unvote(candidates[1], minVoterCap, { from: accounts[6] });
            // check withdrawStake
            let withdrawEpoch = resignEpoch.add(ownerUnlockPeriod);
            let actualWithdrawCap = await stakingSC.getWithdrawCap(withdrawEpoch, { from: owners[1] });
            assertEqual(actualWithdrawCap, minValidatorStake, "unexpeced withdraw cap");
            //check result of getListCandidates
            candidateData = await stakingSC.getListCandidates()
            candidateData._candidates.forEach(candidate => {
                assert(candidate != candidates[1], "candidates should be deleted");
            });
            assertEqual(candidateData._candidates.length, lengthCandidate - 1);
        });

        it("test resign then register successful", async () => {
            await stakingSC.resign(candidates[2], { from: owners[2] });
            await stakingSC.register(candidates[2], accounts[8], { from: admin }); // new owner
            let newOwner = await stakingSC.getCandidateOwner(candidates[2]);
            assert(newOwner == accounts[8], "unexpected new owner");
        });

        it("special case:register then resign then register again", async () => {
            // this is special test so we would like to set up again
            let admin = accounts[0];
            let candidates = [accounts[1], accounts[2]];
            let owners = [accounts[1], accounts[3]];
            let newCandidate = accounts[4];
            let newOwner = accounts[5];
            let voter = accounts[6];
            let stakingSC = await EvrynetStaking.new(candidates, owners, epochPeriod, startBlock, maxValidatorsSize, minValidatorStake, minVoterCap, admin);
            //register - vote - resign
            await stakingSC.register(newCandidate, newOwner, { from: admin });
            let firstOwnerVote = new BN(2).mul(oneEvrynet);
            await stakingSC.vote(newCandidate, { from: newOwner, value: firstOwnerVote });
            await stakingSC.vote(newCandidate, { from: voter, value: minVoterCap });
            await stakingSC.resign(newCandidate, { from: newOwner });
            // vote failed now
            await expectRevert(stakingSC.vote(newOwner, { value: minVoterCap, from: voter }), "only active candidate");
            //register again with new owner
            let newOwner2 = accounts[7];
            await stakingSC.register(newCandidate, newOwner2, { from: admin });
            let data = await stakingSC.getCandidateData(newCandidate);
            assert(data._owner == newOwner2, "unexpected owner");
            assert(data._isActiveCandidate, "not active candidate");
            assertEqual(data._totalStake, minVoterCap, "unexpected total stake"); // staker from voter
            assertEqual(await stakingSC.getVoterStake(newCandidate, voter), minVoterCap, "unexpected voter cap");
            //vote again for this  candidate
            await stakingSC.vote(newCandidate, { from: voter, value: minVoterCap });
            assertEqual(await stakingSC.getVoterStake(newCandidate, voter), minVoterCap.mul(new BN(2)), "unexpected voter cap");
        });
    });
});

function getEpoch(blockNumber, startBlock, epochPeriod) {
    return new BN(blockNumber).sub(startBlock).div(epochPeriod);
};

function getFirstBlock(epoch, startBlock, epochPeriod) {
    return new BN(epoch).mul(epochPeriod).add(startBlock);
}
