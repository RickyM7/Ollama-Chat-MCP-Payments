'use client'

import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import { LoginForm } from '@/components/LoginForm'
import { ChatHeader } from '@/components/ChatHeader'
import type { AuthResponse } from '@/types/index'

type Role = 'user' | 'assistant'
type Message = { role: Role; content: string }
type ToolRun = { name: string; arguments: Record<string, unknown>; result: unknown }
type ModelMessage = {
  role: Role | 'tool'
  content: string
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[]
}
type Turn = Message & { sent?: ModelMessage[]; tools?: ToolRun[] }

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
    for (const tool of turn.tools) {
      result.push({ role: 'tool', content: JSON.stringify(tool.result) })
    }
  }
  return result
}

export default function Page() {
  const [auth, setAuth] = useState<AuthResponse | null>(null)
  const [messages, setMessages] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [showInspect, setShowInspect] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState<string>('')
  const sessionId = useRef<string | null>(null)
  if (!sessionId.current) sessionId.current = crypto.randomUUID()

  useEffect(() => {
    try {
      const savedAuth = sessionStorage.getItem('chat_auth')
      const savedSession = sessionStorage.getItem('chat_session_id')
      if (savedAuth) {
        const parsed = JSON.parse(savedAuth) as AuthResponse
        setAuth(parsed)
        if (savedSession) sessionId.current = savedSession
        fetch('/api/auth/me', { headers: { Authorization: `Bearer ${parsed.token}` } })
          .then((res) => (res.ok ? res.json() : null))
          .then((me) => {
            if (me && typeof me.limite === 'number') {
              setAuth((current) => {
                if (!current) return current
                const updated = { ...current, limite: me.limite }
                try {
                  sessionStorage.setItem('chat_auth', JSON.stringify(updated))
                } catch {}
                return updated
              })
            }
          })
          .catch(() => {})
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (showInspect && auth?.token && !systemPrompt) {
      fetch('/api/system', { headers: { Authorization: `Bearer ${auth.token}` } })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.prompt) setSystemPrompt(data.prompt)
        })
        .catch(() => {})
    }
  }, [showInspect, auth?.token, systemPrompt])

  function handleLoginSuccess(data: AuthResponse) {
    setAuth(data)
    try {
      sessionStorage.setItem('chat_auth', JSON.stringify(data))
      if (sessionId.current) sessionStorage.setItem('chat_session_id', sessionId.current)
    } catch {}
  }

  function handleLogout() {
    setAuth(null)
    setMessages([])
    setShowInspect(false)
    setSystemPrompt('')
    sessionId.current = crypto.randomUUID()
    try {
      sessionStorage.removeItem('chat_auth')
      sessionStorage.removeItem('chat_session_id')
    } catch {}
  }

  async function send(e: { preventDefault(): void }) {
    e.preventDefault()
    if (!input.trim() || busy) return

    const user: Message = { role: 'user', content: input }
    const history = modelHistory(messages)
    const payload: ModelMessage[] = [...history, user]

    const turn: Turn = { ...user, sent: payload }
    const next: Turn[] = [...messages, turn]
    setMessages([...next, { role: 'assistant', content: '' }])
    setInput('')
    setBusy(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth?.token ?? ''}`,
        },
        body: JSON.stringify({ messages: payload, sessionId: sessionId.current }),
      })
      if (res.status === 401) {
        handleLogout()
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
            if (
              chunk.tool.result?.status === 'aprovado' &&
              typeof chunk.tool.result.limite_restante === 'number'
            ) {
              setAuth((current) => {
                if (!current) return current
                const updated = { ...current, limite: chunk.tool.result.limite_restante }
                try {
                  sessionStorage.setItem('chat_auth', JSON.stringify(updated))
                } catch {}
                return updated
              })
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

  if (!auth) return <LoginForm onLoginSuccess={handleLoginSuccess} />

  const currentPayload = modelHistory(messages)

  return (
    <main className="mx-auto flex h-screen max-w-5xl gap-4 p-4">
      <div className="flex flex-1 flex-col gap-4">
        <ChatHeader
          user={auth}
          onLogout={handleLogout}
          onToggleInspect={() => setShowInspect((prev) => !prev)}
          isInspecting={showInspect}
        />

        <div className="flex-1 space-y-3 overflow-y-auto">
          {messages.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700">
              <p className="font-semibold text-gray-700 dark:text-gray-300">
                Olá, {auth.username}! Como posso te ajudar hoje?
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Você pode pedir para ver o catálogo de eletrônicos, consultar preços ou comprar um produto.
              </p>
            </div>
          )}
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div
                key={i}
                className="ml-auto w-fit max-w-[80%] whitespace-pre-wrap rounded bg-blue-600 px-3 py-2 text-white shadow-sm"
              >
                {m.content}
              </div>
            ) : (
              <div
                key={i}
                className="prose-chat w-fit max-w-[80%] rounded bg-gray-200 px-3 py-2 text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100"
              >
                {m.content ? <Markdown>{m.content}</Markdown> : '…'}
              </div>
            )
          )}
        </div>

        <form onSubmit={send} className="flex gap-2">
          <input
            className="flex-1 rounded border border-gray-300 bg-transparent px-3 py-2 text-sm focus:border-blue-600 focus:outline-none dark:border-gray-700"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite sua mensagem (ex: 'O que vocês vendem?', 'Quero 1 Fone Bluetooth')…"
          />
          <button
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={busy}
          >
            Enviar
          </button>
        </form>
      </div>

      {showInspect && (
        <aside className="flex w-96 flex-col rounded-lg border border-gray-300 bg-gray-50 p-4 text-xs shadow-md dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-3 flex items-center justify-between border-b pb-2">
            <div>
              <h2 className="font-bold text-gray-900 dark:text-gray-100">Painel de Inspeção LLM</h2>
              <p className="text-[10px] text-gray-500">Histórico completo e contexto do modelo</p>
            </div>
            <button
              onClick={() => setShowInspect(false)}
              className="rounded p-1 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            <details className="group rounded border border-purple-300 bg-purple-50 p-2.5 dark:border-purple-900 dark:bg-purple-950">
              <summary className="flex cursor-pointer items-center justify-between font-mono text-[10px] font-bold uppercase text-purple-800 dark:text-purple-300 select-none">
                <div className="flex items-center gap-1.5">
                  <span className="transition-transform duration-200 group-open:rotate-90">▶</span>
                  <span>System Prompt</span>
                </div>
                <span className="text-[9px] font-normal lowercase text-purple-600 dark:text-purple-400">
                  (regras fixas anexadas a todas as mensagens)
                </span>
              </summary>
              <div className="mt-2 border-t border-purple-200 pt-2 dark:border-purple-900">
                <p className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-purple-950 dark:text-purple-200">
                  {systemPrompt || 'Carregando prompt oficial do backend...'}
                </p>
              </div>
            </details>

            <div className="border-t pt-2">
              <p className="mb-2 font-semibold text-gray-700 dark:text-gray-300">
                Turnos no Histórico ({currentPayload.length} mensagens):
              </p>

              {currentPayload.length === 0 && (
                <p className="text-[11px] text-gray-400">Nenhuma mensagem trocada ainda.</p>
              )}

              {currentPayload.map((msg, idx) => (
                <div key={idx} className="mb-2 rounded border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-950">
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-mono text-[10px] font-bold uppercase ${
                        msg.role === 'user'
                          ? 'text-blue-600 dark:text-blue-400'
                          : msg.role === 'tool'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {msg.role}
                    </span>
                    <span className="text-[9px] text-gray-400">#{idx + 1}</span>
                  </div>

                  {msg.tool_calls && (
                    <div className="mt-1 rounded border border-amber-300 bg-amber-50 p-1.5 dark:border-amber-900 dark:bg-amber-950">
                      {msg.tool_calls.map((call, cIdx) => (
                        <div key={cIdx}>
                          <span className="font-mono font-bold text-amber-800 dark:text-amber-300">
                            Chamada: {call.function.name}
                          </span>
                          <pre className="mt-0.5 overflow-x-auto font-mono text-[10px] text-amber-900 dark:text-amber-200">
                            {JSON.stringify(call.function.arguments, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.content && (
                    <p className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-gray-800 dark:text-gray-200">
                      {msg.content}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}
    </main>
  )
}
