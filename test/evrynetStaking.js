const EvrynetStaking = artifacts.require("EvrynetStaking.sol");

const BN = web3.utils.BN;

let admin;
let epochPeriod = new BN(1024);
let startBlock = new BN(0);
let maxValidatorsSize = new BN(40);
let minValidatorStake = new BN(10).pow(new BN(18)); // 1 evrynet
let minVoterCap = new BN(10).pow(new BN(17)); // 0.1 evrynet

contract("EvrynetStaking", function (accounts) {
    before("one time global init", async () => {
        admin = accounts[0];
    });

    describe("test init contract with fund", async () => {
        let staking;
        before("init", async () => {
            let candidates = [accounts[1], accounts[2]];
            staking = await EvrynetStaking.new(candidates, candidates, epochPeriod, startBlock, maxValidatorsSize, minValidatorStake, minVoterCap, admin);
        });

        it("test", async () => {
            let data = await staking.getListCandidates();
            console.log(data);
        });

    });
})