import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { verifyUserToken } from '@/lib/auth'
import { intentAppearsInHistory } from '@/lib/chat-history'

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const MODEL = process.env.OLLAMA_MODEL ?? 'qwen3:1.7b'
const MCP_URL = process.env.MCP_URL ?? 'http://localhost:4000/mcp'
const HOLD_MS = 600
const MAX_ROUNDS = 4

type Message = { role: string; content: string; tool_calls?: ToolCall[] }
type ToolCall = { function: { name: string; arguments: Record<string, unknown> } }

const SYSTEM: Message = {
  role: 'system',
  content:
    'Você é um vendedor de uma loja de eletrônicos. Responda sempre em português brasileiro, de forma objetiva e educada. ' +
    'Use listar_catalogo para consultar produtos e preços. Use registrar_intencao quando o usuário escolher produto e quantidade. ' +
    'Só use realizar_compra depois que houver uma intenção válida no histórico e o usuário escolher cartao ou pix. ' +
    'Nunca invente produtos, preços, valores, IDs ou resultados; explique claramente qualquer erro retornado pelas ferramentas.',
}

const globalState = globalThis as typeof globalThis & {
  paymentChatHistories?: Map<string, Message[]>
}
const chatHistories = globalState.paymentChatHistories ??= new Map<string, Message[]>()

async function connect(token: string, sessionId: string) {
  const client = new Client({ name: 'ollama-chat', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: {
      headers: { Authorization: `Bearer ${token}`, 'X-Chat-Session': sessionId },
    },
  }))
  return client
}

function toOllamaTools(mcpTools: { name: string; description?: string; inputSchema: unknown }[]) {
  return mcpTools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description ?? '', parameters: t.inputSchema },
  }))
}

async function runTool(client: Client, call: ToolCall) {
  try {
    const out = await client.callTool({ name: call.function.name, arguments: call.function.arguments ?? {} })
    const text = Array.isArray(out.content) ? out.content.find((c) => c.type === 'text')?.text : undefined
    if (out.isError) return { error: text ?? 'tool failed' }
    try {
      return JSON.parse(text ?? 'null')
    } catch {
      return text
    }
  } catch (err) {
    return { error: `mcp: ${err}` }
  }
}

export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const authenticatedUser = token ? verifyUserToken(token) : null
  if (!token || !authenticatedUser) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const { message, sessionId } = await request.json()
  if (typeof message !== 'string' || !message.trim()) {
    return Response.json({ error: 'message must be a non-empty string' }, { status: 400 })
  }
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    return Response.json({ error: 'sessionId is required' }, { status: 400 })
  }

  let client: Client
  let tools: unknown[]
  try {
    client = await connect(token, sessionId)
    tools = toOllamaTools((await client.listTools()).tools)
  } catch (err) {
    return Response.json(
      { error: `Servidor MCP indisponível ou não autorizado: ${String(err)}` },
      { status: 503 }
    )
  }

  const encoder = new TextEncoder()
  const historyKey = `${authenticatedUser.username}\u0000${sessionId}`
  const convo: Message[] = [
    ...(chatHistories.get(historyKey) ?? [SYSTEM]),
    { role: 'user', content: message.trim() },
  ]

  const stream = new ReadableStream({
    async start(controller) {
      const line = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))

      try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const res = await fetch(`${OLLAMA_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: MODEL, messages: convo, tools, stream: true }),
            signal: request.signal,
          })
          if (!res.ok || !res.body) {
            line({ error: `ollama: ${res.status} ${await res.text()}`, done: true })
            break
          }

          const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
          let buffer = ''
          let content = ''
          const calls: ToolCall[] = []
          let held = ''
          let live = false
          const started = Date.now()
          const flush = () => {
            if (held) line({ message: { role: 'assistant', content: held } })
            held = ''
            live = true
          }

          for (;;) {
            const { value, done } = await reader.read()
            if (done) break
            buffer += value
            const parts = buffer.split('\n')
            buffer = parts.pop() ?? ''
            for (const part of parts) {
              if (!part.trim()) continue
              const chunk = JSON.parse(part)
              const text = chunk.message?.content ?? ''
              if (text) {
                content += text
                if (live) line(chunk)
                else {
                  held += text
                  if (Date.now() - started > HOLD_MS) flush()
                }
              }
              if (chunk.message?.tool_calls) {
                calls.push(...chunk.message.tool_calls)
                held = ''
              }
            }
          }

          if (calls.length === 0) {
            flush()
            convo.push({ role: 'assistant', content })
            chatHistories.set(historyKey, convo)
            line({ done: true })
            break
          }

          convo.push({ role: 'assistant', content, tool_calls: calls })
          for (const call of calls) {
            const intentId = call.function.arguments?.intencao_id
            const missingFromHistory =
              call.function.name === 'realizar_compra' &&
              typeof intentId === 'string' &&
              !intentAppearsInHistory(convo, intentId)
            const result = missingFromHistory
              ? {
                  status: 'recusado',
                  erro: 'INTENCAO_INVALIDA',
                  mensagem: 'A intenção informada não apareceu no histórico desta conversa.',
                }
              : await runTool(client, call)
            convo.push({ role: 'tool', content: JSON.stringify(result) })
            chatHistories.set(historyKey, convo)
            line({ tool: { name: call.function.name, arguments: call.function.arguments, result } })
          }
        }
      } catch (err) {
        line({ error: String(err), done: true })
      } finally {
        await client?.close()
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
  })
}

