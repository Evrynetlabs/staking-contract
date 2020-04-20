usePlugin("@nomiclabs/buidler-truffle5");
usePlugin("@nomiclabs/buidler-web3");
usePlugin("solidity-coverage");

// This is a sample Buidler task. To learn how to create your own go to
// https://buidler.dev/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
  const accounts = await web3.eth.getAccounts();

  for (const account of accounts) {
    const balance = await web3.eth.getBalance(account);
    console.log(account, web3.utils.fromWei(balance, "ether"), "ETH");
  }
});

module.exports = {
  defaultNetwork: "buidlerevm",
  solc: {
    version: "0.5.13",    // Fetch exact version from solc-bin (default: truffle's version)
    docker: true,         // Use "0.5.1" you've installed locally with docker (default: false)
    settings: {           // See the solidity docs for advice about optimization and evmVersion
     optimizer: {
       enabled: false,
       runs: 200
     },
     evmVersion: "constantinople"
    }
  },
  accounts:{
    
  }
};
