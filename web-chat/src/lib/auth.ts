import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import jwt from 'jsonwebtoken'
import type { User, Role } from '../types/index.ts'

export const JWT_SECRET = process.env.JWT_SECRET || 'fellowship-workshop-secret-token-change-in-prod'
export const JWT_TTL = '1h'

function hashPassword(password: string): string {
  const salt = randomBytes(16)
  return `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [saltHex, hashHex] = stored.split(':')
    if (!saltHex || !hashHex) return false
    const expected = Buffer.from(hashHex, 'hex')
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

export const USERS: User[] = [
  { username: 'alice', passwordHash: hashPassword('alice123'), role: 'user', limite: 500.0 },
  { username: 'bob', passwordHash: hashPassword('bob123'), role: 'user', limite: 1500.0 },
  { username: 'carla', passwordHash: hashPassword('carla123'), role: 'user', limite: 5000.0 },
]

export function findUserByUsername(username: string): User | undefined {
  return USERS.find((u) => u.username.toLowerCase() === username.toLowerCase())
}

export function signUserToken(user: User): string {
  return jwt.sign(
    {
      role: user.role,
      limite: user.limite,
    },
    JWT_SECRET,
    {
      subject: user.username,
      expiresIn: JWT_TTL,
      algorithm: 'HS256',
    }
  )
}

export function verifyUserToken(token: string): { username: string; role: Role; limite: number } | null {
  try {
    const claims = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload
    if (!claims.sub) return null
    return {
      username: claims.sub,
      role: claims.role as Role,
      limite: claims.limite as number,
    }
  } catch {
    return null
  }
}

export async function getCurrentUserLimit(token: string, fallback: number): Promise<number> {
  try {
    const accountUrl = new URL(process.env.MCP_URL ?? 'http://localhost:4000/mcp')
    accountUrl.pathname = '/account'
    accountUrl.search = ''
    const response = await fetch(accountUrl, {
      headers: { Authorization: `Bearer ${token}`, 'X-Chat-Session': 'account-balance' },
      cache: 'no-store',
    })
    if (!response.ok) return fallback
    const data = (await response.json()) as { limite?: unknown }
    return typeof data.limite === 'number' && data.limite >= 0 ? data.limite : fallback
  } catch {
    return fallback
  }
}
