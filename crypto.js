/**
 * Crypto utilities for Job Confidence Tracker
 * Handles keypair generation, signing, verification, and proof-of-work
 */

const CryptoUtils = {
  /**
   * Generate a new keypair for the peer
   * Uses Web Crypto API for secure key generation
   */
  async generateKeypair() {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256'
      },
      true,
      ['sign', 'verify']
    );

    const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

    return {
      publicKey: this.arrayBufferToHex(publicKeyRaw),
      privateKey: JSON.stringify(privateKeyJwk),
      publicKeyObj: keyPair.publicKey,
      privateKeyObj: keyPair.privateKey
    };
  },

  /**
   * Import a keypair from stored JWK
   */
  async importKeypair(privateKeyJwk, publicKeyHex) {
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      JSON.parse(privateKeyJwk),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );

    const publicKeyBuffer = this.hexToArrayBuffer(publicKeyHex);
    const publicKey = await crypto.subtle.importKey(
      'raw',
      publicKeyBuffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify']
    );

    return { privateKey, publicKey };
  },

  /**
   * Sign data with private key
   */
  async sign(data, privateKey) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(JSON.stringify(data));
    
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      dataBuffer
    );

    return this.arrayBufferToHex(signature);
  },

  /**
   * Verify signature with public key
   */
  async verify(data, signature, publicKeyHex) {
    try {
      const publicKeyBuffer = this.hexToArrayBuffer(publicKeyHex);
      const publicKey = await crypto.subtle.importKey(
        'raw',
        publicKeyBuffer,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );

      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(JSON.stringify(data));
      const signatureBuffer = this.hexToArrayBuffer(signature);

      return await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        signatureBuffer,
        dataBuffer
      );
    } catch (e) {
      console.error('Verification failed:', e);
      return false;
    }
  },

  /**
   * Generate SHA-256 hash of data
   */
  async hash(data) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(typeof data === 'string' ? data : JSON.stringify(data));
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    return this.arrayBufferToHex(hashBuffer);
  },

  /**
   * Compute proof of work
   * Find a nonce such that hash(data + nonce) starts with required zeros
   * @param {object} data - Data to include in hash
   * @param {number} difficulty - Number of leading zeros required (default 3)
   * @returns {object} - { nonce, hash }
   */
  async computeProofOfWork(data, difficulty = 3) {
    const target = '0'.repeat(difficulty);
    let nonce = 0;
    let hash = '';

    const startTime = Date.now();
    const maxTime = 30000; // 30 second timeout

    while (true) {
      const payload = { ...data, nonce };
      hash = await this.hash(payload);

      if (hash.startsWith(target)) {
        return { nonce, hash, iterations: nonce + 1 };
      }

      nonce++;

      // Yield to prevent blocking
      if (nonce % 1000 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
        
        if (Date.now() - startTime > maxTime) {
          throw new Error('Proof of work timeout');
        }
      }
    }
  },

  /**
   * Verify proof of work
   */
  async verifyProofOfWork(data, nonce, expectedHash, difficulty = 3) {
    const target = '0'.repeat(difficulty);
    const payload = { ...data, nonce };
    const hash = await this.hash(payload);
    
    return hash === expectedHash && hash.startsWith(target);
  },

  /**
   * Generate deterministic company ID from name
   * Prevents duplicate entries
   */
  async companyId(name) {
    const normalized = name.toLowerCase().trim().replace(/\s+/g, ' ');
    return await this.hash(normalized);
  },

  /**
   * Utility: ArrayBuffer to hex string
   */
  arrayBufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  },

  /**
   * Utility: Hex string to ArrayBuffer
   */
  hexToArrayBuffer(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes.buffer;
  },

  /**
   * Generate short peer ID for display
   */
  shortId(publicKey) {
    return publicKey.substring(0, 8) + '...' + publicKey.substring(publicKey.length - 8);
  }
};

// Make available globally
window.CryptoUtils = CryptoUtils;
