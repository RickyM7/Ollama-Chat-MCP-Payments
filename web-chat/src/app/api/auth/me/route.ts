import { NextResponse } from 'next/server'
import { verifyUserToken, findUserByUsername, getCurrentUserLimit } from '@/lib/auth'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace(/^Bearer /, '')

  if (!token) {
    return NextResponse.json({ error: 'Não autorizado. Token ausente.' }, { status: 401 })
  }

  const payload = verifyUserToken(token)
  if (!payload) {
    return NextResponse.json({ error: 'Token inválido ou expirado.' }, { status: 401 })
  }

  const user = findUserByUsername(payload.username)
  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
  }

  const limite = await getCurrentUserLimit(token, user.limite)

  return NextResponse.json({
    username: user.username,
    role: user.role,
    limite,
  })
}

