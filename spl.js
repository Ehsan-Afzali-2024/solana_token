const solana = require("@solana/web3.js");
const spl = require("@solana/spl-token");
const registery = require("@solana/spl-token-registry");
const fs = require("fs");
const path = require("path");
const mime = require("mime-types");
const Arweave = require("arweave");
// const metaplex = require("@metaplex/js");
// const arweaveCost = require("@metaplex/arweave-cost");
// const mpl = require("@metaplex-foundation/mpl-token-metadata");
const { Wallet } = require("./wallet");
// const ns = require('@bonfida/spl-name-service');

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

  /**
   * Gets the current database connection.
   * @returns {string} The database connection object.
   */
  get connection() {
    return this._connection;
  }

  /**
   * Gets the current cluster configuration.
   * @returns {string} The current cluster object.
   */
  get cluster() {
    return this._cluster;
  }

  /**
   * Gets the list of available clusters.
   * @returns {Object} An array of cluster objects.
   */
  get clusters() {
    return Spl._clusters;
  }

  /**
   * Gets the URLs for the cluster APIs.
   * @returns {Array<string>} An array of cluster API URLs.
   */
  get clusterApiUrls() {
    return Spl._clusterApiUrls;
  }

  /**
   * Gets the types of authorities defined in the current context.
   * @returns {Array<string>} An array of authority type objects.
   */
  get authorityTypes() {
    return this._authorityTypes;
  }

  /**
   * Connects to the specified Solana cluster.
   * @param {string} cluster - The cluster to connect to (devnet, testnet, mainnet-beta).
   * @returns {Spl} The instance of the class for method chaining.
   */
  connect(cluster = null) {
    this._cluster = cluster || this._clusters.dev;
    this._connection = new solana.Connection(
      this._clusterApiUrls[this._cluster],
      "confirmed"
    );
    return this;
  }

  /**
   * Retrieves the public key from a wallet.
   * @param {solana.PublicKey|Wallet} wallet - The wallet object.
   * @returns {solana.PublicKey} The public key of the wallet.
   */
  getPublicKey(wallet) {
    return wallet instanceof solana.PublicKey ? wallet : wallet.publicKey;
  }

  /**
   * Gets the keypair from a wallet.
   * @param {solana.Keypair|Wallet} wallet - The wallet object.
   * @returns {solana.Keypair} The keypair of the wallet.
   */
  getKeypair(wallet) {
    return wallet instanceof solana.Keypair ? wallet : wallet.keypair;
  }

  /**
   * Requests an airdrop of SOL tokens to the specified public key.
   * @param {solana.PublicKey|Wallet} publicKey - The public key to receive the SOL tokens.
   * @param {number} [amount=null] - The amount of SOL to request (default is 1 SOL).
   * @returns {Promise<Object>} A promise that resolves to the airdrop transaction confirmation.
   */
  async getSomeSol(publicKey, amount = null) {
    publicKey = this.getPublicKey(publicKey);
    const airdropSignature = await this._connection.requestAirdrop(
      publicKey,
      (amount || 1) * solana.LAMPORTS_PER_SOL
    );
    const latestBlockHash = await connection.getLatestBlockhash();

    // Confirming the transaction and using TransactionConfirmationStrategy
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignature,
    }); // airdrop info
  }

  /**
   * Generates a new keypair, optionally ensuring the public key starts with a specified prefix.
   * @param {string|null} publicKeyPrefix - The prefix the public key should start with (optional).
   * @returns {solana.Keypair} The generated keypair.
   */
  generateKeypair(publicKeyPrefix = null) {
    const keypair = solana.Keypair.generate();

    if (!publicKeyPrefix) return keypair;

    while (!keypair.publicKey.toString().startsWith(publicKeyPrefix))
      keypair = solana.Keypair.generate();

    return keypair;
  }

  /**
   * Initializes a new transaction.
   * @returns {solana.Transaction} A new Solana transaction.
   */
  beginTransaction() {
    let tx = new solana.Transaction();
    tx._signers_ = [];
    return tx;
  }

  /**
   * Sends and confirms the provided transaction.
   * @param {solana.Transaction} transferTransaction - The transaction to send.
   * @returns {Promise<Object>} The confirmation result of the transaction.
   */
  async endTransaction(transferTransaction) {
    return await solana.sendAndConfirmTransaction(
      this._connection,
      transferTransaction,
      transferTransaction._signers_
    );
  }

  /**
   * Transfers SOL tokens from one account to another.
   * @param {solana.Keypair|Wallet} fromKeypair - The sender's keypair.
   * @param {solana.PublicKey|Wallet} toPublicKey - The recipient's public key.
   * @param {number} solAmount - The amount of SOL to transfer.
   * @param {solana.Transaction|null} transferTransaction - An optional transaction to use (if null, a new transaction will be created).
   * @returns {Promise<Object>} The transaction information or confirmation.
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

  /**
   * Transfers SPL tokens from one account to another.
   * @param {solana.PublicKey|Wallet} tokenPublicKey - The public key of the token mint.
   * @param {solana.Keypair|Wallet} fromKeypair - The sender's keypair.
   * @param {solana.Keypair|Wallet} toKeypair - The recipient's keypair.
   * @param {number} amount - The amount of tokens to transfer.
   * @param {solana.Transaction|null} transferTransaction - An optional transaction to use.
   * @param {Array} multiSigners - Optional additional signers for multisignature transactions.
   * @returns {Promise<Object>} The transaction information or confirmation.
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

  /**
   * Transfers SPL tokens using the specified parameters.
   * @param {solana.PublicKey|Wallet} tokenPublicKey - The token public key.
   * @param {solana.Keypair|Wallet} walletKeypair - The wallet keypair.
   * @param {solana.PublicKey|Wallet} fromPublicKey - The sender's public key.
   * @param {solana.PublicKey|Wallet} toPublicKey - The recipient's public key.
   * @param {number} amount - The amount of tokens to transfer.
   * @param {solana.Transaction|null} transferTransaction - An optional transaction to use.
   * @param {Array} multiSigners - Optional additional signers for multisignature transactions.
   * @returns {Promise<Object>} The transaction information or confirmation.
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

  /**
   * Transfers data to the specified account.
   * @param {solana.Keypair|Wallet} keypair - The keypair of the account sending the data.
   * @param {string} data - The data to be transferred.
   * @param {solana.Transaction|null} transferTransaction - An optional transaction to use.
   * @param {string} format - The format of the data (default is 'utf-8').
   * @returns {Promise<Object>} The transaction information or confirmation.
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

  /**
   * Generates a link to view the account on Solscan.
   * @param {solana.PublicKey|Wallet} accountPublicKey - The public key of the account.
   * @returns {string} The URL to view the account on Solscan.
   */
  getAccountLink(accountPublicKey) {
    accountPublicKey = this.getPublicKey(accountPublicKey);
    return (
      "https://solscan.io/account/" +
      accountPublicKey.toBase58() +
      "?cluster=" +
      this._cluster
    );
  }

  /**
   * Generates a link to view a transaction on Solscan.
   * @param {string} txHash - The hash of the transaction.
   * @returns {string} The URL to view the transaction on Solscan.
   */
  getTransactionLink(txHash) {
    return "https://solscan.io/tx/" + txHash + "?cluster=" + this._cluster;
  }

  /**
   * Generates a link to view token charts on Birdeye.
   * @param {solana.PublicKey|Wallet} tokenPublicKey - The public key of the token.
   * @returns {string} The URL to view the token chart on BirdEye.
   */
  getChartLink(tokenPublicKey) {
    tokenPublicKey = this.getPublicKey(tokenPublicKey);
    return "https://birdeye.so/token/" + tokenPublicKey.toBase58();
  }

  /**
   * Sleeps for the specified amount of milliseconds.
   * @param {number} ms - The number of milliseconds to sleep.
   * @returns {Promise<void>} A promise that resolves when the sleep time has elapsed.
   */
  async sleep(ms) {
    return await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Checks if an account exists on the blockchain.
   * @param {solana.PublicKey|Wallet} walletPublicKey - The public key of the wallet.
   * @returns {Promise<boolean>} A promise that resolves to true if the account exists, false otherwise.
   */
  async accountExists(walletPublicKey) {
    walletPublicKey = this.getPublicKey(walletPublicKey);
    const info = await this._connection.getParsedAccountInfo(walletPublicKey);
    return info.value !== null;
  }

  /**
   * Checks if a token account exists for a given wallet and token.
   * @param {solana.PublicKey|Wallet} walletPublicKey - The public key of the wallet.
   * @param {solana.PublicKey|Wallet} tokenPublicKey - The public key of the token.
   * @returns {Promise<boolean>} A promise that resolves to true if the token account exists, false otherwise.
   */
  async tokenAccountExists(walletPublicKey, tokenPublicKey) {
    const info = await this.getTokenAccountInfo(
      walletPublicKey,
      tokenPublicKey
    );
    return info.value !== null && info.value.length > 0;
  }

  /**
   * Retrieves the token account information for a wallet.
   * @param {solana.PublicKey|Wallet} walletPublicKey - The public key of the wallet.
   * @param {solana.PublicKey|Wallet|null} tokenPublicKey - The public key of the token (optional).
   * @returns {Promise<Object>} A promise that resolves to the token account information.
   */
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

  /**
   * Retrieves or creates an associated token account for the specified wallet and token.
   * @param {solana.Keypair|Wallet} walletKeypair - The keypair of the wallet to use.
   * @param {solana.PublicKey|Wallet} tokenPublicKey - The public key of the token mint.
   * @returns {Promise<Object>} An object containing the token account public key and transaction info.
   */
  async getOrCreateTokenAccount(walletKeypair, tokenPublicKey) {
    walletKeypair = this.getKeypair(walletKeypair);
    tokenPublicKey = this.getPublicKey(tokenPublicKey);

    const tokenAccountPublicKey = await spl.Token.getAssociatedTokenAddress(
      spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      spl.TOKEN_PROGRAM_ID,
      tokenPublicKey,
      walletKeypair.publicKey
    );

    if (await this.accountExists(tokenAccountPublicKey))
      return {
        tokenAccountPublicKey,
        txInfo: null,
      };

    const tx = new solana.Transaction().add(
      spl.Token.createAssociatedTokenAccountInstruction(
        spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        spl.TOKEN_PROGRAM_ID,
        tokenPublicKey,
        tokenAccountPublicKey,
        walletKeypair.publicKey,
        walletKeypair.publicKey
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

  /**
   * Creates a new token with the specified parameters.
   * @param {solana.Keypair|Wallet} ownerKeypair - The keypair of the token owner.
   * @param {number} [decimals=9] - The number of decimals for the token.
   * @param {boolean} [hasFreezeAuthority=false] - Whether the token has a freeze authority.
   * @param {solana.Keypair|Wallet} [tokenKeypair=null] - The keypair for the new token mint.
   * @returns {Promise<Object>} An object containing the created token and transaction info.
   */
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
    );

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

  /**
   * Retrieves information about a token mint.
   * @param {solana.PublicKey|Wallet} tokenPublicKey - The public key of the token mint.
   * @returns {Promise<Object>} An object containing the token's supply, decimals, mint authority, and freeze authority.
   */
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

  /**
   * Retrieves the SOL balance of a specified public key.
   * @param {solana.PublicKey|Wallet} publicKey - The public key of the wallet.
   * @returns {Promise<number>} The balance in SOL.
   */
  async getSolBalance(publicKey) {
    publicKey = this.getPublicKey(publicKey);
    return (
      Number(await this._connection.getBalance(publicKey)) /
      solana.LAMPORTS_PER_SOL
    );
  }

  /**
   * Retrieves the balance of a specified token account.
   * @param {solana.PublicKey|Wallet} tokenAccountPublicKey - The public key of the token account.
   * @returns {Promise<number>} The balance of the token account in the token's smallest unit.
   */
  async getTokenAccountBalance(tokenAccountPublicKey) {
    tokenAccountPublicKey = this.getPublicKey(tokenAccountPublicKey);
    const tokenAmount = await this._connection.getTokenAccountBalance(
      tokenAccountPublicKey
    );
    return tokenAmount.value.amount / Math.pow(10, tokenAmount.value.decimals);
  }

  /**
   * Mints a specified amount of tokens to a receiver's token account.
   * @param {solana.PublicKey|Wallet} tokenPublicKey - The public key of the token mint.
   * @param {solana.Keypair|Wallet} ownerKeypair - The keypair of the mint authority.
   * @param {number} amount - The amount of tokens to mint.
   * @param {solana.Keypair|Wallet} [receiverKeypair=null] - The keypair of the receiver (optional).
   * @param {Array<solana.Keypair>} [multiSigners=[]] - Additional signers for multisig accounts (optional).
   * @returns {Promise<solana.TransactionSignature>} The transaction signature of the mint operation.
   */
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
      // receiver (should be a token account)
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

  /**
   * Mints a specified amount of tokens directly to a specified token account.
   * @param {solana.PublicKey|Wallet} tokenPublicKey - The public key of the token mint.
   * @param {solana.Keypair|Wallet} ownerKeypair - The keypair of the mint authority.
   * @param {number} amount - The amount of tokens to mint.
   * @param {solana.PublicKey|Wallet} [receiverTokenAccountPublicKey=null] - The public key of the receiver's token account (optional).
   * @param {Array<solana.Keypair>} [multiSigners=[]] - Additional signers for multisig accounts (optional).
   * @returns {Promise<solana.TransactionSignature>} The transaction signature of the mint operation.
   */
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
      receiverTokenAccountPublicKey || // receiver (should be a token account)
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

  /**
   * Burns a specified amount of tokens from the caller's token account.
   * @param {solana.PublicKey|Wallet} tokenPublicKey - The public key of the token mint.
   * @param {solana.Keypair|Wallet} walletKeypair - The keypair of the wallet burning the tokens.
   * @param {number} amount - The amount of tokens to burn.
   * @param {Array<solana.Keypair>} [multiSigners=[]] - Additional signers for multisig accounts (optional).
   * @returns {Promise<solana.TransactionSignature>} The transaction signature of the burn operation.
   */
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

  /**
   * Closes a specified token account, transferring any remaining balance to the owner's wallet.
   * @param {solana.PublicKey|Wallet} tokenPublicKey - The public key of the token mint.
   * @param {solana.Keypair|Wallet} walletKeypair - The keypair of the wallet that owns the token account.
   * @param {Array<solana.Keypair>} [multiSigners=[]] - Additional signers for multisig accounts (optional).
   * @returns {Promise<solana.TransactionSignature>} The transaction signature of the close operation.
   */
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
        walletKeypair.publicKey, // destination for remaining balance
        walletKeypair.publicKey, // mint authority (owner)
        multiSigners // only multisig account will use.
      )
    );

    return await solana.sendAndConfirmTransaction(this._connection, tx, [
      walletKeypair,
    ]);
  }

  /**
   * Sets a new authority for a specified token account.
   * @param {solana.PublicKey|Wallet} tokenPublicKey - The public key of the token mint.
   * @param {solana.Keypair|Wallet} currentAutorityKeypair - The keypair of the current authority.
   * @param {solana.PublicKey|Wallet} newAutorityPublicKey - The public key of the new authority.
   * @param {string} type - The type of authority being set ('MintTokens', 'FreezeAccount', 'AccountOwner', 'CloseAccount').
   * @param {Array<solana.Keypair>} [multiSigners=[]] - Additional signers for multisig accounts (optional).
   * @returns {Promise<solana.TransactionSignature>} The transaction signature of the set authority operation.
   */
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
        type, // authority type
        currentAutorityKeypair.publicKey, // current authority
        multiSigners // only multisig account will use.
      )
    );

    return await solana.sendAndConfirmTransaction(this._connection, tx, [
      currentAutorityKeypair,
    ]);
  }

  /**
   * Approves a specified amount of tokens to be spent by another account.
   * @param {solana.PublicKey|Wallet} tokenPublicKey - The public key of the token mint.
   * @param {solana.Keypair|Wallet} ownerKeypair - The keypair of the token account owner.
   * @param {number} amount - The amount of tokens to approve.
   * @param {solana.PublicKey|Wallet} [tokenAccountPublicKey=null] - The public key of the token account (optional).
   * @param {Array<solana.Keypair>} [multiSigners=[]] - Additional signers for multisig accounts (optional).
   * @returns {Promise<TransactionSignature>} The transaction signature of the approve operation.
   */
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
      tokenAccountPublicKey || // receiver (should be a token account)
        (await this.getOrCreateTokenAccount(ownerKeypair, tokenPublicKey))
          .tokenAccountPublicKey
    );

    let tx = new solana.Transaction().add(
      spl.Token.createApproveInstruction(
        spl.TOKEN_PROGRAM_ID, // always TOKEN_PROGRAM_ID
        tokenAccountPublicKey,
        ownerKeypair.publicKey, // authority
        multiSigners, // only multisig account will use.
        amount
      )
    );

    return await solana.sendAndConfirmTransaction(this._connection, tx, [
      ownerKeypair,
    ]);
  }

  /**
   * Revokes the approval of a previously approved amount of tokens.
   * @param {solana.PublicKey|Wallet} tokenPublicKey - The public key of the token mint.
   * @param {solana.Keypair|Wallet} ownerKeypair - The keypair of the token account owner.
   * @param {solana.PublicKey|Wallet} [tokenAccountPublicKey=null] - The public key of the token account (optional).
   * @param {Array<solana.Keypair>} [multiSigners=[]] - Additional signers for multisig accounts (optional).
   * @returns {Promise<solana.TransactionSignature>} The transaction signature of the revoke operation.
   */
  async revoke(
    tokenPublicKey,
    ownerKeypair,
    tokenAccountPublicKey = null,
    multiSigners = []
  ) {
    tokenPublicKey = this.getPublicKey(tokenPublicKey);
    ownerKeypair = this.getKeypair(ownerKeypair);
    tokenAccountPublicKey = this.getPublicKey(
      tokenAccountPublicKey || // receiver (should be a token account)
        (await this.getOrCreateTokenAccount(ownerKeypair, tokenPublicKey))
          .tokenAccountPublicKey
    );

    let tx = new solana.Transaction().add(
      spl.Token.createRevokeInstruction(
        spl.TOKEN_PROGRAM_ID, // always TOKEN_PROGRAM_ID
        tokenAccountPublicKey,
        ownerKeypair.publicKey, // authority
        multiSigners // only multisig account will use.
      )
    );

    return await solana.sendAndConfirmTransaction(this._connection, tx, [
      ownerKeypair,
    ]);
  }

  /**
   * Estimates the transaction cost in SOL for a specified number of lamports.
   * @param {solana.Keypair|Wallet} keypair - The keypair of the wallet for which to estimate the transaction cost.
   * @param {number} [lamports=10] - The number of lamports to transfer (default is 10).
   * @returns {Promise<number>} The estimated transaction cost in SOL.
   */
  async getTransactionCost(keypair, lamports = 10) {
    // Ensure keypair is valid
    keypair = this.getKeypair(keypair);

    // Fetch the latest blockhash
    const { blockhash } = await this._connection.getLatestBlockhash();

    // Create a transaction using the newer constructor
    const tx = new solana.Transaction({
      feePayer: keypair.publicKey, // Assign the fee payer
      blockhash: blockhash, // Use obtained blockhash
    }).add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: keypair.publicKey, // Change this to the recipient's public key
        lamports: lamports,
      })
    );

    // Compile transaction message
    const message = tx.compileMessage();

    // Get fees for the transaction (the cost is in lamports)
    const feeForTransaction = await this._connection.getFeeForMessage(message);

    return feeForTransaction;
  }

  /**
   * Get the wrapped SOL token.
   * @returns {Promise<string>} The wrapped SOL token address.
   */
  async getWrappedSolToken() {
    return spl.NATIVE_MINT; // Returns the native mint address for SOL
  }

  /**
   * Get the associated token account for wrapped SOL.
   * @param {solana.PublicKey|Wallet} walletPublicKey - The public key of the wallet.
   * @returns {Promise<solana.PublicKey>} The associated token account address.
   */
  async getWrappedSolAccount(walletPublicKey) {
    walletPublicKey = this.getPublicKey(walletPublicKey); // Convert to public key format

    return await spl.Token.getAssociatedTokenAddress(
      spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      spl.TOKEN_PROGRAM_ID,
      spl.NATIVE_MINT,
      walletPublicKey
    ); // Returns the associated token address
  }

  /**
   * Retrieve validators for the current connection.
   * @param {string|null} commitment - Optional commitment level.
   * @returns {Promise<Object>} The list of validators.
   */
  async getValidators(commitment = null) {
    return await this._connection.getVoteAccounts(commitment); // Fetch vote accounts
  }

  /**
   * Create a stake account for a given wallet and amount.
   * @param {solana.Keypair|Wallet} walletKeypair - The wallet keypair.
   * @param {number} amountToStake - The amount of SOL to stake.
   * @param {solana.Keypair|Wallet|null} stakeAccountKeypair - Optional stake account keypair.
   * @returns {Promise<Object>} The created stake account information.
   */
  async createStakeAccount(
    walletKeypair,
    amountToStake,
    stakeAccountKeypair = null
  ) {
    walletKeypair = this.getKeypair(walletKeypair); // Convert to keypair format
    stakeAccountKeypair = stakeAccountKeypair
      ? this.getKeypair(stakeAccountKeypair) // Use provided keypair if available
      : solana.Keypair.generate(); // Generate a new keypair if not provided

    // Create a transaction to set up the stake account
    const createStakeAccountTx = solana.StakeProgram.createAccount({
      authorized: new Authorized(walletPublicKey, walletKeypair.publicKey), // Set authorities
      fromPubkey: walletKeypair.publicKey, // Source public key
      lamports: amountToStake, // Amount to stake in lamports
      lockup: new solana.Lockup(0, 0, amountToStake), // Optional lockup period
      stakePubkey: stakeAccountKeypair.publicKey, // Public key for the stake account
    });

    const txInfo = await solana.sendAndConfirmTransaction(
      this._connection,
      createStakeAccountTx,
      [walletKeypair, stakeAccountKeypair] // Signers for the transaction
    );

    return {
      stakeAccountKeypair, // Return the stake account keypair
      txInfo, // Return the transaction information
    };
  }

  /**
   * Retrieve the balance of a stake account.
   * @param {solana.PublicKey|Wallet} stakeAccountPublicKey - The public key of the stake account.
   * @returns {Promise<number>} The balance of the stake account in lamports.
   */
  async getStakeAccountBalance(stakeAccountPublicKey) {
    stakeAccountKeypair = this.getKeypair(stakeAccountKeypair); // Convert to keypair format
    return await this._connection.getBalance(stakeAccountPublicKey); // Fetch balance
  }

  // /**
  //  * Check the status of a stake account (active/inactive).
  //  * @param {solana.PublicKey|Wallet} stakeAccountPublicKey - The public key of the stake account.
  //  * @returns {Promise<Object>} The activation status of the stake account.
  //  */
  // async getStakeAccountStatus(stakeAccountPublicKey) {
  //   stakeAccountKeypair = this.getKeypair(stakeAccountKeypair); // Convert to keypair format
  //   return await this._connection.getStakeActivation(stakeAccountPublicKey); // Fetch activation status
  // }

  /**
   * Delegate stake to a selected validator.
   * @param {solana.PublicKey|Wallet} stakeAccountPublicKey - The public key of the stake account.
   * @param {solana.Keypair|Wallet} walletKeypair - The wallet keypair.
   * @param {solana.PublicKey|Wallet} selectedValidatorPublicKey - The public key of the selected validator.
   * @returns {Promise<Object>} The transaction information for the delegation.
   */
  async delegateStack(
    stakeAccountPublicKey,
    walletKeypair,
    selectedValidatorPublicKey
  ) {
    stakeAccountKeypair = this.getKeypair(stakeAccountKeypair); // Convert to keypair
    walletKeypair = this.getKeypair(walletKeypair); // Convert to keypair
    selectedValidatorPublicKey = this.getPublicKey(selectedValidatorPublicKey); // Convert to public key

    // Create a transaction to delegate stake
    const delegateTx = solana.StakeProgram.delegate({
      stakePubkey: stakeAccountPublicKey.publicKey, // Stake account public key
      authorizedPubkey: walletKeypair.publicKey, // Authorized public key
      votePubkey: selectedValidatorPublicKey, // Validator public key
    });

    return await solana.sendAndConfirmTransaction(
      this._connection,
      delegateTx,
      [walletKeypair] // Signer for the transaction
    );
  }

  /**
   * Deactivate a stake account.
   * @param {solana.PublicKey|Wallet} stakeAccountPublicKey - The public key of the stake account.
   * @param {solana.Keypair|Wallet} walletKeypair - The wallet keypair.
   * @returns {Promise<Object>} The transaction information for deactivation.
   */
  async deactivateStack(stakeAccountPublicKey, walletKeypair) {
    stakeAccountKeypair = this.getKeypair(stakeAccountKeypair); // Convert to keypair format
    walletKeypair = this.getKeypair(walletKeypair); // Convert to keypair format

    // Create a transaction to deactivate the stake account
    const deactivateTx = solana.StakeProgram.deactivate({
      stakePubkey: stakeAccountPublicKey.publicKey, // Stake account public key
      authorizedPubkey: walletKeypair.publicKey, // Authorized public key
    });

    return await solana.sendAndConfirmTransaction(
      this._connection,
      deactivateTx,
      [walletKeypair] // Signer for the transaction
    );
  }

  /**
   * Withdraw from a stake account.
   * @param {solana.PublicKey|Wallet} stakeAccountPublicKey - The public key of the stake account.
   * @param {solana.Keypair|Wallet} walletKeypair - The wallet keypair.
   * @param {number|null} amount - Optional amount to withdraw in lamports.
   * @returns {Promise<Object>} The transaction information for the withdrawal.
   */
  async withdrawStack(stakeAccountPublicKey, walletKeypair, amount = null) {
    stakeAccountKeypair = this.getKeypair(stakeAccountKeypair); // Convert to keypair format
    walletKeypair = this.getKeypair(walletKeypair); // Convert to keypair format

    // Create a transaction to withdraw funds
    const withdrawTx = solana.StakeProgram.withdraw({
      stakePubkey: stakeAccountPublicKey.publicKey, // Stake account public key
      authorizedPubkey: walletKeypair.publicKey, // Authorized public key
      toPubkey: walletKeypair.publicKey, // Destination public key
      lamports: amount
        ? amount // Withdraw specified amount
        : this.getStakeAccountBalance(stakeAccountPublicKey), // Withdraw entire balance if no amount specified
    });

    return await solana.sendAndConfirmTransaction(
      this._connection,
      withdrawTx,
      [walletKeypair] // Signer for the transaction
    );
  }

  /**
   * Create a new NFT.
   * @param {solana.Keypair|Wallet} ownerKeypair - The keypair of the NFT owner.
   * @param {solana.Keypair|Wallet|null} nftKeypair - Optional keypair for the NFT.
   * @returns {Promise<Object>} Information about the created NFT.
   */
  async createNft(ownerKeypair, nftKeypair = null) {
    // Create a token and mint it
    const { token, tokenTx } = await this.createToken(
      ownerKeypair,
      0,
      false,
      nftKeypair // Use provided keypair or create a new one
    );

    // Mint the token
    const mintTx = await this.mint(token, ownerKeypair, 1);
    // Set the authority for the token account
    const authorityTx = this.setAuthorityOfTokenAccount(
      ownerKeypair,
      null,
      this._authorityTypes.mint
    );

    return {
      token, // Return the created token
      tokenTx, // Return the token transaction
      mintTx, // Return the mint transaction
      authorityTx, // Return the authority transaction
    };
  }

  /**
   * Connect to Arweave.
   * @param {Object|null} arweaveConfig - Optional configuration for Arweave connection.
   * @returns {Object} The Arweave instance.
   */
  arweaveConnect(arweaveConfig = null) {
    return Arweave.init(
      arweaveConfig || {
        host: "arweave.net",
        port: 443,
        protocol: "https",
        timeout: 20000,
        logging: false,
      }
    ); // Initialize Arweave connection
  }

  /**
   * Create a new wallet on Arweave.
   * @param {Object} arweaveInstance - The Arweave instance.
   * @returns {Promise<Object>} The generated wallet's private key.
   */
  async createArweaveWallet(arweaveInstance) {
    return await arweaveInstance.wallets.generate(); // Returns a new wallet's private key
  }

  /**
   * Get public key from Arweave wallet's private key.
   * @param {Object} arweaveInstance - The Arweave instance.
   * @param {Object} arweaveWalletPrivateKey - The private key of the wallet.
   * @returns {Promise<solana.PublicKey>} The public key of the wallet.
   */
  async getArweaveWalletPublicKey(arweaveInstance, arweaveWalletPrivateKey) {
    return await arweaveInstance.wallets.jwkToAddress(arweaveWalletPrivateKey); // Converts private key to public key
  }

  /**
   * Get the balance of an Arweave wallet.
   * @param {Object} arweaveInstance - The Arweave instance.
   * @param {solana.PublicKey|Wallet} arweaveWalletPublicKey - The public key of the wallet.
   * @returns {Promise<number>} The balance of the wallet in AR.
   */
  async getArweaveWalletBalance(arweaveInstance, arweaveWalletPublicKey) {
    return await arweaveInstance.ar.winstonToAr(
      await arweaveInstance.wallets.getBalance(arweaveWalletPublicKey) // Convert balance from winston to AR
    );
  }

  /**
   * Get the last transaction ID for an Arweave wallet.
   * @param {Object} arweaveInstance - The Arweave instance.
   * @param {solana.PublicKey|Wallet} arweaveWalletPublicKey - The public key of the wallet.
   * @returns {Promise<string>} The last transaction ID.
   */
  async getArweaveWalletLastTransaction(
    arweaveInstance,
    arweaveWalletPublicKey
  ) {
    return await arweaveInstance.wallets.getLastTransactionID(
      arweaveWalletPublicKey // Fetch last transaction ID
    );
  }

  /**
   * Transfer AR from one wallet to another.
   * @param {Object} arweaveInstance - The Arweave instance.
   * @param {Object} fromWalletPrivateKey - The private key of the sender's wallet.
   * @param {solana.PublicKey|Wallet} toWalletPublicKey - The public key of the recipient's wallet.
   * @param {number} amount - The amount of AR to transfer.
   * @param {Object|null} arweaveWallet - Optional wallet for the transaction.
   * @returns {Promise<Object>} Information about the transaction.
   */
  async arweaveTransfer(
    arweaveInstance,
    fromWalletPrivateKey,
    toWalletPublicKey,
    amount,
    arweaveWallet = null
  ) {
    const a = arweaveInstance; // Reference to Arweave instance
    const wallet = arweaveWallet || (await a.wallets.generate()); // Generate wallet if not provided
    const walletAddress = await a.wallets.jwkToAddress(wallet); // Get wallet address

    // Create a transaction for the transfer
    let tx = await arweave.createTransaction(
      {
        target: toWalletPublicKey, // Target wallet public key
        quantity: arweave.ar.arToWinston(amount), // Amount to transfer in winston
      },
      fromWalletPrivateKey // Sign with the sender's private key
    );

    await a.transactions.sign(tx, fromWalletPrivateKey); // Sign the transaction
    let txInfo = await a.transactions.post(tx); // Post the transaction
    txInfo.url = txInfo.id ? "https://arweave.net/" + txInfo.id : null; // Construct the transaction URL
    txInfo.wallet = wallet; // Include wallet information
    txInfo.walletAddress = walletAddress; // Include wallet address
    return txInfo; // Return transaction information
  }

  /**
   * Get the status of a transaction on Arweave.
   * @param {Object} arweaveInstance - The Arweave instance.
   * @param {string} transactionId - The ID of the transaction.
   * @returns {Promise<Object>} The status of the transaction.
   */
  async getArweaveTransactionStatus(arweaveInstance, transactionId) {
    return await arweaveInstance.transactions.getStatus(transactionId); // Fetch transaction status
  }

  /**
   * Get information about a specific transaction on Arweave.
   * @param {Object} arweaveInstance - The Arweave instance.
   * @param {string} transactionId - The ID of the transaction.
   * @returns {Promise<Object>} Information about the transaction.
   */
  async getArweaveTransactionInfo(arweaveInstance, transactionId) {
    return await arweaveInstance.transactions.get(transactionId); // Fetch transaction information
  }

  /**
   * Get the data associated with a transaction on Arweave.
   * @param {Object} arweaveInstance - The Arweave instance.
   * @param {string} transactionId - The ID of the transaction.
   * @returns {Promise<Object>} The data of the transaction.
   */
  async getArweaveTransactionData(arweaveInstance, transactionId) {
    return await arweaveInstance.transactions.getData(transactionId); // Fetch transaction data
  }

  /**
   * Upload data to Arweave.
   * @param {Object} arweaveInstance - The Arweave instance.
   * @param {any} data - The data to upload.
   * @param {Object|null} arweaveWallet - Optional wallet for the transaction.
   * @param {Function|null} chunkCallback - Optional callback for tracking upload progress.
   * @param {string|null} contentType - Optional content type for the data.
   * @returns {Promise<Object>} Information about the upload transaction.
   */
  async uploadData(
    arweaveInstance,
    data,
    arweaveWallet = null,
    chunkCallback = null,
    contentType = null
  ) {
    const a = arweaveInstance; // Reference to Arweave instance
    const wallet = arweaveWallet || (await a.wallets.generate()); // Generate wallet if not provided
    const walletAddress = await a.wallets.jwkToAddress(wallet); // Get wallet address
    const tx = await a.createTransaction({
      data: data, // Data to upload
    });

    if (contentType) tx.addTag("Content-Type", contentType); // Add content type tag if provided

    await a.transactions.sign(tx, wallet); // Sign the transaction
    let txInfo = await this.arweavePost(tx, chunkCallback); // Post the transaction
    txInfo.url = txInfo.id ? "https://arweave.net/" + txInfo.id : null; // Construct the transaction URL
    txInfo.wallet = wallet; // Include wallet information
    txInfo.walletAddress = walletAddress; // Include wallet address
    return txInfo; // Return transaction information
  }

  /**
   * Upload metadata to Arweave.
   * @param {Object} arweaveInstance - The Arweave instance.
   * @param {Object} metadata - The metadata to upload.
   * @param {Object|null} arweaveWallet - Optional wallet for the transaction.
   * @param {Function|null} chunkCallback - Optional callback for tracking upload progress.
   * @returns {Promise<Object>} Information about the metadata upload transaction.
   */
  async uploadMetadata(
    arweaveInstance,
    metadata,
    arweaveWallet = null,
    chunkCallback = null
  ) {
    const a = arweaveInstance; // Reference to Arweave instance
    const wallet = arweaveWallet || (await a.wallets.generate()); // Generate wallet if not provided
    const walletAddress = await a.wallets.jwkToAddress(wallet); // Get wallet address
    const metadataRequest = JSON.stringify(metadata); // Convert metadata to JSON
    const metadataTransaction = await a.createTransaction({
      data: metadataRequest, // Upload metadata
    });
    metadataTransaction.addTag("Content-Type", "application/json"); // Add content type tag
    await a.transactions.sign(metadataTransaction, wallet); // Sign the transaction
    let txInfo = await this.arweavePost(metadataTransaction, chunkCallback); // Post the transaction
    txInfo.url = txInfo.id ? "https://arweave.net/" + txInfo.id : null; // Construct the transaction URL
    txInfo.wallet = wallet; // Include wallet information
    txInfo.walletAddress = walletAddress; // Include wallet address
    return txInfo; // Return transaction information
  }

  /**
   * Upload a file to Arweave.
   * @param {Object} arweaveInstance - The Arweave instance.
   * @param {string} filePath - The path to the file to upload.
   * @param {Object|null} arweaveWallet - Optional wallet for the transaction.
   * @param {Function|null} chunkCallback - Optional callback for tracking upload progress.
   * @param {string|null} contentType - Optional content type for the file.
   * @returns {Promise<Object>} Information about the file upload transaction.
   */
  async uploadFile(
    arweaveInstance,
    filePath,
    arweaveWallet = null,
    chunkCallback = null,
    contentType = null
  ) {
    const a = arweaveInstance; // Reference to Arweave instance
    const wallet = arweaveWallet || (await a.wallets.generate()); // Generate wallet if not provided
    const walletAddress = await a.wallets.jwkToAddress(wallet); // Get wallet address
    const ext = path.extname(filePath); // Get file extension
    contentType = contentType || mime.contentType(ext); // Determine content type

    // Upload a file to Arweave
    const data = fs.readFileSync(filePath); // Read file data
    const transaction = await a.createTransaction({
      data: data, // Upload file data
    });
    transaction.addTag("Content-Type", contentType); // Add content type tag
    await a.transactions.sign(transaction, wallet); // Sign the transaction

    let txInfo = await this.arweavePost(transaction, chunkCallback); // Post the transaction
    txInfo.url = txInfo.id ? "https://arweave.net/" + txInfo.id : null; // Construct the transaction URL
    txInfo.wallet = wallet; // Include wallet information
    txInfo.walletAddress = walletAddress; // Include wallet address
    return txInfo; // Return transaction information
  }

  /**
   * Mint a new NFT.
   * @param {solana.Keypair|Wallet} nftOwnerKeypair - The keypair of the NFT owner.
   * @param {string} uri - The metadata URI for the NFT.
   * @param {string} name - The metadata name for the NFT.
   * @param {string} symbol - The metadata symbol for the NFT.
   * @param {Object} other - other metadata for the NFT.
   * @returns {Promise<Object>} Information about the minted NFT.
   */
  async mintNFT(wallet, uri, name, symbol, other) {
    // Create new token mint
    const mint = await spl.Token.createMint(
      connection,
      wallet,
      wallet.publicKey,
      null,
      0, // 0 means it’s a non-fungible token
      spl.TOKEN_PROGRAM_ID
    );

    // Create an associated token account for the NFT
    const tokenAccount = await mint.getOrCreateAssociatedAccountInfo(
      wallet.publicKey
    );

    // Mint an NFT
    await mint.mintTo(tokenAccount.address, wallet.publicKey, [], 1);

    // Create metadata (you would need to create a separate program for metadata)
    const metadata = {
      name,
      symbol,
      uri,
      owner: wallet.publicKey.toString(), // Add creators if needed
      mintedNft: mint.publicKey.toString(),
      tokenAccount: tokenAccount.address.toString(),
      ...other,
    };

    // You would have to handle storing the metadata properly in your implementation.
    return metadata;
  }

  /**
   * Mint and upload an NFT along with its metadata.
   * @param {solana.Keypair|Wallet} nftOwnerKeypair - The keypair of the NFT owner.
   * @param {string} filePath - The path to the file to upload.
   * @param {string} name - The metadata name for the NFT.
   * @param {string} symbol - The metadata symbol for the NFT.
   * @param {Object} other - other metadata for the NFT.
   * @param {Object|null} arweaveWallet - Optional wallet for the transaction.
   * @param {string|null} contentType - Optional content type for the file.
   * @param {Object|null} arweaveConfig - Optional configuration for Arweave.
   * @returns {Promise<Object>} Information about the minting and upload process.
   */
  async mintAndUploadNft(
    nftOwnerKeypair,
    filePath,
    name,
    symbol,
    other,
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
    ); // Initialize Arweave connection

    const wallet = arweaveWallet || (await a.wallets.generate()); // Generate wallet if not provided
    const mintNFTResponse = await this.mintNFT(
      nftOwnerKeypair,
      response.url,
      name,
      symbol,
      other
    );
    const metadataRequest = JSON.stringify(mintNFTResponse); // Convert metadata to JSON
    const metadataTransaction = await a.createTransaction({
      data: metadataRequest, // Upload metadata
    });
    metadataTransaction.addTag("Content-Type", "application/json"); // Add content type tag
    await a.transactions.sign(metadataTransaction, wallet); // Sign the transaction
    const metadataResponse = await a.transactions.post(metadataTransaction); // Post the transaction
    metadataResponse.url = metadataResponse.id
      ? "https://arweave.net/" + metadataResponse.id
      : null; // Construct the metadata transaction URL
    metadataResponse.wallet = wallet; // Include wallet information
    metadataResponse.walletAddress = walletAddress; // Include wallet address

    if (metadataResponse.status != 200 || metadataResponse.id == null)
      return metadataResponse; // Return response if there was an error

    const ext = path.extname(filePath); // Get file extension
    contentType = contentType || mime.contentType(ext); // Determine content type
    // Upload a file to Arweave
    const data = fs.readFileSync(filePath); // Read file data
    const transaction = await a.createTransaction({
      data: data, // Upload file data
    });
    transaction.addTag("Content-Type", contentType); // Add content type tag
    const walletAddress = await a.wallets.jwkToAddress(wallet); // Get wallet address
    await a.transactions.sign(transaction, wallet); // Sign the transaction

    let response = await this.arweavePost(transaction); // Post the transaction
    response.ar_url = response.id ? "https://arweave.net/" + response.id : null; // Construct the transaction URL
    response.ar_wallet = wallet; // Include wallet information
    response.ar_walletAddress = walletAddress; // Include wallet address
    response.ar_metadata = metadataResponse; // Include metadata response
    response.sol_metadata = metadataRequest;
    return response; // Return response if there was an error
  }

  /**
   * Get account information for a given NFT.
   * @param {solana.PublicKey|Wallet} nftPublicKey - The public key of the NFT.
   * @returns {Promise<Object>} The account information of the NFT.
   */
  async getNftAccountInfo(nftPublicKey) {
    nftPublicKey = this.getPublicKey(nftPublicKey); // Convert to public key format
    const largestAccounts = await this._connection.getTokenLargestAccounts(
      nftPublicKey // Get largest token accounts for the NFT
    );
    return await this._connection.getParsedAccountInfo(
      largestAccounts.value[0].address // Get parsed account information
    );
  }

  /**
   * Fetch a list of tokens based on optional tags and clusters.
   * @param {string|null} tags - Optional tags to filter tokens.
   * @param {string|null} cluster - Optional cluster to filter tokens.
   * @returns {Promise<Array>} The list of tokens.
   */
  async getTokens(tags = null, cluster = null) {
    const tokenList = await new registery.TokenListProvider().resolve(); // Fetch token list from registry
    if (tags != null && typeof tags == "string") tags = [tags]; // Convert to array if a single tag is provided

    // Filter by tags if provided
    if (tags) for (const tag of tags) tokenList = tokenList.filterByTag(tag);

    return tokenList
      .filterByClusterSlug(cluster || this._clusters.main) // Filter by cluster, default to main cluster
      .getList(); // Return the list of tokens
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

  // /**
  //  * Get metadata for a given NFT.
  //  * @param {solana.PublicKey|Wallet} nftPublicKey - The public key of the NFT.
  //  * @returns {Promise<Object>} The metadata of the NFT.
  //  */
  // async getNftMetadata(nftPublicKey) {
  //   nftPublicKey = this.getPublicKey(nftPublicKey); // Convert to public key format
  //   const metadataPDA = await mpl.Metadata.getPDA(nft); // Get the metadata PDA
  //   return await mpl.Metadata.load(this._connection, metadataPDA); // Load metadata from the blockchain
  // }

  // /**
  //  * Get comprehensive information about an NFT.
  //  * @param {solana.PublicKey|Wallet} nftPublicKey - The public key of the NFT.
  //  * @returns {Promise<Object>} Comprehensive information about the NFT.
  //  */
  // async getNftInfo(nftPublicKey) {
  //   const account = await metaplex.programs.Account.load(
  //     this._connection,
  //     nftPublicKey // Load NFT account information
  //   );
  //   const metadata = await metaplex.programs.Metadata.load(
  //     this._connection,
  //     nftPublicKey // Load NFT metadata
  //   );
  //   const auction = await metaplex.programs.Auction.load(
  //     this._connection,
  //     nftPublicKey // Load auction data for NFT
  //   );
  //   const vault = await metaplex.Vault.load(this._connection, nftPublicKey); // Load vault information
  //   // Metaplex components
  //   const auctionManager = await metaplex.AuctionManager.load(
  //     this._connection,
  //     nftPublicKey // Load auction manager data
  //   );
  //   const store = await Store.load(this._connection, nftPublicKey); // Load store information

  //   return {
  //     account, // Return account information
  //     metadata, // Return metadata
  //     auction, // Return auction information
  //     vault, // Return vault information
  //     auctionManager, // Return auction manager information
  //     store, // Return store information
  //   };
  // }
}

class SplFactory {
  /**
   * Returns the available clusters.
   * @returns {Object} An object with cluster names as keys and their corresponding values.
   */
  get clusters() {
    return {
      dev: "devnet",
      test: "testnet",
      main: "mainnet-beta",
    };
  }

  /**
   * Creates a new instance of Spl, connecting to the specified cluster.
   * @param {string|null} cluster - The cluster to connect to (optional).
   * @returns {Spl} A new instance of the Spl class connected to the specified cluster.
   */
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
