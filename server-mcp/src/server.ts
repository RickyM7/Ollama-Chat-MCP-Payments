import express from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { listarCatalogo, obterLimiteDisponivel, realizarCompra, registrarIntencao, type PaymentContext } from './tools.ts'

const PORT = Number(process.env.MCP_PORT ?? process.env.PORT ?? 4000)
const JWT_SECRET = process.env.JWT_SECRET || 'fellowship-workshop-secret-token-change-in-prod'

function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] }
}

function authenticatedContext(req: express.Request): PaymentContext | null {
  try {
    const token = req.header('authorization')?.replace(/^Bearer\s+/i, '')
    const sessionId = req.header('x-chat-session')
    if (!token || !sessionId) return null

    const claims = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload
    if (!claims.sub || typeof claims.limite !== 'number' || claims.limite < 0) return null

    return { username: claims.sub, limiteInicial: claims.limite, sessionId }
  } catch {
    return null
  }
}

function createMcp(context: PaymentContext) {
  const mcp = new McpServer({ name: 'server-mcp', version: '1.0.0' })

  mcp.registerTool(
    'listar_catalogo',
    {
      description: 'Retorna os produtos disponíveis no catálogo da loja.',
      inputSchema: {
        categoria: z.string().optional().describe('Filtro opcional por categoria de produto.'),
      },
    },
    async ({ categoria }) => json(listarCatalogo({ categoria }))
  )

  mcp.registerTool(
    'registrar_intencao',
    {
      description: 'Registra uma intenção de compra sem movimentar dinheiro. Use antes de realizar_compra.',
      inputSchema: {
        produto_id: z.string().min(1).describe('ID exato de um produto do catálogo (ex: prod_001).'),
        quantidade: z.number().int().positive().describe('Quantidade inteira maior que zero.'),
      },
    },
    async (args) => json(registrarIntencao(context, args))
  )

  mcp.registerTool(
    'realizar_compra',
    {
      description: 'Executa o pagamento a partir de uma intenção previamente registrada. O valor vem da intenção e nunca é informado pelo modelo.',
      inputSchema: {
        intencao_id: z.string().min(1).describe('Identificador retornado por registrar_intencao (ex: int_...).'),
        metodo_pagamento: z.enum(['cartao', 'pix']).describe('Método de pagamento escolhido pelo usuário ("cartao" ou "pix").'),
      },
    },
    async (args) => json(realizarCompra(context, args))
  )

  return mcp
}

const app = express()
app.use(express.json())

app.get('/account', (req, res) => {
  const context = authenticatedContext(req)
  if (!context) {
    res.status(401).json({ error: 'Não autorizado.' })
    return
  }
  res.setHeader('Cache-Control', 'no-store')
  res.json({ username: context.username, limite: obterLimiteDisponivel(context) })
})

app.post('/mcp', async (req, res) => {
  const context = authenticatedContext(req)
  if (!context) {
    res.status(401).json({ error: 'Não autorizado.' })
    return
  }

  const mcp = createMcp(context)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on('close', () => {
    void transport.close()
    void mcp.close()
  })
  await mcp.connect(transport)
  await transport.handleRequest(req, res, req.body)
})

app.listen(PORT, () => console.log(`server-mcp (MCP) on http://localhost:${PORT}/mcp`))
