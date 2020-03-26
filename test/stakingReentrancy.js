const EvrynetStaking = artifacts.require("EvrynetStaking.sol");
const MockEvrynetStaking = artifacts.require("MockEvrynetStaking.sol");
const ReentrancyAttacker = artifacts.require("ReentrancyAttacker.sol");

const BN = web3.utils.BN;

const { expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');

const Helper = require("./helper.js");
const stakingHelper = require("./stakingHelper.js");
const { zeroAddress, oneEvrynet, assertEqual } = require("./helper.js");

let admin;
let epochPeriod = new BN(50);
let startBlock = new BN(0);
let maxValidatorsSize = new BN(40);
let minValidatorStake = new BN(10).mul(oneEvrynet); // 10 evrynet
let minVoterCap = new BN(oneEvrynet); // 1 evrynet
let ownerUnlockPeriod = new BN(2);
let voterUnlockPeriod = new BN(2);
let attacker;
let attackerOwner;
let stakingSC;
let candidates;
let owners;


contract("ReentrancyAttacker", function (accounts) {
    before("one time global init", async () => {
        admin = accounts[0];
        candidates = [accounts[1], accounts[2]];
        owners = [accounts[1], accounts[3]];
        attackerOwner = accounts[4];
        stakingSC = await EvrynetStaking.new(candidates, owners, epochPeriod, startBlock, maxValidatorsSize, minValidatorStake, minVoterCap, admin);
        attacker = await ReentrancyAttacker.new(stakingSC.address);
    });

    describe("revert if reentrancy", async () => {
        it("revert due to transfer function", async () => {
            //other votes to increase balance
            await stakingSC.vote(candidates[0], { from: admin, value: new BN(10).mul(oneEvrynet) })
            await attacker.vote(candidates[0], { from: attackerOwner, value: minVoterCap });
            await attacker.unvote(candidates[0], minVoterCap, { from: attackerOwner });
            let blockNumber = await Helper.getCurrentBlock();
            let unvoteEpoch = stakingHelper.getEpoch(blockNumber, startBlock, epochPeriod);
            let unlockEpoch = unvoteEpoch.add(voterUnlockPeriod);
            let unlockBlock = stakingHelper.getFirstBlock(unvoteEpoch.add(voterUnlockPeriod), startBlock, epochPeriod);
            await time.advanceBlockTo(unlockBlock);
            assertEqual(await stakingSC.getWithdrawCap(unlockEpoch, { from: attacker.address }), minVoterCap, "unexpected withdraw cap");
            // revert due to transfer function has gas limit
            await expectRevert.unspecified(attacker.doubleWithdraw(unlockEpoch, { from: attackerOwner }));
        });

        it("revert due to reentrancy guard", async () => {
            let stakingSC = await MockEvrynetStaking.new(candidates, owners, epochPeriod, startBlock, maxValidatorsSize, minValidatorStake, minVoterCap, admin);
            //vote - unvote - withdraw
            let attacker = await ReentrancyAttacker.new(stakingSC.address);
            //other votes to increase balance
            await stakingSC.vote(candidates[0], { from: admin, value: new BN(10).mul(oneEvrynet) })
            await attacker.vote(candidates[0], { from: attackerOwner, value: minVoterCap });
            await attacker.unvote(candidates[0], minVoterCap, { from: attackerOwner });
            let blockNumber = await Helper.getCurrentBlock();
            let unvoteEpoch = stakingHelper.getEpoch(blockNumber, startBlock, epochPeriod);
            let unlockEpoch = unvoteEpoch.add(voterUnlockPeriod);
            assertEqual(await stakingSC.getWithdrawCap(unlockEpoch, { from: attacker.address }), minVoterCap, "unexpected withdraw cap");
            let unlockBlock = stakingHelper.getFirstBlock(unvoteEpoch.add(voterUnlockPeriod), startBlock, epochPeriod);
            await time.advanceBlockTo(unlockBlock);
            // revert due to block by reentrancy guard
            await expectRevert(attacker.doubleWithdraw(unlockEpoch, { from: attackerOwner }), "send value not success");
        });
    });



});