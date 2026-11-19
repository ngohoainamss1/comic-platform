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

async function computeHmacHex(payload: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return bufferToHex(signatureBuffer);
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
  if (expectedSig.length !== sig.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < expectedSig.length; i++) {
    mismatch |= expectedSig.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return mismatch === 0;
}
