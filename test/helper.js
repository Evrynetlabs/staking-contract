const { constants, time } = require('@openzeppelin/test-helpers');

const BN = web3.utils.BN;
require("chai")
    .use(require("chai-as-promised"))
    .use(require("chai-bn")(BN))
    .should();

const zeroAddress = constants.ZERO_ADDRESS;
const oneEvrynet = new BN(10).pow(new BN(18));


module.exports = { zeroAddress, oneEvrynet };


module.exports.assertEqual = assertEqual;
function assertEqual(val1, val2, errorStr) {
    assert(new BN(val1).should.be.a.bignumber.that.is.eq(new BN(val2)), errorStr);
}

// This is a hack based on the fact that each tx will increase blockNumber by 1  
module.exports.increaseBlockNumberBySendingEther = async function (sender, recv, blocks) {
    for (let id = 0; id < blocks; id++) {
        await time.advanceBlock();
    }
}

module.exports.sendEtherWithPromise = function (sender, recv, amount) {
    return new Promise(function (fulfill, reject) {
        web3.eth.sendTransaction({ to: recv, from: sender, value: amount }, function (error, result) {
            if (error) {
                return reject(error);
            }
            else {
                return fulfill(true);
            }
        });
    });
};

module.exports.getCurrentBlock = function () {
    return new Promise(function (fulfill, reject) {
        web3.eth.getBlockNumber(function (err, result) {
            if (err) reject(err);
            else fulfill(result);
        });
    });
};

function getBalancePromise(account) {
    return new Promise(function (fulfill, reject) {
        web3.eth.getBalance(account, function (err, result) {
            if (err) reject(err);
            else fulfill(new BN(result));
        });
    });
};

module.exports.getBalancePromise = getBalancePromise;
