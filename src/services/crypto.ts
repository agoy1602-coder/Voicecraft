/**
 * End-to-End Encryption (E2EE) Service
 * Uses standard Web Crypto API:
 * - AES-GCM 256-bit encryption
 * - PBKDF2 key derivation from passphrase (100,000 iterations, SHA-256)
 * - Random 12-byte initialization vectors (IVs) per packet
 * - SHA-256 data checksums
 * - Zero-knowledge architecture: Keys never leave the local device in plaintext
 */

const STORAGE_SALT_KEY = 'voicecraft_e2ee_salt';
const STORAGE_KEY_PHRASE = 'voicecraft_e2ee_passphrase_saved';

class E2EEService {
  private cryptoKey: CryptoKey | null = null;
  private salt: Uint8Array | null = null;
  private currentPassphrase: string = 'voicecraft-master-secure-vault-2026';
  private initialized: boolean = false;

  async init(customPassphrase?: string): Promise<void> {
    if (customPassphrase) {
      this.currentPassphrase = customPassphrase;
    } else {
      const saved = localStorage.getItem(STORAGE_KEY_PHRASE);
      if (saved) {
        this.currentPassphrase = saved;
      }
    }

    // Load or generate salt
    let saltHex = localStorage.getItem(STORAGE_SALT_KEY);
    if (!saltHex) {
      const newSalt = crypto.getRandomValues(new Uint8Array(16));
      saltHex = Array.from(newSalt).map((b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(STORAGE_SALT_KEY, saltHex);
    }

    const saltBytes = new Uint8Array(
      saltHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );
    this.salt = saltBytes;

    this.cryptoKey = await this.deriveKey(this.currentPassphrase, this.salt);
    this.initialized = true;
  }

  private async deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(passphrase),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  async encrypt(data: any): Promise<{ ciphertext: string; iv: string; checksum: string }> {
    if (!this.initialized || !this.cryptoKey) {
      await this.init();
    }

    const enc = new TextEncoder();
    const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
    const dataBuffer = enc.encode(jsonString);

    // Compute checksum
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const checksum = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Generate 12-byte random IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      this.cryptoKey!,
      dataBuffer
    );

    // Convert to Base64
    const ciphertext = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
    const ivBase64 = btoa(String.fromCharCode(...iv));

    return {
      ciphertext,
      iv: ivBase64,
      checksum,
    };
  }

  async decrypt(encryptedObj: { ciphertext: string; iv: string } | string): Promise<any> {
    if (!this.initialized || !this.cryptoKey) {
      await this.init();
    }

    let ciphertextBase64: string;
    let ivBase64: string;

    if (typeof encryptedObj === 'string') {
      try {
        const parsed = JSON.parse(encryptedObj);
        ciphertextBase64 = parsed.ciphertext;
        ivBase64 = parsed.iv;
      } catch {
        // Plain string fallback
        return encryptedObj;
      }
    } else {
      ciphertextBase64 = encryptedObj.ciphertext;
      ivBase64 = encryptedObj.iv;
    }

    const ciphertext = Uint8Array.from(atob(ciphertextBase64), (c) => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivBase64), (c) => c.charCodeAt(0));

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      this.cryptoKey!,
      ciphertext
    );

    const dec = new TextDecoder();
    const decryptedString = dec.decode(decryptedBuffer);

    try {
      return JSON.parse(decryptedString);
    } catch {
      return decryptedString;
    }
  }

  async getFingerprint(): Promise<string> {
    if (!this.cryptoKey) await this.init();
    const enc = new TextEncoder();
    const data = enc.encode(this.currentPassphrase + (this.salt ? this.salt.join('') : ''));
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .slice(0, 8)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }

  getPassphrase(): string {
    return this.currentPassphrase;
  }

  async updatePassphrase(newPass: string): Promise<void> {
    this.currentPassphrase = newPass;
    localStorage.setItem(STORAGE_KEY_PHRASE, newPass);
    if (!this.salt) {
      const newSalt = crypto.getRandomValues(new Uint8Array(16));
      this.salt = newSalt;
      localStorage.setItem(
        STORAGE_SALT_KEY,
        Array.from(newSalt).map((b) => b.toString(16).padStart(2, '0')).join('')
      );
    }
    this.cryptoKey = await this.deriveKey(this.currentPassphrase, this.salt);
  }

  generateSecurePassphrase(): string {
    const words = [
      'aurora', 'nexus', 'sonic', 'cipher', 'quantum', 'echo', 'stellar', 'prism',
      'vector', 'haven', 'zenith', 'pulse', 'vortex', 'ember', 'glyph', 'velvet'
    ];
    const picked: string[] = [];
    for (let i = 0; i < 4; i++) {
      picked.push(words[Math.floor(Math.random() * words.length)]);
    }
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${picked.join('-')}-${num}`;
  }
}

export const cryptoService = new E2EEService();
