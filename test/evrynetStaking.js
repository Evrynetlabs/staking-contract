const EvrynetStaking = artifacts.require("EvrynetStaking.sol");

const BN = web3.utils.BN;

const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

const { zeroAddress, oneEvrynet, assertEqual } = require("./helper.js");


let admin;
let epochPeriod = new BN(1024);
let startBlock = new BN(0);
let maxValidatorsSize = new BN(40);
let minValidatorStake = new BN(10).mul(oneEvrynet); // 10 evrynet
let minVoterCap = new BN(oneEvrynet); // 1 evrynet
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

    describe("test basic read operation after init", async () => {
        it("getListCandidates", async () => {
            let data = await stakingSC.getListCandidates();
            assert(data[0] = candidates, "unexpected candidates");
            assert(data[1].length == candidates.length, "unexpected stakes length");
            data[1].forEach(stake => {
                assertEqual(stake, minValidatorStake);
            });
            assertEqual(data[3], maxValidatorsSize, "unexpected max validators size");
            assertEqual(data[4], minValidatorStake, "unexpected min validator stake");
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
                assert(candidateData[0], "should be candidate");
                assert(candidateData[1] == owners[i], "unexpected owner");
                assertEqual(candidateData[2], minValidatorStake, "unexected stakes");
            });
        });
    });

    describe("test transfer admin", async () => {
        it("test revert when set admin address to zero", async () => {
            await expectRevert.unspecified(stakingSC.transferAdmin(zeroAddress, { from: admin }));
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
        it("register success", async () => {
            await stakingSC.register(newCandidate, newOwner, { from: admin });
            // revert if candidate is existed
            await expectRevert(stakingSC.register(newCandidate, newOwner, { from: admin }), "only not active candidate");
            // getListCandidates
            let data = await stakingSC.getListCandidates();
            //update data for candidates and owner
            candidates = data[0];
            owners.push(newOwner);
            let stakes = data[1];
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
            await expectRevert(stakingSC.vote(votedCandidate, { from: voter, value: invalidVoteCap }), "low vote amout");
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
        before("get account", async () => {
            votedCandidate = candidates[2];
            votedOwners = owners[2];
            voter = accounts[6];
            voter2 = accounts[7];

            // before this test the stake of voter and voter2 is 0.8 and 0.2 evrynet, repectively
            let currentStake = await stakingSC.getVoterStake(votedCandidate, voter);
            assertEqual(currentStake, new BN(8).mul(oneEvrynet));
            currentStake = await stakingSC.getVoterStake(votedCandidate, voter2);
            assertEqual(currentStake, new BN(2).mul(oneEvrynet));

        })
        it("test revert if invalid unvote amount for voter", async () => {
            await expectRevert(stakingSC.unvote(votedCandidate, new BN(0), { from: voter }), "_cap should be positive");
            await expectRevert(stakingSC.unvote(votedCandidate, new BN(9).mul(oneEvrynet), { from: voter }), "not enough to unvote");
            // test unvote should leave the balance is neither zero nor greater than min voter cap
            let invalidUnvote = new BN(71).mul(oneEvrynet).div(new BN(10));
            await expectRevert(stakingSC.unvote(votedCandidate, invalidUnvote, { from: voter }), "invalid unvote amt");
        })
        it("test revert if invalid unvote amount for owner", async () => {
            let currentStake = await stakingSC.getVoterStake(votedCandidate, votedOwners);
            assertEqual(currentStake, new BN(0), "not zero balance");
            await stakingSC.vote(votedCandidate, { from: votedOwners, value: new BN(14).mul(oneEvrynet) });
            await expectRevert(
                stakingSC.unvote(votedCandidate, new BN(4).mul(oneEvrynet).add(new BN(1)), { from: votedOwners }),
                "new stakes < minValidatorStake"
            );
        });

        it("unvote successfull", async () => {
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
        });
    });
})