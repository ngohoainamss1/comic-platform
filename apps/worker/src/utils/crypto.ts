const encoder = new TextEncoder();

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function toBase64Url(input: string): string {
  const bytes = encoder.encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function computeHmacHex(payload: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return bufferToHex(signatureBuffer);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function signImageUrl(
  fileId: string,
  secret: string,
  ttlSeconds = 900,
  ghFallbackPath = ''
): Promise<string> {
  if (!fileId) return '';
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = await computeHmacHex(`${fileId}:${exp}`, secret);
  const base = `/img/${encodeURIComponent(fileId)}/${sig}/${exp}.avif`;
  return ghFallbackPath ? `${base}?fb=${encodeURIComponent(ghFallbackPath)}` : base;
}

export async function verifyImageSignature(
  fileId: string,
  sig: string,
  expStr: string,
  secret: string
): Promise<boolean> {
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expectedSig = await computeHmacHex(`${fileId}:${exp}`, secret);
  return timingSafeEqual(expectedSig, sig);
}

export async function signAdminToken(secret: string, ttlSeconds = 86400 * 7): Promise<string> {
  const payload = JSON.stringify({
    role: 'admin',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  });
  const encoded = toBase64Url(payload);
  const sig = await computeHmacHex(`admin:${encoded}`, secret);
  return `${encoded}.${sig}`;
}

export async function verifyAdminToken(token: string, secret: string): Promise<boolean> {
  if (!token || !secret) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [encoded, sig] = parts;
  const expectedSig = await computeHmacHex(`admin:${encoded}`, secret);
  if (!timingSafeEqual(expectedSig, sig)) return false;
  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as { role?: string; exp?: number };
    if (parsed.role !== 'admin') return false;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}
