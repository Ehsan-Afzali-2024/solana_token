const w = require("./wallet");
const s = require("./spl");

module.exports = {
  Wallet: w.Wallet,
  walletFactory: w.walletFactory,
  Spl: s.Spl,
  splFactory: s.splFactory,
};
