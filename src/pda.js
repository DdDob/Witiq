// Dependency-free Solana address helpers used by the token scanner: base58, the ed25519
// "is this point on the curve" test, and program-derived addresses (PDAs).
import { createHash } from 'node:crypto';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const MAP = Object.fromEntries([...ALPHABET].map((c, i) => [c, BigInt(i)]));

export function base58Decode(str) {
  let n = 0n;
  for (const c of str) {
    if (MAP[c] === undefined) throw new Error('Invalid base58 character');
    n = n * 58n + MAP[c];
  }
  const bytes = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const c of str) {
    if (c !== '1') break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

export function base58Encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

// A valid Solana address decodes to exactly 32 bytes.
export function isAddress(str) {
  if (typeof str !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(str)) return false;
  try {
    return base58Decode(str).length === 32;
  } catch {
    return false;
  }
}

/* ed25519 point decompression check (same rule Solana uses to forbid PDAs on the curve) */
const P = 2n ** 255n - 19n;
const mod = (a) => ((a % P) + P) % P;
function pow(b, e) {
  let r = 1n;
  b = mod(b);
  while (e > 0n) {
    if (e & 1n) r = (r * b) % P;
    b = (b * b) % P;
    e >>= 1n;
  }
  return r;
}
const D = mod(-121665n * pow(121666n, P - 2n));
const SQRT_M1 = pow(2n, (P - 1n) / 4n);

export function isOnCurve(bytes) {
  if (bytes.length !== 32) return false;
  const b = Uint8Array.from(bytes);
  const xOdd = (b[31] & 0x80) !== 0;
  b[31] &= 0x7f;
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(b[i]);
  if (y >= P) return false;
  const y2 = mod(y * y);
  const u = mod(y2 - 1n);
  const v = mod(D * y2 + 1n);
  const v3 = mod(v * v * v);
  const v7 = mod(v3 * v3 * v);
  let x = mod(u * v3 * pow(u * v7, (P - 5n) / 8n));
  const vx2 = mod(v * x * x);
  if (vx2 === u) {
    /* root found */
  } else if (vx2 === mod(-u)) x = mod(x * SQRT_M1);
  else return false;
  return !(x === 0n && xOdd);
}

const sha256 = (...parts) => {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return new Uint8Array(h.digest());
};

export function findProgramAddress(seeds, programId) {
  const program = base58Decode(programId);
  for (let bump = 255; bump >= 0; bump--) {
    const hash = sha256(...seeds, Uint8Array.of(bump), program, Buffer.from('ProgramDerivedAddress'));
    if (!isOnCurve(hash)) return [base58Encode(hash), bump];
  }
  throw new Error('No valid program address found');
}

export const METADATA_PROGRAM = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
export const metadataAddress = (mint) =>
  findProgramAddress([Buffer.from('metadata'), base58Decode(METADATA_PROGRAM), base58Decode(mint)], METADATA_PROGRAM)[0];
