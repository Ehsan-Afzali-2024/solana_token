const solana = require("@solana/web3.js");
const bip39 = require("bip39");
const nacl = require("tweetnacl");
const { derivePath } = require("ed25519-hd-key");

/**
 * Wallet class for creating and managing Solana wallets.
 */
export class Wallet {
  constructor() {
    // Default values for properties
    this._derivedPath = null;
    this._mnemonic = null;
    this._seed = null;
    this._seedHex = null;
    this._keypair = null;

    // Define standard derivation paths for wallet creation
    this._derivationPaths = {
      deprecated: `m/501'/0'/0/0`,
      bip44: `m/44'/501'/0'`,
      bip44Change: `m/44'/501'/0'/0'`,
    };
  }

  /**
   * Creates a new wallet with an optional password and derived path.
   * @param {string|null} pass - Optional password for mnemonic encryption.
   * @param {string|null} derivedPath - Optional path for key derivation.
   * @return {Wallet} The instance of Wallet.
   */
  create(pass = null, derivedPath = null) {
    this._derivedPath = derivedPath || this._derivationPaths.bip44Change;
    this._mnemonic = this._generateMnemonic();
    this._seedHex = this._mnemonicToSeedHex(this._mnemonic, pass);
    this._seed = derivePath(this._derivedPath, this._seedHex).key;
    this._keypair = solana.Keypair.fromSecretKey(
      nacl.sign.keyPair.fromSeed(this._seed).secretKey
    );
    return this;
  }

  /**
   * Restores wallet from a given mnemonic.
   * @param {string} mnemonic - The mnemonic phrase for wallet restoration.
   * @param {string|null} pass - Optional password for mnemonic encryption.
   * @param {string|null} derivedPath - Optional path for key derivation.
   * @return {Wallet} The instance of Wallet.
   */
  restoreFromMnemonic(mnemonic, pass = null, derivedPath = null) {
    this._derivedPath = derivedPath || this._derivationPaths.bip44Change;
    this._mnemonic = this._normalizeMnemonic(mnemonic);
    this._seedHex = this._mnemonicToSeedHex(this._mnemonic, pass);
    this._seed = derivePath(this._derivedPath, this._seedHex).key;
    this._keypair = solana.Keypair.fromSecretKey(
      nacl.sign.keyPair.fromSeed(this._seed).secretKey
    );
    return this;
  }

  /**
   * Restores wallet from a provided seed.
   * @param {Uint8Array} seed - The seed from which to restore the wallet.
   * @return {Wallet} The instance of Wallet.
   */
  restoreFromSeed(seed) {
    this._derivedPath = null;
    this._mnemonic = null;
    this._seed = seed;
    this._seedHex = Buffer.from(this._seed).toString("hex");
    this._keypair = solana.Keypair.fromSecretKey(
      nacl.sign.keyPair.fromSeed(this._seed).secretKey
    );
    return this;
  }

  /**
   * Restores wallet from a provided private key.
   * @param {Uint8Array} privateKey - The private key for wallet restoration.
   * @return {Wallet} The instance of Wallet.
   */
  restoreFromPrivateKey(privateKey) {
    this._derivedPath = null;
    this._mnemonic = null;
    this._seed = null;
    this._seedHex = null;
    this._keypair = solana.Keypair.fromSecretKey(privateKey);
    return this;
  }

  /**
   * Returns wallet information as a JSON object.
   * @return {object} JSON representation of the wallet.
   */
  get json() {
    return {
      mnemonic: this._mnemonic, // mnemonic phrase
      publicKey: this.publicKeyString, // wallet public key
      bn: this.publicKey, // wallet public key in byte array form
      privateKey: this.privateKeyString, // private key in string format
    };
  }

  /**
   * Gets the mnemonic of the wallet.
   * @return {string|null} The mnemonic phrase or null if not available.
   */
  get mnemonic() {
    return this._mnemonic;
  }

  /**
   * Gets the seed of the wallet.
   * @return {Uint8Array|null} The seed or null if not available.
   */
  get seed() {
    return this._seed;
  }

  /**
   * Gets the public key of the wallet.
   * @return {PublicKey|null} The public key or null if not available.
   */
  get publicKey() {
    return this._keypair ? this._keypair.publicKey : null;
  }

  /**
   * Gets the private key of the wallet.
   * @return {Uint8Array|null} The private key or null if not available.
   */
  get privateKey() {
    return this._keypair ? this._keypair.secretKey : null;
  }

  /**
   * Gets the public key as a base58 encoded string.
   * @return {string|null} The base58 encoded public key or null if not available.
   */
  get publicKeyString() {
    return this._keypair ? this._keypair.publicKey.toBase58() : null;
  }

  /**
   * Gets the private key as a string.
   * @return {string|null} A string representation of the private key or null if not available.
   */
  get privateKeyString() {
    return this._keypair
      ? "[" + this._keypair.secretKey.toString() + "]"
      : null;
  }

  /**
   * Gets the keypair of the wallet.
   * @return {Keypair|null} The keypair or null if not available.
   */
  get keypair() {
    return this._keypair;
  }

  /**
   * Gets the derivation paths used by the wallet.
   * @return {object} The derivation paths for key generation.
   */
  get derivationPaths() {
    return this._derivationPaths;
  }

  /**
   * Normalizes a mnemonic phrase by trimming spaces and removing extra whitespace.
   * @param {string} mnemonic - The mnemonic to normalize.
   * @return {string} The normalized mnemonic.
   */
  _normalizeMnemonic(mnemonic) {
    return mnemonic.trim().split(/\s+/g).join(" ");
  }

  /**
   * Generates a new mnemonic phrase.
   * @return {string} A randomly generated 256-bit mnemonic.
   */
  _generateMnemonic() {
    return bip39.generateMnemonic(256);
  }

  /**
   * Converts a mnemonic phrase to its hexadecimal seed representation.
   * @param {string} mnemonic - The mnemonic to convert.
   * @param {string|null} pass - Optional password for mnemonic encryption.
   * @return {string|null} The hexadecimal seed representation or null if the mnemonic is invalid.
   */
  _mnemonicToSeedHex(mnemonic, pass = null) {
    if (!bip39.validateMnemonic(mnemonic)) {
      return null; // Return null if the mnemonic is invalid
    }

    const seed = bip39.mnemonicToSeedSync(mnemonic, pass);
    return Buffer.from(seed).toString("hex"); // Convert seed to hex string
  }
}

/**
 * WalletFactory class for creating and restoring Wallet instances.
 */
class WalletFactory {
  constructor() {
    // Define standard derivation paths for wallet creation
    this._derivationPaths = {
      deprecated: `m/501'/0'/0/0`,
      bip44: `m/44'/501'/0'`,
      bip44Change: `m/44'/501'/0'/0'`,
    };
  }

  /**
   * Gets the available derivation paths.
   * @return {object} The derivation paths for key generation.
   */
  get derivationPaths() {
    return this._derivationPaths;
  }

  /**
   * Creates a new Wallet instance.
   * @param {string|null} pass - Optional password for mnemonic encryption.
   * @param {string|null} derivedPath - Optional path for key derivation.
   * @return {Wallet} A new instance of Wallet.
   */
  create(pass = null, derivedPath = null) {
    return new Wallet().create(pass, derivedPath);
  }

  /**
   * Restores a Wallet instance from a mnemonic phrase.
   * @param {string} mnemonic - The mnemonic phrase for wallet restoration.
   * @param {string|null} pass - Optional password for mnemonic encryption.
   * @param {string|null} derivedPath - Optional path for key derivation.
   * @return {Wallet} A restored instance of Wallet.
   */
  restoreFromMnemonic(mnemonic, pass = null, derivedPath = null) {
    return new Wallet().restoreFromMnemonic(mnemonic, pass, derivedPath);
  }

  /**
   * Restores a Wallet instance from a given seed.
   * @param {Uint8Array} seed - The seed for wallet restoration.
   * @return {Wallet} A restored instance of Wallet.
   */
  restoreFromSeed(seed) {
    return new Wallet().restoreFromSeed(seed);
  }

  /**
   * Restores a Wallet instance from a private key.
   * @param {Uint8Array} privateKey - The private key for wallet restoration.
   * @return {Wallet} A restored instance of Wallet.
   */
  restoreFromPrivateKey(privateKey) {
    return new Wallet().restoreFromPrivateKey(privateKey);
  }
}

// Exporting a singleton instance of the WalletFactory
module.exports = new WalletFactory();
