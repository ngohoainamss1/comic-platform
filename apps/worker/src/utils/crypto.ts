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

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return `${bufferToHex(salt.buffer)}:${bufferToHex(derivedBits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [saltHex, hashHex] = stored.split(':');
    if (!saltHex || !hashHex) return false;
    const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );
    const computedHex = bufferToHex(derivedBits);
    return timingSafeEqual(computedHex, hashHex);
  } catch {
    return false;
  }
}

export async function signUserToken(
  user: { id: number; username: string; role: string },
  secret: string,
  ttlSeconds = 86400 * 30
): Promise<string> {
  const payload = JSON.stringify({
    id: user.id,
    username: user.username,
    role: user.role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  });
  const encoded = toBase64Url(payload);
  const sig = await computeHmacHex(`user:${encoded}`, secret);
  return `${encoded}.${sig}`;
}

export async function verifyUserToken(
  token: string,
  secret: string
): Promise<{ id: number; username: string; role: string } | null> {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = await computeHmacHex(`user:${encoded}`, secret);
  if (!timingSafeEqual(expectedSig, sig)) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as {
      id?: number;
      username?: string;
      role?: string;
      exp?: number;
    };
    if (!parsed.id || !parsed.username) return null;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      id: Number(parsed.id),
      username: String(parsed.username),
      role: String(parsed.role || 'user'),
    };
  } catch {
    return null;
  }
}
