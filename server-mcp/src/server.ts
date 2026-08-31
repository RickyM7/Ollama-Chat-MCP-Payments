import express from 'express'
import { AsyncLocalStorage } from 'node:async_hooks'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { listarCatalogo, registrarIntencao, realizarCompra } from './tools.ts'

const PORT = Number(process.env.PORT ?? 4000)
const userIdStore = new AsyncLocalStorage<string>()

const mcp = new McpServer({ name: 'ollama-tools', version: '1.0.0' })

mcp.registerTool(
  'listar_catalogo',
  {
    description: 'Lista o catálogo completo de produtos disponíveis. Opcionalmente filtra por categoria.',
    inputSchema: {
      categoria: z.string().optional().describe('Nome da categoria (ex: Eletrônicos, Computadores, Acessórios, Móveis, Pesquisa). Se omitida, lista todas.'),
    },
  },
  async ({ categoria }) => json(listarCatalogo({ categoria }))
)

mcp.registerTool(
  'registrar_intencao',
  {
    description: 'Registra a intenção de compra de um produto. Gera um ID de intenção válido por 15 minutos.',
    inputSchema: {
      produto_id: z.string().describe('ID do produto (ex: prod_001)'),
      quantidade: z.number().positive().describe('Quantidade desejada (deve ser maior que 0)'),
    },
  },
  async ({ produto_id, quantidade }) => {
    try {
      const userId = userIdStore.getStore()
      if (!userId) {
        return json({ erro: 'X-User-Id header é obrigatório' })
      }
      return json(registrarIntencao({ produto_id, quantidade }, userId))
    } catch (err) {
      if (err instanceof Error) {
        return json({ erro: err.message })
      }
      throw err
    }
  }
)

mcp.registerTool(
  'realizar_compra',
  {
    description: 'Realiza o pagamento de uma intenção de compra. Aceita pagamento via PIX ou cartão.',
    inputSchema: {
      intencao_id: z.string().describe('ID da intenção registrada (ex: int_000001)'),
      metodo_pagamento: z.enum(['pix', 'cartao']).describe('Método de pagamento: "pix" ou "cartao"'),
    },
  },
  async ({ intencao_id, metodo_pagamento }) => {
    try {
      const userId = userIdStore.getStore()
      if (!userId) {
        return json({ erro: 'X-User-Id header é obrigatório' })
      }
      return json(realizarCompra({ intencao_id, metodo_pagamento }, userId))
    } catch (err) {
      if (err instanceof Error) {
        return json({ erro: err.message })
      }
      throw err
    }
  }
)

function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] }
}

const app = express()
app.use(express.json())

app.post('/mcp', async (req, res) => {
  const userId = req.headers['x-user-id'] as string | undefined
  if (!userId) {
    return res.status(400).json({ error: 'X-User-Id header é obrigatório' })
  }

  await userIdStore.run(userId, async () => {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => transport.close())
    await mcp.connect(transport)
    await transport.handleRequest(req, res, req.body)
  })
})

app.listen(PORT, () => console.log(`ollama-tools (MCP) on http://localhost:${PORT}/mcp`))
