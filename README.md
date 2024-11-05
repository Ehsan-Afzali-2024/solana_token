# Solana Token - A JavaScript Library for Solana SPL Token Management

Welcome to the **solana_token** npm package, a comprehensive library designed to simplify the interaction with the Solana blockchain's SPL tokens. It provides an easy-to-use interface for wallet management, token transfers, and interaction with different Solana clusters.

## Table of Contents

(#table-of-contents)
- [Solana Token - A JavaScript Library for Solana SPL Token Management](#solana-token---a-javascript-library-for-solana-spl-token-management)
  - [Table of Contents](#table-of-contents)
- [Installation](#installation)
- [Usage](#usage)
  - [Wallet Management](#wallet-management)
  - [Token Management](#token-management)
    - [Create Token](#create-token)
    - [Get Token Balance](#get-token-balance)
    - [Transfer Tokens](#transfer-tokens)
  - [Transaction Management](#transaction-management)
    - [Begin a Transaction](#begin-a-transaction)
    - [End a Transaction](#end-a-transaction)
- [Example Usage](#example-usage)
- [Methods Overview](#methods-overview)
- [Contributing](#contributing)
- [License](#license)

# Installation

You can install the **solana_token** package using npm. Run the following command in your terminal:

```bash
npm install solana_token
```

# Usage

This package provides utility methods to interact with Solana\'s SPL token ecosystem. You can manage wallets, carry out token transfers, and interact with various clusters such as devnet, testnet, and mainnet.

To use this package, simply import it into your JavaScript application:

```js
const { Spl, Wallet } = require("solana_token");
```

## Wallet Management

You can create or restore wallets using the provided methods. For example, to restore a wallet from a mnemonic:

```js
const wallet = Wallet.restoreFromMnemonic("your mnemonic seed phrase here");
```

## Token Management

### Create Token

```js
const token = await spl.createToken(wallet);
```

### Get Token Balance

```js
const balance = await spl.getTokenAccountBalance(accountPublicKey);
```

### Transfer Tokens

You can transfer SPL tokens between two wallets:

```js
await spl.transferToken(tokenPublicKey, fromWallet, toWallet, amount);
```

## Transaction Management

The library allows you to manage transactions easily:

### Begin a Transaction

```js
const transaction = spl.beginTransaction();
```

### End a Transaction

```js
const confirmation = await spl.endTransaction(transaction);
```

# Example Usage

Here’s an example of how to use the solana_token package with an Express.js application to manage wallets and transfer tokens:

```js
const express = require("express");
const router = express.Router();
const { Spl, Wallet } = require("solana_token");
const { PublicKey } = require("@solana/web3.js");

router.get("/", async (req, res) => {
  const w1 = Wallet.restoreFromMnemonic("your mnemonic here");
  const w2 = Wallet.restoreFromMnemonic("another mnemonic here");
  const s = new Spl().connect("devnet");

  // Airdrop some SOL to the wallets
  await s.getSomeSol(w1);
  await s.getSomeSol(w2);

  // Getting balances
  const w1Balance = await s.getSolBalance(w1);
  const w2Balance = await s.getSolBalance(w2);

  // Token actions began
  const tokenPublicKey = new PublicKey("your_token_address_here");
  const tai1 = await s.getOrCreateTokenAccount(w1, tokenPublicKey);
  const tai2 = await s.getOrCreateTokenAccount(w2, tokenPublicKey);

  // Transfer tokens
  await s.transferToken(tokenPublicKey, w1, w2, amount);

  res.send({
    w1Balance: w1Balance,
    w2Balance: w2Balance,
    tai1: tai1.tokenAccountPublicKey.toString(),
    tai2: tai2.tokenAccountPublicKey.toString(),
  });
});

module.exports = router;
```

# Methods Overview

**connect(cluster)**: Connect to a specified Solana cluster.  
**getSomeSol(publicKey, amount)**: Request an airdrop of SOL to the specified wallet.  
**transferSol(from, to, amount)**: Transfer SOL tokens from one wallet to another.  
**transferToken(tokenPublicKey, fromKeypair, toKeypair, amount)**: Transfer SPL tokens from one wallet to another.

# Contributing

We welcome contributions! If you'd like to enhance the functionality of the `solana_token` package, please fork the repository and submit a pull request. For large changes, please open an issue first to discuss what you would like to change.

# License

This project is licensed under the MIT License - see the LICENSE file for details.
