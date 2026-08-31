import { findUserByUsername, type AuthPayload } from '@/lib/users'
import { signJWT, createAuthCookie } from '@/lib/auth'

export async function POST(request: Request) {
    try {
        const { username, password } = await request.json()

        if (!username || !password) {
            return Response.json({ error: 'username e password são obrigatórios' }, { status: 400 })
        }

        const user = findUserByUsername(username)
        if (!user || user.password !== password) {
            return Response.json({ error: 'usuário ou senha inválidos' }, { status: 401 })
        }

        const payload: AuthPayload = { id: user.id, username: user.username }
        const token = await signJWT(payload)

        return Response.json({ id: user.id, username: user.username }, {
            status: 200,
            headers: { 'Set-Cookie': createAuthCookie(token) },
        })
    } catch (err) {
        return Response.json({ error: String(err) }, { status: 500 })
    }
}
