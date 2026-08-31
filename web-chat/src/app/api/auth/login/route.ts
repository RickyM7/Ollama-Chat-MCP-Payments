import { NextResponse } from 'next/server'
import { findUserByUsername, verifyPassword, signUserToken, JWT_TTL } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { username, password } = body ?? {}

    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password.trim()) {
      return NextResponse.json({ error: 'Usuário e senha são obrigatórios.' }, { status: 400 })
    }

    const user = findUserByUsername(username.trim())
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 401 })
    }

    const token = signUserToken(user)

    return NextResponse.json({
      token,
      username: user.username,
      role: user.role,
      limite: user.limite,
      expiresIn: JWT_TTL,
    })
  } catch (err) {
    return NextResponse.json({ error: `Erro no login: ${String(err)}` }, { status: 500 })
  }
}

