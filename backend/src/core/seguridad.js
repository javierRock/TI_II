import argon2 from 'argon2';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const cookieName = 'prestamos_session';
export const hashPassword = (value) => argon2.hash(value, {
  type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1,
});
const dummyHash = hashPassword(randomBytes(32).toString('hex'));

export async function verifyPassword(hash, value) {
  try {
    return await argon2.verify(hash ?? await dummyHash, value);
  } catch {
    return false;
  }
}

export const tokenHash = (value) => createHash('sha256').update(value).digest('hex');
export const sessionToken = () => randomBytes(32).toString('base64url');
export const csrfToken = (token) => tokenHash(`csrf:${token}`);
export const validToken = (token) => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
export function sameToken(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export const cookieOptions = (production) => ({ httpOnly: true, secure: production, sameSite: 'lax', path: '/api/v1' });
