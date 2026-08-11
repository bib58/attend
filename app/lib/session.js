const SECRET = process.env.SESSION_SECRET;

function getSubtleCrypto() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    return globalThis.crypto.subtle;
  }
  try {
    const nodeCrypto = require('crypto');
    if (nodeCrypto.webcrypto) return nodeCrypto.webcrypto.subtle;
  } catch (e) {}
  throw new Error('Web Crypto API (crypto.subtle) is not supported in this environment.');
}

async function getCryptoKey() {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(SECRET);
  const subtle = getSubtleCrypto();
  return subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signToken(payload) {
  const encoder = new TextEncoder();
  const payloadStr = JSON.stringify({ ...payload, exp: Date.now() + 24 * 60 * 60 * 1000 }); // 1 day expiration
  const payloadB64 = btoa(payloadStr)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
    
  const key = await getCryptoKey();
  const subtle = getSubtleCrypto();
  const signature = await subtle.sign(
    'HMAC',
    key,
    encoder.encode(payloadB64)
  );
  
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
    
  return `${payloadB64}.${signatureB64}`;
}

export async function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signatureB64] = parts;
  
  try {
    const key = await getCryptoKey();
    const encoder = new TextEncoder();
    const subtle = getSubtleCrypto();
    
    const sigBinaryStr = atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/'));
    const sigBytes = new Uint8Array(sigBinaryStr.length);
    for (let i = 0; i < sigBinaryStr.length; i++) {
      sigBytes[i] = sigBinaryStr.charCodeAt(i);
    }
    
    const isValid = await subtle.verify(
      'HMAC',
      key,
      sigBytes,
      encoder.encode(payloadB64)
    );
    
    if (!isValid) return null;
    
    const payloadStr = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadStr);
    
    if (payload.exp && Date.now() > payload.exp) {
      return null;
    }
    
    return payload;
  } catch (e) {
    return null;
  }
}
