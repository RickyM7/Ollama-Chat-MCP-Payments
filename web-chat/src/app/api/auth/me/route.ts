import { verifyJWT, getJWTFromCookie } from '@/lib/auth'
import { findUserById } from '@/lib/users'

export async function GET(request: Request) {
    try {
        const cookieHeader = request.headers.get('cookie') ?? ''
        const token = getJWTFromCookie(cookieHeader)

        if (!token) {
            return Response.json({ error: 'não autenticado' }, { status: 401 })
        }

        const payload = await verifyJWT(token)
        if (!payload) {
            return Response.json({ error: 'token inválido' }, { status: 401 })
        }

        const user = findUserById(payload.id)
        if (!user) {
            return Response.json({ error: 'usuário não encontrado' }, { status: 401 })
        }

        return Response.json({ id: user.id, username: user.username })
    } catch (err) {
        return Response.json({ error: String(err) }, { status: 500 })
    }
}
