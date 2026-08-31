import { verifyUserToken } from '@/lib/auth'
import { CHAT_SYSTEM_PROMPT } from '@/lib/chat-system'

export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token || !verifyUserToken(token)) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  return Response.json({ prompt: CHAT_SYSTEM_PROMPT })
}

