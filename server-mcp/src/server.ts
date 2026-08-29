import express from 'express'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { listarCatalogo } from './tools.ts'

const PORT = Number(process.env.PORT ?? 4000)

const mcp = new McpServer({ name: 'server-mcp', version: '1.0.0' })

mcp.registerTool(
  'listar_catalogo',
  {
    description: 'Retorna os produtos disponíveis no catálogo da loja. Permite filtro opcional por categoria.',
    inputSchema: {
      categoria: z.string().optional().describe('Filtro opcional por categoria de produto (ex: audio, perifericos, games).'),
    },
  },
  async ({ categoria }) => json(listarCatalogo({ categoria }))
)

function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] }
}

const app = express()
app.use(express.json())

app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on('close', () => transport.close())
  await mcp.connect(transport)
  await transport.handleRequest(req, res, req.body)
})

app.listen(PORT, () => console.log(`server-mcp (MCP) on http://localhost:${PORT}/mcp`))
