'use client'

import { useRef, useState } from 'react'
import Markdown from 'react-markdown'
import { LoginForm } from '@/components/LoginForm'
import { ChatHeader } from '@/components/ChatHeader'
import type { AuthResponse } from '@/types/index'

type Role = 'system' | 'user' | 'assistant'
type Message = { role: Role; content: string }
type ToolRun = { name: string; arguments: Record<string, unknown>; result: unknown }
type ModelMessage = {
  role: Role | 'tool'
  content: string
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[]
}
type Turn = Message & { sent?: ModelMessage[]; tools?: ToolRun[] }

const SYSTEM: Message = {
  role: 'system',
  content:
    'Você é um vendedor de uma loja de eletrônicos. Responda sempre em português brasileiro, de forma objetiva e educada. ' +
    'Use listar_catalogo para consultar produtos e preços. Use registrar_intencao quando o usuário escolher produto e quantidade. ' +
    'Só use realizar_compra depois que houver uma intenção válida e o usuário escolher cartao ou pix. ' +
    'Nunca invente produtos, preços, valores, IDs ou resultados; explique claramente qualquer erro retornado pelas ferramentas.',
}

function modelHistory(turns: Turn[]): ModelMessage[] {
  const result: ModelMessage[] = []
  for (const turn of turns) {
    result.push({ role: turn.role, content: turn.content })
    if (!turn.tools?.length) continue
    result.push({
      role: 'assistant',
      content: '',
      tool_calls: turn.tools.map((tool) => ({
        function: { name: tool.name, arguments: tool.arguments },
      })),
    })
    for (const tool of turn.tools) result.push({ role: 'tool', content: JSON.stringify(tool.result) })
  }
  return result
}

export default function Page() {
  const [auth, setAuth] = useState<AuthResponse | null>(null)
  const [messages, setMessages] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [peek, setPeek] = useState<number | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const sessionId = useRef<string | null>(null)
  if (!sessionId.current) sessionId.current = crypto.randomUUID()

  function showPeek(i: number) {
    clearTimeout(closeTimer.current)
    setPeek(i)
  }
  function hidePeek() {
    closeTimer.current = setTimeout(() => setPeek(null), 400)
  }

  async function send(e: { preventDefault(): void }) {
    e.preventDefault()
    if (!input.trim() || busy) return

    const user: Message = { role: 'user', content: input }
    const history = modelHistory(messages)
    const payload: ModelMessage[] = [SYSTEM, ...history, user]

    const turn: Turn = { ...user, sent: payload }
    const next: Turn[] = [...messages, turn]
    setMessages([...next, { role: 'assistant', content: '' }])
    setInput('')
    setBusy(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth?.token ?? ''}` },
        body: JSON.stringify({ message: user.content, sessionId: sessionId.current }),
      })
      if (res.status === 401) {
        setAuth(null)
        throw new Error('Sua sessão expirou. Faça login novamente.')
      }
      if (!res.ok || !res.body) throw new Error(await res.text())

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ''
      let reply = ''

      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += value
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const chunk = JSON.parse(line)
          if (chunk.error) throw new Error(chunk.error)
          if (chunk.tool) {
            turn.tools = [...(turn.tools ?? []), chunk.tool]
            if (chunk.tool.result?.status === 'aprovado' && typeof chunk.tool.result.limite_restante === 'number') {
              setAuth((current) => current ? { ...current, limite: chunk.tool.result.limite_restante } : current)
            }
            reply = ''
          }
          reply += chunk.message?.content ?? ''
          setMessages([...next, { role: 'assistant', content: reply }])
        }
      }
    } catch (err) {
      setMessages([...next, { role: 'assistant', content: `Erro: ${err}` }])
    } finally {
      setBusy(false)
    }
  }

  if (!auth) return <LoginForm onLoginSuccess={setAuth} />

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col gap-4 p-4">
      <ChatHeader
        user={auth}
        onLogout={() => {
          setAuth(null)
          setMessages([])
          sessionId.current = crypto.randomUUID()
        }}
      />
      <p className="text-xs text-gray-500">Histórico completo ativo, incluindo chamadas e resultados das ferramentas.</p>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-sm text-gray-500">Pergunte sobre o catálogo ou escolha um produto para iniciar uma compra.</p>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div
              key={i}
              onMouseEnter={() => showPeek(i)}
              onMouseLeave={hidePeek}
              className="ml-auto w-fit max-w-[80%] cursor-help whitespace-pre-wrap rounded bg-blue-600 px-3 py-2 text-white"
            >
              {m.content}
            </div>
          ) : (
            <div
              key={i}
              className="prose-chat w-fit max-w-[80%] rounded bg-gray-200 px-3 py-2 dark:bg-gray-800"
            >
              {m.content ? <Markdown>{m.content}</Markdown> : '…'}
            </div>
          )
        )}
      </div>

      <form onSubmit={send} className="flex gap-2">
        <input
          className="flex-1 rounded border px-3 py-2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pergunte alguma coisa…"
        />
        <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" disabled={busy}>
          Enviar
        </button>
      </form>

      {peek !== null && messages[peek]?.sent && (
        <aside
          onMouseEnter={() => showPeek(peek)}
          onMouseLeave={hidePeek}
          className="fixed right-4 top-4 z-10 max-h-[calc(100vh-2rem)] w-80 overflow-y-auto rounded border border-gray-300 bg-white p-3 text-xs shadow-lg xl:w-96 dark:border-gray-700 dark:bg-gray-900"
        >
          <p className="mb-2 font-semibold">
            Enviado ao modelo ({messages[peek].sent.length}{' '}
            {messages[peek].sent.length === 1 ? 'mensagem' : 'mensagens'})
          </p>
          {messages[peek].tools?.map((t, j) => (
            <div key={`tool-${j}`} className="mb-2 rounded border border-amber-400 bg-amber-50 p-2 dark:bg-amber-950">
              <span className="font-mono uppercase text-amber-700 dark:text-amber-400">ferramenta · {t.name}</span>
              <p className="whitespace-pre-wrap font-mono">
                {JSON.stringify(t.arguments)} → {JSON.stringify(t.result)}
              </p>
            </div>
          ))}
          {messages[peek].sent.map((s, j) => (
            <div key={j} className="mb-2 last:mb-0">
              <span className="font-mono uppercase text-gray-500">{s.role}</span>
              <p className="whitespace-pre-wrap">{s.content}</p>
            </div>
          ))}
        </aside>
      )}
    </main>
  )
}

