const { constants } = require('@openzeppelin/test-helpers');

const BN = web3.utils.BN;

const zeroAddress = constants.ZERO_ADDRESS;
const oneEvrynet = new BN(10).mul(new BN(18));


module.exports = { zeroAddress, oneEvrynet };


module.exports.assertEqual = assertEqual;
function assertEqual(val1, val2, errorStr) {
    assert(new BN(val1).eq(new BN(val2)), errorStr);
}
