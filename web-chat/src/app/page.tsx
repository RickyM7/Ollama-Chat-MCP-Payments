'use client'

import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'

type Role = 'system' | 'user' | 'assistant' | 'tool'
type ToolCall = { function: { name: string; arguments: Record<string, unknown> } }
type Message = { role: Role; content: string; tool_calls?: ToolCall[] }
type ToolRun = { name: string; arguments: Record<string, unknown>; result: unknown }
type ChatMessage = Message & { sent?: Message[]; tools?: ToolRun[] }

interface AuthUser {
  id: string
  username: string
}

const SYSTEM: Message = {
  role: 'system',
  content:
    'Você é um assistente de vendas. Ajude o cliente a comprar produtos seguindo este fluxo: ' +
    '1. Pergunte o que o cliente deseja ou use listar_catalogo para mostrar opções. ' +
    '2. Quando o cliente decidir, use registrar_intencao com produto_id e quantidade. ' +
    '3. O sistema retorna um intencao_id com o preço total e tempo de validade (15 minutos). ' +
    '4. Pergunte ao cliente qual método de pagamento (pix ou cartao) e use realizar_compra. ' +
    '5. Confirme o sucesso da compra e o novo saldo do cliente. ' +
    'Nunca invente IDs de intenção ou produtos. Se algum erro ocorrer, explique em português. ' +
    'Sempre mostre valores em reais (R$ X.XXX,XX). Responda SEMPRE em português brasileiro.',
}

export default function Page() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [peek, setPeek] = useState<number | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Check if user is authenticated on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          setUser(await res.json())
        }
      } catch {
        // Not authenticated
      } finally {
        setLoading(false)
      }
    }
    checkAuth()
  }, [])

  function showPeek(i: number) {
    clearTimeout(closeTimer.current)
    setPeek(i)
  }
  function hidePeek() {
    closeTimer.current = setTimeout(() => setPeek(null), 400)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      })

      if (!res.ok) {
        setLoginError('Usuário ou senha inválidos')
        return
      }

      const data = await res.json()
      setUser(data)
      setLoginUsername('')
      setLoginPassword('')
    } catch (err) {
      setLoginError(String(err))
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      setUser(null)
      setMessages([])
    } catch {
      // ignore
    }
  }

  async function send(e: { preventDefault(): void }) {
    e.preventDefault()
    if (!input.trim() || busy || !user) return

    const userMsg: Message = { role: 'user', content: input }

    // Build full payload: [SYSTEM, ...full history with tool_calls and tool results, user message]
    const fullHistory: Message[] = [SYSTEM]
    for (const msg of messages) {
      if (msg.role === 'assistant') {
        fullHistory.push({ role: 'assistant', content: msg.content, tool_calls: msg.tool_calls })
      } else if (msg.role === 'tool') {
        fullHistory.push({ role: 'tool', content: msg.content })
      } else if (msg.role === 'user') {
        fullHistory.push({ role: 'user', content: msg.content })
      }
    }
    fullHistory.push(userMsg)

    const userTurn: ChatMessage = { ...userMsg, sent: fullHistory }
    const assistantPlaceholder: ChatMessage = { role: 'assistant', content: '', sent: fullHistory }
    const newMessages = [...messages, userTurn, assistantPlaceholder]
    const assistantIndex = newMessages.length - 1
    setMessages(newMessages)
    setInput('')
    setBusy(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: fullHistory }),
      })
      if (!res.ok || !res.body) throw new Error(await res.text())

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ''
      let reply = ''
      let currentToolCalls: ToolCall[] = []
      let toolsThisTurn: ToolRun[] = []

      for (; ;) {
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
            // Tool call completed - finalize assistant message and add tool result
            toolsThisTurn.push(chunk.tool)
            const updated = [...newMessages]
            updated[assistantIndex] = {
              ...updated[assistantIndex],
              role: 'assistant',
              content: reply,
              tool_calls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
              tools: toolsThisTurn,
            }
            // Add tool result message
            updated.push({ role: 'tool', content: JSON.stringify(chunk.tool.result), sent: fullHistory })
            setMessages(updated)
            reply = ''
            currentToolCalls = []
          }
          const msgContent = chunk.message?.content ?? ''
          if (msgContent) {
            reply += msgContent
          }
          if (chunk.message?.tool_calls) {
            currentToolCalls.push(...chunk.message.tool_calls)
          }
          if (!chunk.tool) {
            // Update streaming content
            const updated = [...newMessages]
            updated[assistantIndex] = {
              ...updated[assistantIndex],
              role: 'assistant',
              content: reply,
              tool_calls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
              tools: toolsThisTurn,
            }
            setMessages(updated)
          }
        }
      }
    } catch (err) {
      const updated = [...newMessages]
      updated[assistantIndex] = { ...updated[assistantIndex], content: `Erro: ${err}` }
      setMessages(updated)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <main className="mx-auto flex h-screen max-w-2xl flex-col items-center justify-center">Carregando…</main>
  }

  if (!user) {
    return (
      <main className="mx-auto flex h-screen max-w-2xl flex-col items-center justify-center gap-4 p-4">
        <h1 className="text-2xl font-bold">Loja de Eletrônicos</h1>
        <form onSubmit={handleLogin} className="w-full max-w-xs space-y-3 rounded border p-4">
          <div>
            <label className="block text-sm font-semibold">Usuário</label>
            <input
              type="text"
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              className="w-full rounded border px-3 py-2"
              placeholder="alice"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold">Senha</label>
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              className="w-full rounded border px-3 py-2"
              placeholder="senha123"
            />
          </div>
          {loginError && <p className="text-sm text-red-600">{loginError}</p>}
          <button className="w-full rounded bg-blue-600 px-4 py-2 text-white">Login</button>
        </form>
        <p className="text-sm text-gray-600">Demo: alice/senha123, bob/senha456, carol/senha789</p>
      </main>
    )
  }

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          Loja de Eletrônicos — {user.username}
        </h1>
        <button
          onClick={handleLogout}
          className="rounded border px-3 py-2 text-sm hover:bg-gray-100"
        >
          Sair
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-sm text-gray-500">
            Olá! Bem-vindo à loja. O que gostaria de fazer?
          </p>
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
          ) : m.role === 'tool' ? (
            <div
              key={i}
              className="w-fit max-w-[80%] rounded bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200"
            >
              <span className="font-mono font-semibold">Ferramenta</span>
              <p className="whitespace-pre-wrap font-mono">{m.content}</p>
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
          placeholder="Pergunte algo…"
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
              {s.tool_calls && (
                <div className="mt-1 text-gray-600">
                  <span className="font-mono text-xs">tool_calls:</span>
                  {s.tool_calls.map((tc, i) => (
                    <div key={i} className="ml-2 font-mono text-xs">
                      {tc.function.name}: {JSON.stringify(tc.function.arguments)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </aside>
      )}
    </main>
  )
}

