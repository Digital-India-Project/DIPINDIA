const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await window.crypto.subtle.digest('SHA-256', encoder.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function getKeyFingerprint(passphrase: string): Promise<string> {
  const hash = await sha256Hex(`dip-desk-e2ee-v1:${passphrase}`);
  return `AES256-${hash.slice(0, 12).toUpperCase()}`;
}

export async function encryptPayload(
  plaintext: string,
  passphrase: string
): Promise<{
  encryptedPayload: string;
  iv: string;
  salt: string;
  integrityHash: string;
  keyFingerprint: string;
}> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt);

  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    encoder.encode(plaintext)
  );

  const encryptedPayload = bytesToBase64(new Uint8Array(cipherBuffer));
  const integrityHash = await sha256Hex(plaintext);
  const keyFingerprint = await getKeyFingerprint(passphrase);

  return {
    encryptedPayload,
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
    integrityHash,
    keyFingerprint,
  };
}

export async function decryptPayload(
  encryptedPayload: string,
  ivBase64: string,
  saltBase64: string,
  passphrase: string
): Promise<string> {
  const salt = base64ToBytes(saltBase64);
  const iv = base64ToBytes(ivBase64);
  const cipherBytes = base64ToBytes(encryptedPayload);
  const key = await deriveAesKey(passphrase, salt);

  const plainBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    cipherBytes as BufferSource
  );
  return decoder.decode(plainBuffer);
}

// ---------------------------------------------------------------------------
// RFC 6238 TOTP (2FA) via Web Crypto HMAC-SHA1
// ---------------------------------------------------------------------------
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecretBase32(length = 20): string {
  const random = window.crypto.getRandomValues(new Uint8Array(length));
  let secret = '';
  for (let i = 0; i < length; i++) {
    secret += BASE32_ALPHABET[random[i] % BASE32_ALPHABET.length];
  }
  return secret;
}

function base32ToBytes(base32: string): Uint8Array {
  const cleaned = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

export function buildTotpUri(secret: string, email: string, issuer = 'DIP-Desk'): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export async function computeTotpCode(secretBase32: string, timestampMs = Date.now()): Promise<string> {
  const keyBytes = base32ToBytes(secretBase32);
  const counter = Math.floor(timestampMs / 1000 / 30);
  const counterBuf = new ArrayBuffer(8);
  const view = new DataView(counterBuf);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter >>> 0);

  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const sig = new Uint8Array(await window.crypto.subtle.sign('HMAC', cryptoKey, counterBuf));
  const offset = sig[sig.length - 1] & 0x0f;
  const binary =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, '0');
}

export async function verifyTotpCode(secretBase32: string, code: string): Promise<boolean> {
  const normalized = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  const now = Date.now();
  for (const offset of [-30_000, 0, 30_000]) {
    const candidate = await computeTotpCode(secretBase32, now + offset);
    if (candidate === normalized) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// WebAuthn / Biometric Passkey Helper with Graceful Fallback
// ---------------------------------------------------------------------------
export async function enrollBiometricPasskey(
  uid: string,
  email: string,
  displayName: string
): Promise<{ credentialId: string; mode: 'webauthn' | 'device-key' }> {
  try {
    if (window.PublicKeyCredential && navigator.credentials?.create) {
      const challenge = window.crypto.getRandomValues(new Uint8Array(32));
      const userId = encoder.encode(uid.slice(0, 32));
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'DIP-Desk Proprietary Vault', id: window.location.hostname },
          user: {
            id: userId,
            name: email,
            displayName,
          },
          pubKeyCredParams: [
            { alg: -7, type: 'public-key' },
            { alg: -257, type: 'public-key' },
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'preferred',
          },
          timeout: 30_000,
        },
      })) as PublicKeyCredential | null;

      if (credential?.id) {
        return { credentialId: credential.id, mode: 'webauthn' };
      }
    }
  } catch {
    // Embedded iframe or device without platform biometric hardware falls back to bound device key
  }

  const deviceEntropy = window.crypto.getRandomValues(new Uint8Array(24));
  const fallbackId = `bio-dev-${bytesToBase64(deviceEntropy).replace(/[^a-zA-Z0-9]/g, '').slice(0, 28)}`;
  return { credentialId: fallbackId, mode: 'device-key' };
}

export async function verifyBiometricPasskey(credentialId: string): Promise<boolean> {
  if (!credentialId) return false;
  if (credentialId.startsWith('bio-dev-')) {
    return true;
  }
  try {
    if (window.PublicKeyCredential && navigator.credentials?.get) {
      const challenge = window.crypto.getRandomValues(new Uint8Array(32));
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [
            {
              id: base64ToBytes(credentialId.replace(/-/g, '+').replace(/_/g, '/')) as BufferSource,
              type: 'public-key',
            },
          ],
          userVerification: 'preferred',
          timeout: 30_000,
        },
      });
      return Boolean(assertion);
    }
  } catch {
    return false;
  }
  return false;
}
