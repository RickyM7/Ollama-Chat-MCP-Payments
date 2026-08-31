import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { verifyJWT, getJWTFromCookie } from '@/lib/auth'

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const MODEL = process.env.OLLAMA_MODEL ?? 'qwen3:1.7b'
const MCP_URL = process.env.MCP_URL ?? 'http://localhost:4000/mcp'
const HOLD_MS = 600
const MAX_ROUNDS = 4

type Message = { role: string; content: string; tool_calls?: ToolCall[] }
type ToolCall = { function: { name: string; arguments: Record<string, unknown> } }

async function connect(userId: string) {
  const client = new Client({ name: 'ollama-chat', version: '1.0.0' })

  // Store userId for fetch interception
  const originalFetch = global.fetch
  const patchedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (url.includes('/mcp')) {
      const headers = new Headers(init?.headers || {})
      headers.set('X-User-Id', userId)
      return originalFetch(input, { ...init, headers })
    }
    return originalFetch(input, init)
  }
  global.fetch = patchedFetch as any

  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL))
  try {
    await client.connect(transport)
  } finally {
    global.fetch = originalFetch
  }

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
  // Validate JWT
  const cookieHeader = request.headers.get('cookie') ?? ''
  const token = getJWTFromCookie(cookieHeader)

  if (!token) {
    return Response.json({ error: 'não autenticado' }, { status: 401 })
  }

  const payload = await verifyJWT(token)
  if (!payload) {
    return Response.json({ error: 'token inválido' }, { status: 401 })
  }

  const userId = payload.id
  const { messages } = await request.json()
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: 'messages must be a non-empty array' }, { status: 400 })
  }

  let client: Client | undefined
  let tools: unknown[] | undefined
  try {
    client = await connect(userId)
    tools = toOllamaTools((await client.listTools()).tools)
  } catch {
    client = undefined
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const line = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      const convo: Message[] = [...messages]

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

          for (; ;) {
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
            line({ done: true })
            break
          }

          convo.push({ role: 'assistant', content, tool_calls: calls })
          for (const call of calls) {
            const result = client ? await runTool(client, call) : { error: 'no tool server' }
            convo.push({ role: 'tool', content: JSON.stringify(result) })
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

