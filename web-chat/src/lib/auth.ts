import { jwtVerify, SignJWT } from 'jose'
import { AuthPayload } from './users'

const JWT_SECRET = process.env.JWT_SECRET ?? 'your-secret-key-change-in-production'
const secret = new TextEncoder().encode(JWT_SECRET)

export async function signJWT(payload: AuthPayload): Promise<string> {
    return new SignJWT({ ...payload } as Record<string, unknown>)
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('7d')
        .sign(secret)
}

export async function verifyJWT(token: string): Promise<AuthPayload | null> {
    try {
        const verified = await jwtVerify(token, secret)
        return verified.payload as unknown as AuthPayload
    } catch {
        return null
    }
}

export function getJWTFromCookie(cookieHeader: string): string | null {
    if (!cookieHeader) return null
    const cookies = cookieHeader.split(';').map((c) => c.trim())
    for (const cookie of cookies) {
        if (cookie.startsWith('auth=')) {
            return cookie.substring(5)
        }
    }
    return null
}

export function createAuthCookie(token: string): string {
    return `auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
}

export function createClearAuthCookie(): string {
    return `auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}
