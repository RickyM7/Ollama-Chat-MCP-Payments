import { createClearAuthCookie } from '@/lib/auth'

export async function POST(request: Request) {
    return Response.json({ message: 'logout bem-sucedido' }, {
        status: 200,
        headers: { 'Set-Cookie': createClearAuthCookie() },
    })
}
