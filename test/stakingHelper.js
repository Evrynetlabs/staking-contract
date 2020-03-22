const BN = web3.utils.BN;

module.exports = { getEpoch, getFirstBlock };


function getEpoch(blockNumber, startBlock, epochPeriod) {
    return new BN(blockNumber).sub(startBlock).div(epochPeriod);
};

function getFirstBlock(epoch, startBlock, epochPeriod) {
    return new BN(epoch).mul(epochPeriod).add(startBlock);
}


function setupStakingSC() {
    
}