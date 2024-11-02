const solana = require("@solana/web3.js");
const spl = require("@solana/spl-token");
const registery = require("@solana/spl-token-registry");
const fs = require("fs");
const path = require("path");
const mime = require("mime-types");
const Arweave = require("arweave");
const metaplex = require("@metaplex/js");
const arweaveCost = require("@metaplex/arweave-cost");
const mpl = require("@metaplex-foundation/mpl-token-metadata");
//const ns = require('@bonfida/spl-name-service');

class Spl {
  static _clusters = {
    dev: "devnet",
    test: "testnet",
    main: "mainnet-beta",
  };

  static _clusterApiUrls = {
    devnet: "https://api.devnet.solana.com",
    testnet: "https://api.testnet.solana.com",
    "mainnet-beta": "https://api.mainnet-beta.solana.com",
  };

  constructor() {
    this._cluster = null;
    this._connection = null;

    this._authorityTypes = {
      mint: "MintTokens",
      freeze: "FreezeAccount",
      owner: "AccountOwner",
      close: "CloseAccount",
    };
  }

  // Connects to blockchain
  connect(cluster = null) {
    this._cluster = cluster || this._clusters.dev;
    this._connection = new solana.Connection(
      this._clusterApiUrls[this._cluster],
      "confirmed"
    );
    return this;
  }

  getPublicKey(wallet) {
    return wallet instanceof solana.PublicKey ? wallet : wallet.publicKey;
  }

  getKeypair(wallet) {
    return wallet instanceof solana.Keypair ? wallet : wallet.keypair;
  }

  // The wallet receives some SOL token. (only for non-mainnet clusters)
  async getSomeSol(publicKey, amount = null) {
    publicKey = this.getPublicKey(publicKey);
    const airdropSignature = await this._connection.requestAirdrop(
      publicKey,
      (amount || 1) * solana.LAMPORTS_PER_SOL
    );
    return await this._connection.confirmTransaction(airdropSignature); // airdrop info
  }

  generateKeypair(publicKeyPrefix = null) {
    const keypair = solana.Keypair.generate();

    if (!publicKeyPrefix) return keypair;

    while (!keypair.publicKey.toString().startsWith(publicKeyPrefix))
      keypair = solana.Keypair.generate();

    return keypair;
  }

  beginTransaction() {
    let tx = new solana.Transaction();
    tx._signers_ = [];
    return tx;
  }

  /** endTransaction
   * @param {solana.Transaction} transferTransaction
   */
  async endTransaction(transferTransaction) {
    return await solana.sendAndConfirmTransaction(
      this._connection,
      transferTransaction,
      transferTransaction._signers_
    );
  }

  /** transferSol
   * @param {solana.Transaction} transferTransaction
   */
  async transferSol(
    fromKeypair,
    toPublicKey,
    solAmount,
    transferTransaction = null
  ) {
    fromKeypair = this.getKeypair(fromKeypair);
    toPublicKey = this.getPublicKey(toPublicKey);

    let tx = transferTransaction || this.beginTransaction();

    const info = tx.add(
      solana.SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey: toPublicKey,
        lamports: solAmount * solana.LAMPORTS_PER_SOL,
      })
    );

    if (tx._signers_.indexOf(fromKeypair) === -1)
      tx._signers_.push(fromKeypair);

    return transferTransaction ? info : await this.endTransaction(tx);
  }

  /** transfer
   * @param {solana.Transaction} transferTransaction
   */
  async transferToken(
    tokenPublicKey,
    fromKeypair,
    toKeypair,
    amount,
    transferTransaction = null,
    multiSigners = []
  ) {
    tokenPublicKey = this.getPublicKey(tokenPublicKey);
    fromKeypair = this.getKeypair(fromKeypair);
    toKeypair = this.getKeypair(toKeypair);

    let tx = transferTransaction || this.beginTransaction();

    const info = tx.add(
      spl.Token.createTransferInstruction(
        spl.TOKEN_PROGRAM_ID,
        (await this.getOrCreateTokenAccount(fromKeypair, tokenPublicKey))
          .tokenAccountPublicKey,
        (await this.getOrCreateTokenAccount(toKeypair, tokenPublicKey))
          .tokenAccountPublicKey,
        fromKeypair.publicKey,
        multiSigners,
        amount *
          Math.pow(10, (await this.getTokenInfo(tokenPublicKey)).decimals)
      )
    );

    if (tx._signers_.indexOf(fromKeypair) === -1)
      tx._signers_.push(fromKeypair);

    return transferTransaction ? info : await this.endTransaction(tx);
  }

  /** transfer
   * @param {solana.Transaction} transferTransaction
   */
  async rawTransferToken(
    tokenPublicKey,
    walletKeypair,
    fromPublicKey,
    toPublicKey,
    amount,
    transferTransaction = null,
    multiSigners = []
  ) {
    tokenPublicKey = this.getPublicKey(tokenPublicKey);
    walletKeypair = this.getKeypair(walletKeypair);
    fromPublicKey = this.getPublicKey(fromPublicKey);
    toPublicKey = this.getPublicKey(toPublicKey);

    let tx = transferTransaction || this.beginTransaction();

    const info = tx.add(
      spl.Token.createTransferInstruction(
        spl.TOKEN_PROGRAM_ID,
        fromPublicKey,
        toPublicKey,
        walletKeypair.publicKey,
        multiSigners,
        amount *
          Math.pow(10, (await this.getTokenInfo(tokenPublicKey)).decimals)
      )
    );

    if (tx._signers_.indexOf(walletKeypair) === -1)
      tx._signers_.push(walletKeypair);

    return transferTransaction ? info : await this.endTransaction(tx);
  }

  /** transferData
   * @param {solana.Transaction} transferTransaction
   */
  async transferData(
    keypair,
    data,
    transferTransaction = null,
    format = "utf-8"
  ) {
    keypair = this.getKeypair(keypair);
    let tx = transferTransaction || this.beginTransaction();

    const info = tx.add(
      new solana.TransactionInstruction({
        keys: [
          {
            pubkey: keypair.publicKey,
            isSigner: true,
            isWritable: true,
          },
        ],
        data: Buffer.from(data, format),
        programId: new solana.PublicKey(
          "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
        ),
      })
    );

    if (tx._signers_.indexOf(fromKeypair) === -1)
      tx._signers_.push(fromKeypair);

    return transferTransaction ? info : await this.endTransaction(tx);
  }

  getAccountLink(accountPublicKey) {
    accountPublicKey = this.getPublicKey(accountPublicKey);
    return (
      "https://solscan.io/account/" +
      accountPublicKey.toBase58() +
      "?cluster=" +
      this._cluster
    );
  }

  getTransactionLink(txHash) {
    return "https://solscan.io/tx/" + txHash + "?cluster=" + this._cluster;
  }

  getChartLink(tokenPublicKey) {
    tokenPublicKey = this.getPublicKey(tokenPublicKey);
    return "https://birdeye.so/token/" + tokenPublicKey.toBase58();
  }

  async sleep(ms) {
    return await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  async accountExists(walletPublicKey) {
    walletPublicKey = this.getPublicKey(walletPublicKey);
    const info = await this._connection.getParsedAccountInfo(walletPublicKey);
    return info.value !== null;
  }

  async tokenAccountExists(walletPublicKey, tokenPublicKey) {
    const info = await this.getTokenAccountInfo(
      walletPublicKey,
      tokenPublicKey
    );
    return info.value !== null && info.value.length > 0;
  }

  async getTokenAccountInfo(walletPublicKey, tokenPublicKey = null) {
    walletPublicKey = this.getPublicKey(walletPublicKey);

    if (tokenPublicKey) {
      tokenPublicKey = this.getPublicKey(tokenPublicKey);

      return await this._connection.getParsedTokenAccountsByOwner(
        walletPublicKey,
        {
          mint: tokenPublicKey,
        }
      );
    }

    return await this._connection.getParsedTokenAccountsByOwner(
      walletPublicKey,
      {
        programId: spl.TOKEN_PROGRAM_ID,
      }
    );
  }

  async getOrCreateTokenAccount(walletKeypair, tokenPublicKey) {
    walletKeypair = this.getKeypair(walletKeypair);
    tokenPublicKey = this.getPublicKey(tokenPublicKey);

    const tokenAccountPublicKey = await spl.Token.getAssociatedTokenAddress(
      spl.ASSOCIATED_TOKEN_PROGRAM_ID, // always ASSOCIATED_TOKEN_PROGRAM_ID
      spl.TOKEN_PROGRAM_ID, // always TOKEN_PROGRAM_ID
      tokenPublicKey, // mint
      walletKeypair.publicKey // owner
    );

    if (await this.accountExists(tokenAccountPublicKey))
      return {
        tokenAccountPublicKey,
        txInfo: null,
      };

    const tx = new solana.Transaction().add(
      spl.Token.createAssociatedTokenAccountInstruction(
        spl.ASSOCIATED_TOKEN_PROGRAM_ID, // always ASSOCIATED_TOKEN_PROGRAM_ID
        spl.TOKEN_PROGRAM_ID, // always TOKEN_PROGRAM_ID
        tokenPublicKey, // mint
        tokenAccountPublicKey, // Associated Token Account
        walletKeypair.publicKey, // owner of token account
        walletKeypair.publicKey // fee payer
      )
    );

    const txInfo = await solana.sendAndConfirmTransaction(
      this._connection,
      tx,
      [walletKeypair]
    );

    return {
      tokenAccountPublicKey,
      txInfo,
    };
  }

  async createToken(
    ownerKeypair,
    decimals = 9,
    hasFreezeAuthority = false,
    tokenKeypair = null
  ) {
    ownerKeypair = this.getKeypair(ownerKeypair);
    tokenKeypair = this.getKeypair(tokenKeypair || solana.Keypair.generate());
    const programId = spl.TOKEN_PROGRAM_ID;
    const token = new spl.Token(
      this._connection,
      tokenKeypair.publicKey,
      programId,
      ownerKeypair
    ); // Allocate memory for the account
    const tx = new solana.Transaction();

    tx.add(
      solana.SystemProgram.createAccount({
        fromPubkey: ownerKeypair.publicKey,
        newAccountPubkey: tokenKeypair.publicKey,
        lamports: await spl.Token.getMinBalanceRentForExemptMint(
          this._connection
        ),
        space: spl.MintLayout.span,
        programId,
      })
    );

    tx.add(
      spl.Token.createInitMintInstruction(
        programId,
        tokenKeypair.publicKey,
        decimals,
        ownerKeypair.publicKey,
        hasFreezeAuthority ? ownerKeypair.publicKey : null
      )
    );

    const txInfo = await solana.sendAndConfirmTransaction(
      this._connection,
      tx,
      [ownerKeypair, tokenKeypair]
    );

    return {
      token,
      txInfo,
    };
  }

  async getTokenInfo(tokenPublicKey) {
    tokenPublicKey = this.getPublicKey(tokenPublicKey);
    const accountInfo = await this._connection.getAccountInfo(tokenPublicKey);
    const mintInfo = spl.MintLayout.decode(accountInfo.data);

    return {
      supply: spl.u64.fromBuffer(mintInfo.supply),
      decimals: mintInfo.decimals,
      mintAuthority: mintInfo.mintAuthorityOption
        ? new solana.PublicKey(mintInfo.mintAuthority)
        : null,
      freezeAuthority: mintInfo.freezeAuthorityOption
        ? new solana.PublicKey(mintInfo.freezeAuthority)
        : null,
    };
  }

  async getSolBalance(publicKey) {
    publicKey = this.getPublicKey(publicKey);
    return (
      Number(await this._connection.getBalance(publicKey)) /
      solana.LAMPORTS_PER_SOL
    );
  }

  async getTokenAccountBalance(tokenAccountPublicKey) {
    tokenAccountPublicKey = this.getPublicKey(tokenAccountPublicKey);
    const tokenAmount = await this._connection.getTokenAccountBalance(
      tokenAccountPublicKey
    );
    return tokenAmount.value.amount / Math.pow(10, tokenAmount.value.decimals);
  }

  async mint(
    tokenPublicKey,
    ownerKeypair,
    amount,
    receiverKeypair = null,
    multiSigners = []
  ) {
    tokenPublicKey = this.getPublicKey(tokenPublicKey);
    ownerKeypair = this.getKeypair(ownerKeypair);

    const receiverPublicKey = this.getPublicKey(
      // receiver (sholud be a token account)
      (
        await this.getOrCreateTokenAccount(
          receiverKeypair || ownerKeypair,
          tokenPublicKey
        )
      ).tokenAccountPublicKey
    );

    const tx = new solana.Transaction().add(
      spl.Token.createMintToInstruction(
        spl.TOKEN_PROGRAM_ID, // always TOKEN_PROGRAM_ID
        tokenPublicKey, // mint
        receiverPublicKey,
        ownerKeypair.publicKey, // mint authority
        multiSigners, // only multisig account will use.
        amount *
          Math.pow(10, (await this.getTokenInfo(tokenPublicKey)).decimals) // amount. for example if your decimals is 8, you mint 10^8 for 1 token.
      )
    );

    return await solana.sendAndConfirmTransaction(this._connection, tx, [
      ownerKeypair,
    ]);
  }

  async rawMint(
    tokenPublicKey,
    ownerKeypair,
    amount,
    receiverTokenAccountPublicKey = null,
    multiSigners = []
  ) {
    tokenPublicKey = this.getPublicKey(tokenPublicKey);
    ownerKeypair = this.getKeypair(ownerKeypair);
    receiverTokenAccountPublicKey = this.getPublicKey(
      receiverTokenAccountPublicKey || // receiver (sholud be a token account)
        (await this.getOrCreateTokenAccount(ownerKeypair, tokenPublicKey))
          .tokenAccountPublicKey
    );

    const tx = new solana.Transaction().add(
      spl.Token.createMintToInstruction(
        spl.TOKEN_PROGRAM_ID, // always TOKEN_PROGRAM_ID
        tokenPublicKey, // mint
        receiverTokenAccountPublicKey,
        ownerKeypair.publicKey, // mint authority
        multiSigners, // only multisig account will use.
        amount *
          Math.pow(10, (await this.getTokenInfo(tokenPublicKey)).decimals) // amount. for example if your decimals is 8, you mint 10^8 for 1 token.
      )
    );

    return await solana.sendAndConfirmTransaction(this._connection, tx, [
      ownerKeypair,
    ]);
  }

  async burn(tokenPublicKey, walletKeypair, amount, multiSigners = []) {
    tokenPublicKey = this.getPublicKey(tokenPublicKey);
    walletKeypair = this.getKeypair(walletKeypair);
    const tokenAccountPublicKey = this.getPublicKey(
      (await this.getOrCreateTokenAccount(walletKeypair, tokenPublicKey))
        .tokenAccountPublicKey
    );

    const tx = new solana.Transaction().add(
      spl.Token.createBurnInstruction(
        spl.TOKEN_PROGRAM_ID, // always TOKEN_PROGRAM_ID
        tokenPublicKey, // mint
        tokenAccountPublicKey,
        walletKeypair.publicKey, // mint authority
        multiSigners, // only multisig account will use.
        amount *
          Math.pow(10, (await this.getTokenInfo(tokenPublicKey)).decimals) // amount. for example if your decimals is 8, you mint 10^8 for 1 token.
      )
    );

    return await solana.sendAndConfirmTransaction(this._connection, tx, [
      walletKeypair,
    ]);
  }

  async closeTokenAccount(tokenPublicKey, walletKeypair, multiSigners = []) {
    tokenPublicKey = this.getPublicKey(tokenPublicKey);
    walletKeypair = this.getKeypair(walletKeypair);
    const tokenAccount = (
      await this.getOrCreateTokenAccount(walletKeypair, tokenPublicKey)
    ).tokenAccountPublicKey;

    const tx = new solana.Transaction().add(
      spl.Token.createCloseAccountInstruction(
        spl.TOKEN_PROGRAM_ID, // always TOKEN_PROGRAM_ID
        tokenAccount,
        walletKeypair.publicKey,
        walletKeypair.publicKey, // mint authority
        multiSigners // only multisig account will use.
      )
    );

    return await solana.sendAndConfirmTransaction(this._connection, tx, [
      walletKeypair,
    ]);
  }

  async setAuthorityOfTokenAccount(
    tokenPublicKey,
    currentAutorityKeypair,
    newAutorityPublicKey,
    type,
    multiSigners = []
  ) {
    tokenPublicKey = this.getPublicKey(tokenPublicKey);
    newAutorityPublicKey = this.getPublicKey(newAutorityPublicKey);
    currentAutorityKeypair = this.getKeypair(currentAutorityKeypair);

    const tx = new solana.Transaction().add(
      spl.Token.createSetAuthorityInstruction(
        spl.TOKEN_PROGRAM_ID, // always TOKEN_PROGRAM_ID
        tokenPublicKey,
        newAutorityPublicKey,
        type, //there are 4 types => 'MintTokens' | 'FreezeAccount' | 'AccountOwner' | 'CloseAccount'
        currentAutorityKeypair.publicKey, // mint authority
        multiSigners // only multisig account will use.
      )
    );

    return await solana.sendAndConfirmTransaction(this._connection, tx, [
      currentAutorityKeypair,
    ]);
  }

  async approve(
    tokenPublicKey,
    ownerKeypair,
    amount,
    tokenAccountPublicKey = null,
    multiSigners = []
  ) {
    tokenPublicKey = this.getPublicKey(tokenPublicKey);
    ownerKeypair = this.getKeypair(ownerKeypair);
    tokenAccountPublicKey = this.getPublicKey(
      tokenAccountPublicKey || // receiver (sholud be a token account)
        (await this.getOrCreateTokenAccount(ownerKeypair, tokenPublicKey))
          .tokenAccountPublicKey
    );

    let tx = new solana.Transaction().add(
      spl.Token.createSetAuthorityInstruction(
        spl.TOKEN_PROGRAM_ID, // always TOKEN_PROGRAM_ID
        tokenAccountPublicKey,
        ownerKeypair.publicKey, // mint authority
        multiSigners, // only multisig account will use.
        amount
      )
    );

    return await solana.sendAndConfirmTransaction(this._connection, tx, [
      ownerKeypair,
    ]);
  }

  async revoke(
    tokenPublicKey,
    ownerKeypair,
    tokenAccountPublicKey = null,
    multiSigners = []
  ) {
    tokenPublicKey = this.getPublicKey(tokenPublicKey);
    ownerKeypair = this.getKeypair(ownerKeypair);
    tokenAccountPublicKey = this.getPublicKey(
      tokenAccountPublicKey || // receiver (sholud be a token account)
        (await this.getOrCreateTokenAccount(ownerKeypair, tokenPublicKey))
          .tokenAccountPublicKey
    );

    let tx = new solana.Transaction().add(
      spl.Token.createRevokeInstruction(
        spl.TOKEN_PROGRAM_ID, // always TOKEN_PROGRAM_ID
        tokenAccountPublicKey,
        ownerKeypair.publicKey, // mint authority
        multiSigners // only multisig account will use.
      )
    );

    return await solana.sendAndConfirmTransaction(this._connection, tx, [
      ownerKeypair,
    ]);
  }

  async getTransactionCost(keypair, lamports = 10) {
    keypair = this.getKeypair(keypair);
    const recentBlockhash = await this._connection.getRecentBlockhash();

    const tx = new solana.Transaction({
      recentBlockhash: recentBlockhash.blockhash,
    }).add(
      solana.SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: keypair.publicKey,
        lamports: lamports,
      })
    );

    tx.sign(keypair);
    return (
      (tx.signatures.length *
        recentBlockhash.feeCalculator.lamportsPerSignature) /
      solana.LAMPORTS_PER_SOL
    );
  }

  async getWrappedSolToken() {
    return spl.NATIVE_MINT;
  }

  async getWrappedSolAccount(walletPublicKey) {
    walletPublicKey = this.getPublicKey(walletPublicKey);

    return await spl.Token.getAssociatedTokenAddress(
      spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      spl.TOKEN_PROGRAM_ID,
      spl.NATIVE_MINT,
      walletPublicKey
    );
  }

  async getValidators(commitment = null) {
    return await this._connection.getVoteAccounts(commitment);
  }

  async createStakeAccount(
    walletKeypair,
    amountToStake,
    stakeAccountKeypair = null
  ) {
    walletKeypair = this.getKeypair(walletKeypair);
    stakeAccountKeypair = stakeAccountKeypair
      ? this.getKeypair(stakeAccountKeypair)
      : solana.Keypair.generate();
    // Setup a transaction to create our stake account
    // Note: `StakeProgram.createAccount` returns a `Transaction` preconfigured with the necessary `TransactionInstruction`s
    const createStakeAccountTx = solana.StakeProgram.createAccount({
      authorized: new Authorized(walletPublicKey, walletKeypair.publicKey), // Here we set two authorities: Stake Authority and Withdrawal Authority. Both are set to our wallet.
      fromPubkey: walletKeypair.publicKey,
      lamports: amountToStake,
      lockup: new solana.Lockup(0, 0, amountToStake), // Optional. We'll set this to 0 for demonstration purposes.
      stakePubkey: stakeAccountKeypair.publicKey,
    });

    const txInfo = await solana.sendAndConfirmTransaction(
      this._connection,
      createStakeAccountTx,
      [walletKeypair, stakeAccountKeypair]
    );

    return {
      stakeAccountKeypair,
      txInfo,
    };
  }

  async getStakeAccountBalance(stakeAccountPublicKey) {
    stakeAccountKeypair = this.getKeypair(stakeAccountKeypair);
    return await this._connection.getBalance(stakeAccountPublicKey);
  }

  // Verify the status of our stake account. This will start as inactive and will take some time to activate.
  async getStakeAccountStatus(stakeAccountPublicKey) {
    stakeAccountKeypair = this.getKeypair(stakeAccountKeypair);
    return await this._connection.getStakeActivation(stakeAccountPublicKey);
  }

  async delegateStack(
    stakeAccountPublicKey,
    walletKeypair,
    selectedValidatorPublicKey
  ) {
    stakeAccountKeypair = this.getKeypair(stakeAccountKeypair);
    walletKeypair = this.getKeypair(walletKeypair);
    selectedValidatorPublicKey = this.getPublicKey(selectedValidatorPublicKey);

    // With a validator selected, we can now setup a transaction that delegates our stake to their vote account.
    const delegateTx = solana.StakeProgram.delegate({
      stakePubkey: stakeAccountPublicKey.publicKey,
      authorizedPubkey: walletKeypair.publicKey,
      votePubkey: selectedValidatorPublicKey,
    });

    return await solana.sendAndConfirmTransaction(
      this._connection,
      delegateTx,
      [walletKeypair]
    );
  }

  async deactivateStack(stakeAccountPublicKey, walletKeypair) {
    stakeAccountKeypair = this.getKeypair(stakeAccountKeypair);
    walletKeypair = this.getKeypair(walletKeypair);

    // With a validator selected, we can now setup a transaction that delegates our stake to their vote account.
    const deactivateTx = solana.StakeProgram.deactivate({
      stakePubkey: stakeAccountPublicKey.publicKey,
      authorizedPubkey: walletKeypair.publicKey,
    });

    return await solana.sendAndConfirmTransaction(
      this._connection,
      deactivateTx,
      [walletKeypair]
    );
  }

  async withdrawStack(stakeAccountPublicKey, walletKeypair, amount = null) {
    stakeAccountKeypair = this.getKeypair(stakeAccountKeypair);
    walletKeypair = this.getKeypair(walletKeypair);

    // With a validator selected, we can now setup a transaction that delegates our stake to their vote account.
    const withdrawTx = solana.StakeProgram.withdraw({
      stakePubkey: stakeAccountPublicKey.publicKey,
      authorizedPubkey: walletKeypair.publicKey,
      toPubkey: walletKeypair.publicKey,
      lamports: amount
        ? amount
        : this.getStakeAccountBalance(stakeAccountPublicKey),
    });

    return await solana.sendAndConfirmTransaction(
      this._connection,
      withdrawTx,
      [walletKeypair]
    );
  }

  async createNft(ownerKeypair, nftKeypair = null) {
    const { token, tokenTx } = await this.createToken(
      ownerKeypair,
      0,
      false,
      nftKeypair
    );

    const mintTx = await this.mint(token, ownerKeypair, 1);
    const authorityTx = this.setAuthorityOfTokenAccount(
      ownerKeypair,
      null,
      this._authorityTypes.mint
    );

    return {
      token,
      tokenTx,
      mintTx,
      authorityTx,
    };
  }

  arweaveConnect(arweaveConfig = null) {
    return Arweave.init(
      arweaveConfig || {
        host: "arweave.net",
        port: 443,
        protocol: "https",
        timeout: 20000,
        logging: false,
      }
    );
  }

  async createArweaveWallet(arweaveInstance) {
    return await arweaveInstance.wallets.generate(); // returns a private key
  }

  async getArweaveWalletPublicKey(arweaveInstance, arweaveWalletPrivateKey) {
    return await arweaveInstance.wallets.jwkToAddress(arweaveWalletPrivateKey); // returns a private key
  }

  async getArweaveWalletBalance(arweaveInstance, arweaveWalletPublicKey) {
    return await arweaveInstance.ar.winstonToAr(
      await arweaveInstance.wallets.getBalance(arweaveWalletPublicKey)
    );
  }

  async getArweaveWalletLastTransaction(
    arweaveInstance,
    arweaveWalletPublicKey
  ) {
    return await arweaveInstance.wallets.getLastTransactionID(
      arweaveWalletPublicKey
    );
  }

  async arweaveTransfer(
    arweaveInstance,
    fromWalletPrivateKey,
    toWalletPublicKey,
    amount,
    arweaveWallet = null
  ) {
    const a = arweaveInstance;
    const wallet = arweaveWallet || (await a.wallets.generate());
    const walletAddress = await a.wallets.jwkToAddress(wallet);

    let tx = await arweave.createTransaction(
      {
        target: toWalletPublicKey,
        quantity: arweave.ar.arToWinston(amount),
      },
      fromWalletPrivateKey
    );

    await a.transactions.sign(tx, fromWalletPrivateKey);
    let txInfo = await a.transactions.post(tx);
    txInfo.url = txInfo.id ? "https://arweave.net/" + txInfo.id : null;
    txInfo.wallet = wallet;
    txInfo.walletAddress = walletAddress;
    return txInfo;
  }

  async getArweaveTransactionStatus(arweaveInstance, transactionId) {
    return await arweaveInstance.transactions.getStatus(transactionId);
  }

  async getArweaveTransactionInfo(arweaveInstance, transactionId) {
    return await arweaveInstance.transactions.get(transactionId);
  }

  async getArweaveTransactionData(arweaveInstance, transactionId) {
    return await arweaveInstance.transactions.getData(transactionId);
  }

  async arweavePost(arweaveInstance, tx, chunkCallback = null) {
    const uploader = await arweaveInstance.transactions.getUploader(tx);

    while (!uploader.isComplete) {
      let chunkInfo = await uploader.uploadChunk();
      chunkInfo.percentComplete = uploader.pctComplete;
      chunkInfo.uploadedChunks = uploader.uploadedChunks;
      chunkInfo.totalChunks = uploader.totalChunks;

      if (chunkCallback) chunkCallback(chunkInfo);
    }
  }

  async getArweaveCost(fileSizesInBytes = [1000000]) {
    return await arweaveCost.calculate(fileSizesInBytes);

    // For example:
    // {
    //   arweave: 0.0009903326292,         // The cost to store the files in AR
    //   solana: 0.00025095896478276764,   // The cost in to store the files in SOL
    //   arweavePrice: 52.41,              // Current AR price
    //   solanaPrice: 206.82,              // Current SOL price
    //   exchangeRate: 0.2534087612416594, // AR/SOL rate
    //   totalBytes: 2024000,              // Total bytes calculated
    //   byteCost: 861158808,              // Cost of storage in winstons without fees
    //   fee: 129173821.19999999           // Total storage fees in winstons
    // }
  }

  async getTokenPrices() {
    //From coingecko
    return await arweaveCost.fetchTokenPrices();

    // For example:
    // {
    //   arweave: ...,
    //   solana: ...,
    //   ...
    // }
  }

  async getArweaveStorageCost() {
    //Without fees
    return await arweave.ar.winstonToAr(
      await arweaveCost.fetchArweaveStorageCost()
    ); //returns cost in Ar
  }

  async uploadData(
    arweaveInstance,
    data,
    arweaveWallet = null,
    chunkCallback = null,
    contentType = null
  ) {
    const a = arweaveInstance;
    const wallet = arweaveWallet || (await a.wallets.generate());
    const walletAddress = await a.wallets.jwkToAddress(wallet);
    const tx = await a.createTransaction({
      data: data,
    });

    if (contentType) tx.addTag("Content-Type", contentType);

    await a.transactions.sign(tx, wallet);
    let txInfo = await this.arweavePost(tx, chunkCallback);
    txInfo.url = txInfo.id ? "https://arweave.net/" + txInfo.id : null;
    txInfo.wallet = wallet;
    txInfo.walletAddress = walletAddress;
    return txInfo;
  }

  //Metadata format:
  // {
  //     name: "Custom NFT #1",
  //     symbol: "CNFT",
  //     description:
  //       "A description about my custom NFT #1",
  //     seller_fee_basis_points: 500,
  //     external_url: "https://www.customnft.com/",
  //     attributes: [
  //         {
  //             trait_type: "NFT type",
  //             value: "Custom"
  //         }
  //     ],
  //     collection: {
  //       name: "Test Collection",
  //       family: "Custom NFTs",
  //     },
  //     properties: {
  //       files: [
  //         {
  //           uri: imageUrl,
  //           type: "image/png",
  //         },
  //       ],
  //       category: "image",
  //       maxSupply: 0,
  //       creators: [
  //         {
  //           address: "CBBUMHRmbVUck99mTCip5sHP16kzGj3QTYB8K3XxwmQx",
  //           share: 100,
  //         },
  //       ],
  //     },
  //     image: imageUrl,
  //   }
  async uploadMetadata(
    arweaveInstance,
    metadata,
    arweaveWallet = null,
    chunkCallback = null
  ) {
    const a = arweaveInstance;
    const wallet = arweaveWallet || (await a.wallets.generate());
    const walletAddress = await a.wallets.jwkToAddress(wallet);
    const metadataRequest = JSON.stringify(metadata);
    const metadataTransaction = await a.createTransaction({
      data: metadataRequest,
    });
    metadataTransaction.addTag("Content-Type", "application/json");
    await a.transactions.sign(metadataTransaction, wallet);
    let txInfo = await this.arweavePost(metadataTransaction, chunkCallback);
    txInfo.url = txInfo.id ? "https://arweave.net/" + txInfo.id : null;
    txInfo.wallet = wallet;
    txInfo.walletAddress = walletAddress;
    return txInfo;
  }

  async uploadFile(
    arweaveInstance,
    filePath,
    arweaveWallet = null,
    chunkCallback = null,
    contentType = null
  ) {
    const a = arweaveInstance;
    const wallet = arweaveWallet || (await a.wallets.generate());
    const walletAddress = await a.wallets.jwkToAddress(wallet);
    const ext = path.extname(filePath);
    contentType = contentType || mime.contentType(ext);
    // Upload a file to Arweave
    const data = fs.readFileSync(filePath);
    const transaction = await a.createTransaction({
      data: data,
    });
    transaction.addTag("Content-Type", contentType);
    await a.transactions.sign(transaction, wallet);

    let txInfo = await this.arweavePost(transaction, chunkCallback);
    txInfo.url = txInfo.id ? "https://arweave.net/" + txInfo.id : null;
    txInfo.wallet = wallet;
    txInfo.walletAddress = walletAddress;
    return txInfo;
  }

  async mintNft(nftOwnerKeypair, url) {
    return await actions.mintNFT({
      connection: this._connection,
      wallet: new metaplex.NodeWallet(nftOwnerKeypair),
      uri: url,
      maxSupply: 1,
    });
  }

  async mintAndUploadNft(
    nftOwnerKeypair,
    filePath,
    metadata,
    arweaveWallet = null,
    contentType = null,
    arweaveConfig = null
  ) {
    const a = Arweave.init(
      arweaveConfig || {
        host: "arweave.net",
        port: 443,
        protocol: "https",
        timeout: 20000,
        logging: false,
      }
    );

    const wallet = arweaveWallet || (await a.wallets.generate());
    const metadataRequest = JSON.stringify(metadata);
    const metadataTransaction = await a.createTransaction({
      data: metadataRequest,
    });
    metadataTransaction.addTag("Content-Type", "application/json");
    await a.transactions.sign(metadataTransaction, wallet);
    const metadataResponse = await a.transactions.post(metadataTransaction);
    metadataResponse.url = metadataResponse.id
      ? "https://arweave.net/" + metadataResponse.id
      : null;
    metadataResponse.wallet = wallet;
    metadataResponse.walletAddress = walletAddress;

    if (metadataResponse.status != 200 || metadataResponse.id == null)
      return metadataResponse;

    const ext = path.extname(filePath);
    contentType = contentType || mime.contentType(ext);
    // Upload a file to Arweave
    const data = fs.readFileSync(filePath);
    const transaction = await a.createTransaction({
      data: data,
    });
    transaction.addTag("Content-Type", contentType);
    const walletAddress = await a.wallets.jwkToAddress(wallet);
    await a.transactions.sign(transaction, wallet);

    let response = await this.arweavePost(transaction);
    response.url = response.id ? "https://arweave.net/" + response.id : null;
    response.wallet = wallet;
    response.walletAddress = walletAddress;
    response.metadata = metadataResponse;

    if (response.status != 200 || response.id == null) return response;

    const mintNFTResponse = await actions.mintNFT({
      connection: this._connection,
      wallet: new metaplex.NodeWallet(nftOwnerKeypair),
      uri: response.url,
      maxSupply: 1,
    });

    mintNFTResponse.response = response;
    return mintNFTResponse;
  }

  async getNftMetadata(nftPublicKey) {
    nftPublicKey = this.getPublicKey(nftPublicKey);
    const metadataPDA = await mpl.Metadata.getPDA(nft);
    return await mpl.Metadata.load(this._connection, metadataPDA);
  }

  async getNftInfo(nftPublicKey) {
    const account = await metaplex.programs.Account.load(
      this._connection,
      nftPublicKey
    );
    const metadata = await metaplex.programs.Metadata.load(
      this._connection,
      nftPublicKey
    );
    const auction = await metaplex.programs.Auction.load(
      this._connection,
      nftPublicKey
    );
    const vault = await metaplex.Vault.load(this._connection, nftPublicKey);
    // Metaplex
    const auctionManager = await metaplex.AuctionManager.load(
      this._connection,
      nftPublicKey
    );
    const store = await Store.load(this._connection, nftPublicKey);

    return {
      account,
      metadata,
      auction,
      vault,
      auctionManager,
      store,
    };
  }

  async getNftAccountInfo(nftPublicKey) {
    nftPublicKey = this.getPublicKey(nftPublicKey);
    const largestAccounts = await this._connection.getTokenLargestAccounts(
      nftPublicKey
    );
    return await this._connection.getParsedAccountInfo(
      largestAccounts.value[0].address
    );
  }

  // /** getAccountFromNameService
  //  * @param {string} domain like "levi.sol"
  //  */
  // async getAccountFromNameService(domain) {
  //     const hashedName = await ns.getHashedName((domain.slice(-4) == '.sol' ? domain.slice(0, -4) : domain));
  //     const nameAccountKey = await ns.getNameAccountKey(
  //         hashedName,
  //         undefined,
  //         new PublicKey('58PwtjSDuFHuUkYjH9BYnnQKHfwo9reZhC2zMJv9JPkx') // SOL TLD Authority
  //     );

  //     const connection = this._cluster == this._clusters.main ?
  //         this._connection :
  //         new solana.Connection(this._clusterApiUrls[this._clusters.main]);

  //     const info = await ns.NameRegistryState.retrieve(connection, nameAccountKey);

  //     return {
  //         account: info.owner.toBase58(),
  //         info
  //     };
  // }

  // async getNameServiceFromAccount(accountpublicKey) {
  //     const connection = this._cluster == this._clusters.main ?
  //         this._connection :
  //         new solana.Connection(this._clusterApiUrls[this._clusters.main]);

  //     return await ns.performReverseLookup(connection, accountpublicKey);
  // }

  // async getSubDomain(subDomain, parentDomain = 'bonfida') {
  //     const connection = this._cluster == this._clusters.main ?
  //         this._connection :
  //         new solana.Connection(this._clusterApiUrls[this._clusters.main]);

  //     const hashedParentDomain = await ns.getHashedName(parentDomain);
  //     const parentDomainKey = await ns.getNameAccountKey(
  //         hashedParentDomain,
  //         undefined,
  //         new PublicKey('58PwtjSDuFHuUkYjH9BYnnQKHfwo9reZhC2zMJv9JPkx'), //SOL_TLD_AUTHORITY
  //     );

  //     const subDomainKey = await ns.getDNSRecordAddress(parentDomainKey, subDomain);
  //     return await ns.NameRegistryState.retrieve(connection, subDomainKey);
  // }

  // async findOwnedNameServiceAccounts(accountPublicKey) {
  //     const connection = this._cluster == this._clusters.main ?
  //         this._connection :
  //         new solana.Connection(this._clusterApiUrls[this._clusters.main]);

  //     const filters = [{
  //         memcmp: {
  //             offset: 32,
  //             bytes: accountPublicKey.toBase58(),
  //         },
  //     }, ];

  //     const accounts = await connection.getProgramAccounts(ns.NAME_PROGRAM_ID, {
  //         filters
  //     });

  //     return accounts.map((a) => a.publicKey);
  // }

  // async getTwitterHandle(accountPublicKey) {
  //     const connection = this._cluster == this._clusters.main ?
  //         this._connection :
  //         new solana.Connection(this._clusterApiUrls[this._clusters.main]);

  //     return await getHandleAndRegistryKey(
  //         connection,
  //         accountPublicKey
  //     );
  // }

  // async getdomainFromTwitterHandle(twiterHandle) {
  //     const connection = this._cluster == this._clusters.main ?
  //         this._connection :
  //         new solana.Connection(this._clusterApiUrls[this._clusters.main]);

  //     return await getTwitterRegistry(connection, twiterHandle);
  // };

  async getTokens(tags = null, cluster = null) {
    const tokenList = await new registery.TokenListProvider().resolve();
    if (tags != null && typeof tags == "string") tags = [tags];

    if (tags) for (const tag of tags) tokenList = tokenList.filterByTag(tag);

    return tokenList
      .filterByClusterSlug(cluster || this._clusters.main)
      .getList();
  }

  get connection() {
    return this._connection;
  }

  get cluster() {
    return this._cluster;
  }

  get clusters() {
    return Spl._clusters;
  }

  get clusterApiUrls() {
    return Spl._clusterApiUrls;
  }

  get authorityTypes() {
    return this._authorityTypes;
  }
}

class SplFactory {
  get clusters() {
    return {
      dev: "devnet",
      test: "testnet",
      main: "mainnet-beta",
    };
  }

  create(cluster = null) {
    return new Spl().connect(cluster);
  }
}

module.exports = new SplFactory();

// Solana spl token registery
// Example:
//
// {
//     "chainId": 101,
//     "address": "G6nZYEvhwFxxnp1KZr1v9igXtipuB5zL6oDGNMRZqF3q",
//     "symbol": "BAD",
//     "name": "EA Bad",
//     "decimals": 9,
//     "logoURI": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/G6nZYEvhwFxxnp1KZr1v9igXtipuB5zL6oDGNMRZqF3q/EABadlogo.PNG",
//     "tags": [
//       "utility-token",
//       "community-token",
//       "meme-token"
//     ],
//     "extensions": {
//       "twitter": "https://twitter.com/EABadtoken"
//     }
// },

//

// This list is used for deciding what to display in the popular tokens list
// in the `AddTokenDialog`.
//
// Icons, names, and symbols are fetched not from here, but from the
// @solana/spl-token-registry. To add an icon or token name to the wallet,
// add the mints to that package. To add a token to the `AddTokenDialog`,
// add the `mintAddress` here. The rest of the fields are not used.
//
// const POPULAR_TOKENS = {
//     [MAINNET_URL]: [
//       {
//         mintAddress: 'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt',
//         tokenName: 'Serum',
//         tokenSymbol: 'SRM',
//         icon:
//           'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x476c5E26a75bd202a9683ffD34359C0CC15be0fF/logo.png',
//       },
//       {
//         mintAddress: 'MSRMcoVyrFxnSgo5uXwone5SKcGhT1KEJMFEkMEWf9L',
//         tokenName: 'MegaSerum',
//         tokenSymbol: 'MSRM',
//         icon:
//           'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x476c5E26a75bd202a9683ffD34359C0CC15be0fF/logo.png',
//       },
//       {
//         tokenSymbol: 'BTC',
//         mintAddress: '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E',
//         tokenName: 'Wrapped Bitcoin',
//         icon:
//           'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png',
//       },
//       {
//         tokenSymbol: 'ETH',
//         mintAddress: '2FPyTwcZLUg1MDrwsyoP4D6s1tM7hAkHYRjkNb5w6Pxk',
//         tokenName: 'Wrapped Ethereum',
//         icon:
//           'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
//       },
//       {
//         tokenSymbol: 'FTT',
//         mintAddress: 'AGFEad2et2ZJif9jaGpdMixQqvW5i81aBdvKe7PHNfz3',
//         tokenName: 'Wrapped FTT',
//         icon:
//           'https://raw.githubusercontent.com/trustwallet/assets/f3ffd0b9ae2165336279ce2f8db1981a55ce30f8/blockchains/ethereum/assets/0x50D1c9771902476076eCFc8B2A83Ad6b9355a4c9/logo.png',
//       },
//       {
//         tokenSymbol: 'YFI',
//         mintAddress: '3JSf5tPeuscJGtaCp5giEiDhv51gQ4v3zWg8DGgyLfAB',
//         tokenName: 'Wrapped YFI',
//         icon:
//           'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e/logo.png',
//       },
//       {
//         tokenSymbol: 'LINK',
//         mintAddress: 'CWE8jPTUYhdCTZYWPTe1o5DFqfdjzWKc9WKz6rSjQUdG',
//         tokenName: 'Wrapped Chainlink',
//         icon:
//           'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png',
//       },
//       {
//         tokenSymbol: 'XRP',
//         mintAddress: 'Ga2AXHpfAF6mv2ekZwcsJFqu7wB4NV331qNH7fW9Nst8',
//         tokenName: 'Wrapped XRP',
//         icon:
//           'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ripple/info/logo.png',
//       },
//       {
//         tokenSymbol: 'USDT',
//         mintAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
//         tokenName: 'USDT',
//         icon:
//           'https://cdn.jsdelivr.net/gh/solana-labs/explorer/public/tokens/usdt.svg',
//       },
//       {
//         tokenSymbol: 'WUSDT',
//         mintAddress: 'BQcdHdAQW1hczDbBi9hiegXAR7A98Q9jx3X3iBBBDiq4',
//         tokenName: 'Wrapped USD Tether',
//         icon:
//           'https://raw.githubusercontent.com/trustwallet/assets/f3ffd0b9ae2165336279ce2f8db1981a55ce30f8/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
//       },
//       {
//         tokenSymbol: 'USDC',
//         mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
//         tokenName: 'USD Coin',
//         icon:
//           'https://raw.githubusercontent.com/trustwallet/assets/f3ffd0b9ae2165336279ce2f8db1981a55ce30f8/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
//       },
//       {
//         tokenSymbol: 'WUSDC',
//         mintAddress: 'BXXkv6z8ykpG1yuvUDPgh732wzVHB69RnB9YgSYh3itW',
//         tokenName: 'Wrapped USDC',
//         icon:
//           'https://raw.githubusercontent.com/trustwallet/assets/f3ffd0b9ae2165336279ce2f8db1981a55ce30f8/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
//         deprecated: true,
//       },
//       {
//         tokenSymbol: 'SUSHI',
//         mintAddress: 'AR1Mtgh7zAtxuxGd2XPovXPVjcSdY3i4rQYisNadjfKy',
//         tokenName: 'Wrapped SUSHI',
//         icon:
//           'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B3595068778DD592e39A122f4f5a5cF09C90fE2/logo.png',
//       },
//       {
//         tokenSymbol: 'ALEPH',
//         mintAddress: 'CsZ5LZkDS7h9TDKjrbL7VAwQZ9nsRu8vJLhRYfmGaN8K',
//         tokenName: 'Wrapped ALEPH',
//         icon:
//           'https://raw.githubusercontent.com/trustwallet/assets/6996a371cd02f516506a8f092eeb29888501447c/blockchains/nuls/assets/NULSd6HgyZkiqLnBzTaeSQfx1TNg2cqbzq51h/logo.png',
//       },
//       {
//         tokenSymbol: 'SXP',
//         mintAddress: 'SF3oTvfWzEP3DTwGSvUXRrGTvr75pdZNnBLAH9bzMuX',
//         tokenName: 'Wrapped SXP',
//         icon:
//           'https://github.com/trustwallet/assets/raw/b0ab88654fe64848da80d982945e4db06e197d4f/blockchains/ethereum/assets/0x8CE9137d39326AD0cD6491fb5CC0CbA0e089b6A9/logo.png',
//       },
//       {
//         tokenSymbol: 'HGET',
//         mintAddress: 'BtZQfWqDGbk9Wf2rXEiWyQBdBY1etnUUn6zEphvVS7yN',
//         tokenName: 'Wrapped HGET',
//       },
//       {
//         tokenSymbol: 'CREAM',
//         mintAddress: '5Fu5UUgbjpUvdBveb3a1JTNirL8rXtiYeSMWvKjtUNQv',
//         tokenName: 'Wrapped CREAM',
//         icon:
//           'https://raw.githubusercontent.com/trustwallet/assets/4c82c2a409f18a4dd96a504f967a55a8fe47026d/blockchains/smartchain/assets/0xd4CB328A82bDf5f03eB737f37Fa6B370aef3e888/logo.png',
//       },
//       {
//         tokenSymbol: 'UBXT',
//         mintAddress: '873KLxCbz7s9Kc4ZzgYRtNmhfkQrhfyWGZJBmyCbC3ei',
//         tokenName: 'Wrapped UBXT',
//       },
//       {
//         tokenSymbol: 'HNT',
//         mintAddress: 'HqB7uswoVg4suaQiDP3wjxob1G5WdZ144zhdStwMCq7e',
//         tokenName: 'Wrapped HNT',
//       },
//       {
//         tokenSymbol: 'FRONT',
//         mintAddress: '9S4t2NEAiJVMvPdRYKVrfJpBafPBLtvbvyS3DecojQHw',
//         tokenName: 'Wrapped FRONT',
//         icon:
//           'https://raw.githubusercontent.com/trustwallet/assets/6e375e4e5fb0ffe09ed001bae1ef8ca1d6c86034/blockchains/ethereum/assets/0xf8C3527CC04340b208C854E985240c02F7B7793f/logo.png',
//       },
//       {
//         tokenSymbol: 'AKRO',
//         mintAddress: '6WNVCuxCGJzNjmMZoKyhZJwvJ5tYpsLyAtagzYASqBoF',
//         tokenName: 'Wrapped AKRO',
//         icon:
//           'https://raw.githubusercontent.com/trustwallet/assets/878dcab0fab90e6593bcb9b7d941be4915f287dc/blockchains/ethereum/assets/0xb2734a4Cec32C81FDE26B0024Ad3ceB8C9b34037/logo.png',
//       },
//       {
//         tokenSymbol: 'HXRO',
//         mintAddress: 'DJafV9qemGp7mLMEn5wrfqaFwxsbLgUsGVS16zKRk9kc',
//         tokenName: 'Wrapped HXRO',
//       },
//       {
//         tokenSymbol: 'UNI',
//         mintAddress: 'DEhAasscXF4kEGxFgJ3bq4PpVGp5wyUxMRvn6TzGVHaw',
//         tokenName: 'Wrapped UNI',
//         icon:
//           'https://raw.githubusercontent.com/trustwallet/assets/08d734b5e6ec95227dc50efef3a9cdfea4c398a1/blockchains/ethereum/assets/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984/logo.png',
//       },
//       {
//         tokenSymbol: 'MATH',
//         mintAddress: 'GeDS162t9yGJuLEHPWXXGrb1zwkzinCgRwnT8vHYjKza',
//         tokenName: 'Wrapped MATH',
//       },
//       {
//         tokenSymbol: 'TOMO',
//         mintAddress: 'GXMvfY2jpQctDqZ9RoU3oWPhufKiCcFEfchvYumtX7jd',
//         tokenName: 'Wrapped TOMO',
//         icon:
//           'https://raw.githubusercontent.com/trustwallet/assets/08d734b5e6ec95227dc50efef3a9cdfea4c398a1/blockchains/tomochain/info/logo.png',
//       },
//       {
//         tokenSymbol: 'LUA',
//         mintAddress: 'EqWCKXfs3x47uVosDpTRgFniThL9Y8iCztJaapxbEaVX',
//         tokenName: 'Wrapped LUA',
//         icon:
//           'https://raw.githubusercontent.com/trustwallet/assets/2d2491130e6beda208ba4fc6df028a82a0106ab6/blockchains/ethereum/assets/0xB1f66997A5760428D3a87D68b90BfE0aE64121cC/logo.png',
//       },
//       {
//         tokenSymbol: 'FIDA',
//         mintAddress: 'EchesyfXePKdLtoiZSL8pBe8Myagyy8ZRqsACNCFGnvp',
//         tokenName: 'Bonfida Token',
//         icon:
//           'https://raw.githubusercontent.com/dr497/awesome-serum-markets/master/icons/fida.svg',
//       },
//       {
//         tokenSymbol: 'LQID',
//         mintAddress: 'A6aY2ceogBz1VaXBxm1j2eJuNZMRqrWUAnKecrMH85zj',
//         tokenName: 'LQID',
//         icon:
//           'https://raw.githubusercontent.com/dr497/awesome-serum-markets/master/icons/lqid.svg',
//       },
//       {
//         tokenSymbol: 'SECO',
//         mintAddress: '7CnFGR9mZWyAtWxPcVuTewpyC3A3MDW4nLsu5NY6PDbd',
//         tokenName: 'Serum Ecosystem Pool Token',
//       },
//       {
//         tokenSymbol: 'HOLY',
//         mintAddress: '3GECTP7H4Tww3w8jEPJCJtXUtXxiZty31S9szs84CcwQ',
//         tokenName: 'Holy Trinity Pool',
//       },
//       {
//         tokenSymbol: 'KIN',
//         mintAddress: 'kinXdEcpDQeHPEuQnqmUgtYykqKGVFq6CeVX5iAHJq6',
//         tokenName: 'KIN',
//         icon:
//           'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/kin/info/logo.png',
//       },
//       {
//         tokenSymbol: 'MAPS',
//         mintAddress: 'MAPS41MDahZ9QdKXhVa4dWB9RuyfV4XqhyAZ8XcYepb',
//         tokenName: 'Maps.me Token',
//       },
//       {
//         tokenSymbol: 'RAY',
//         mintAddress: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
//         tokenName: 'Raydium',
//         icon:
//           'https://raw.githubusercontent.com/raydium-io/media-assets/master/logo.svg',
//       },
//       {
//         tokenSymbol: 'OXY',
//         mintAddress: 'z3dn17yLaGMKffVogeFHQ9zWVcXgqgf3PQnDsNs2g6M',
//         tokenName: 'Oxygen Protocol',
//         icon:
//           'https://raw.githubusercontent.com/nathanielparke/awesome-serum-markets/master/icons/oxy.svg',
//       },
//       {
//         tokenSymbol: 'COPE',
//         mintAddress: '3K6rftdAaQYMPunrtNRHgnK2UAtjm2JwyT2oCiTDouYE',
//         tokenName: 'COPE',
//         icon:
//           'https://cdn.jsdelivr.net/gh/solana-labs/token-list/assets/mainnet/3K6rftdAaQYMPunrtNRHgnK2UAtjm2JwyT2oCiTDouYE/logo.jpg',
//       },
//       {
//         tokenSymbol: 'BRZ',
//         mintAddress: 'FtgGSFADXBtroxq8VCausXRr2of47QBf5AS1NtZCu4GD',
//         tokenName: 'Brazilian Digital Token',
//         icon:
//           'https://cdn.jsdelivr.net/gh/solana-labs/explorer/public/tokens/brz.png',
//       },
//       {
//         tokenSymbol: 'STEP',
//         mintAddress: 'StepAscQoEioFxxWGnh2sLBDFp9d8rvKz2Yp39iDpyT',
//         tokenName: 'Step',
//         icon:
//           'https://cdn.jsdelivr.net/gh/solana-labs/token-list/assets/mainnet/StepAscQoEioFxxWGnh2sLBDFp9d8rvKz2Yp39iDpyT/logo.png',
//       },
//       {
//         tokenSymbol: 'SLRS',
//         mintAddress: 'SLRSSpSLUTP7okbCUBYStWCo1vUgyt775faPqz8HUMr',
//         tokenName: 'Solrise Finance',
//         icon:
//           'https://i.ibb.co/tqbTKTT/slrs-256.png',
//       },
//       {
//         tokenSymbol: 'SAMO',
//         mintAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
//         tokenName: 'Samoyed Coin',
//         icon:
//           'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU/logo.png',
//       },
//       {
//         tokenSymbol: 'stSOL',
//         mintAddress: '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj',
//         tokenName: 'Lido Staked SOL',
//         icon:
//           'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj/logo.png',
//       },
//     ],
//   };

// Metaplex standard:
// {
//   "name": "Divinity - DevNet",
//   "symbol": "DIV",
//   "description": "You will probably want to check out https:// solcypher.com to win prizes or thank the creators of this doc.",
//   "seller_fee_basis_points": 700,
//   "image": "https://arweave.net/Umi1tOw4hIPn8VkJtq_fjamMgT-YCOGa55g22t6sT6M?ext=jpg",
//   "attributes": [
//     {
//       "trait_type": "cypher",
//       "value": "Divinity"
//     },
//     {
//       "trait_type": "game",
//       "value": "The Old Castle"
//     }
//   ],
//   "collection": {
//     "name": "The Old Castle",
//     "family": "SolCypher"
//   },
//   "properties": {
//     "files": [
//       {
//         "uri": "https://oabackuplocationofyourfile.jpg",
//         "type": "image/jpg"
//       }
//     ],
//     "category": "image",
//     "creators": [
//       {
//         "address": "AvFLeGBFDthzdoct5mHpbUE8ZJdYD4oZXpksoRiws8AG",
//         "share": 100
//       }
//     ]
//   }
// }
