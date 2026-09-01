import { randomBytes } from 'node:crypto'

import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type Product = { id: string; nome: string; preco: number; moeda: string; estoque: number; categoria?: string }
export type PaymentContext = { username: string; sessionId: string; limiteInicial: number }
type PaymentMethod = 'cartao' | 'pix'
type PurchaseIntent = {
  intencaoId: string; username: string; sessionId: string; produtoId: string; quantidade: number
  valorTotal: number; moeda: string; status: 'pendente' | 'paga'; expiraEm: Date
}

export type AuditLogEntry = {
  timestamp: string
  usuario: string
  sessionId: string
  tool: string
  parametros: Record<string, unknown>
  resultado: unknown
}

const INTENT_TTL_MS = 10 * 60 * 1000
const intents = new Map<string, PurchaseIntent>()
const balances = new Map<string, number>()
const auditLogs: AuditLogEntry[] = []
const LOGS_FILE = join(process.cwd(), 'logs', 'audit.jsonl')

export function registrarAuditoria(
  usuario: string,
  sessionId: string,
  tool: string,
  parametros: Record<string, unknown>,
  resultado: unknown
) {
  const entry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    usuario,
    sessionId,
    tool,
    parametros,
    resultado,
  }
  auditLogs.push(entry)
  console.log(`[AUDIT] ${entry.timestamp} | User: ${usuario} | Tool: ${tool} | Result: ${JSON.stringify(resultado)}`)
  try {
    mkdirSync(dirname(LOGS_FILE), { recursive: true })
    appendFileSync(LOGS_FILE, JSON.stringify(entry) + '\n', 'utf8')
  } catch {}
}

export function obterLogsAuditoria(): AuditLogEntry[] {
  return [...auditLogs]
}

export const CATALOGO: Product[] = [
  { id: 'prod_001', nome: 'PlayStation 5', preco: 4799.0, moeda: 'BRL', estoque: 10, categoria: 'games' },
  { id: 'prod_002', nome: 'PC Gamer', preco: 12499.0, moeda: 'BRL', estoque: 5, categoria: 'informatica' },
  { id: 'prod_003', nome: 'Fone Bluetooth', preco: 249.9, moeda: 'BRL', estoque: 12, categoria: 'audio' },
  { id: 'prod_004', nome: 'Monitor Gamer 27" 144Hz', preco: 1899.9, moeda: 'BRL', estoque: 8, categoria: 'monitores' },
  { id: 'prod_005', nome: 'Cadeira Gamer Ergonômica', preco: 1299.0, moeda: 'BRL', estoque: 15, categoria: 'moveis' },
  { id: 'prod_006', nome: 'Mouse Sem Fio', preco: 149.5, moeda: 'BRL', estoque: 25, categoria: 'perifericos' },
  { id: 'prod_007', nome: 'Teclado Mecânico RGB', preco: 299.9, moeda: 'BRL', estoque: 18, categoria: 'perifericos' },
]

function newId(prefix: 'int' | 'tx') { return `${prefix}_${randomBytes(6).toString('hex')}` }
function money(value: number) { return Number(value.toFixed(2)) }
function refused(
  erro: 'INTENCAO_INVALIDA' | 'INTENCAO_EXPIRADA' | 'INTENCAO_JA_PAGA' | 'LIMITE_EXCEDIDO' | 'METODO_INVALIDO',
  mensagem: string
) { return { status: 'recusado' as const, erro, mensagem } }

function normalize(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

export function listarCatalogo(args?: { categoria?: string }) {
  const cat = typeof args?.categoria === 'string' ? normalize(args.categoria) : ''
  const produtos = cat ? CATALOGO.filter((p) => p.categoria && normalize(p.categoria) === cat) : CATALOGO
  return { produtos: produtos.map(({ id, nome, preco, moeda, estoque }) => ({ id, nome, preco, moeda, estoque })) }
}

export function obterLimiteDisponivel(context: PaymentContext) {
  return balances.get(context.username) ?? context.limiteInicial
}

export function registrarIntencao(
  context: PaymentContext,
  args: { produto_id: string; quantidade: number },
  now = new Date()
) {
  const produto = CATALOGO.find((item) => item.id === args.produto_id)
  if (!produto) {
    const res = { status: 'recusado' as const, erro: 'PRODUTO_INVALIDO', mensagem: 'Produto não encontrado no catálogo.' }
    registrarAuditoria(context.username, context.sessionId, 'registrar_intencao', args, res)
    return res
  }
  if (!Number.isInteger(args.quantidade) || args.quantidade <= 0) {
    const res = { status: 'recusado' as const, erro: 'QUANTIDADE_INVALIDA', mensagem: 'A quantidade deve ser um inteiro maior que zero.' }
    registrarAuditoria(context.username, context.sessionId, 'registrar_intencao', args, res)
    return res
  }
  if (args.quantidade > produto.estoque) {
    const res = { status: 'recusado' as const, erro: 'ESTOQUE_INSUFICIENTE', mensagem: 'Não há estoque suficiente para essa quantidade.' }
    registrarAuditoria(context.username, context.sessionId, 'registrar_intencao', args, res)
    return res
  }

  const intent: PurchaseIntent = {
    intencaoId: newId('int'), username: context.username, sessionId: context.sessionId,
    produtoId: produto.id, quantidade: args.quantidade, valorTotal: money(produto.preco * args.quantidade),
    moeda: produto.moeda, status: 'pendente', expiraEm: new Date(now.getTime() + INTENT_TTL_MS),
  }
  intents.set(intent.intencaoId, intent)
  const res = {
    intencao_id: intent.intencaoId, produto_id: intent.produtoId, quantidade: intent.quantidade,
    valor_total: intent.valorTotal, moeda: intent.moeda, status: intent.status, expira_em: intent.expiraEm.toISOString(),
  }
  registrarAuditoria(context.username, context.sessionId, 'registrar_intencao', args, res)
  return res
}

export function realizarCompra(
  context: PaymentContext,
  args: { intencao_id: string; metodo_pagamento: string },
  now = new Date()
) {
  const intent = intents.get(args.intencao_id)
  if (!intent || intent.username !== context.username || intent.sessionId !== context.sessionId) {
    const res = refused('INTENCAO_INVALIDA', 'A intenção informada não é válida para esta sessão.')
    registrarAuditoria(context.username, context.sessionId, 'realizar_compra', args, res)
    return res
  }
  if (intent.status === 'paga') {
    const res = refused('INTENCAO_JA_PAGA', 'Esta intenção já foi utilizada em uma compra.')
    registrarAuditoria(context.username, context.sessionId, 'realizar_compra', args, res)
    return res
  }
  if (now.getTime() >= intent.expiraEm.getTime()) {
    const res = refused('INTENCAO_EXPIRADA', 'Esta intenção de compra expirou.')
    registrarAuditoria(context.username, context.sessionId, 'realizar_compra', args, res)
    return res
  }
  if (args.metodo_pagamento !== 'cartao' && args.metodo_pagamento !== 'pix') {
    const res = refused('METODO_INVALIDO', 'Use cartao ou pix como método de pagamento.')
    registrarAuditoria(context.username, context.sessionId, 'realizar_compra', args, res)
    return res
  }

  const limiteAtual = obterLimiteDisponivel(context)
  if (intent.valorTotal > limiteAtual) {
    const res = refused('LIMITE_EXCEDIDO', 'O valor da compra excede o limite disponível do usuário.')
    registrarAuditoria(context.username, context.sessionId, 'realizar_compra', args, res)
    return res
  }
  const produto = CATALOGO.find((item) => item.id === intent.produtoId)
  if (!produto || produto.estoque < intent.quantidade) {
    const res = refused('INTENCAO_INVALIDA', 'O produto desta intenção não possui mais estoque suficiente.')
    registrarAuditoria(context.username, context.sessionId, 'realizar_compra', args, res)
    return res
  }

  const limiteRestante = money(limiteAtual - intent.valorTotal)
  intent.status = 'paga'
  produto.estoque -= intent.quantidade
  balances.set(context.username, limiteRestante)
  const res = {
    status: 'aprovado' as const, transacao_id: newId('tx'), intencao_id: intent.intencaoId,
    valor: intent.valorTotal, metodo_pagamento: args.metodo_pagamento as PaymentMethod,
    limite_restante: limiteRestante, data: now.toISOString(),
  }
  registrarAuditoria(context.username, context.sessionId, 'realizar_compra', args, res)
  return res
}

export function resetPaymentStateForTests() {
  intents.clear()
  balances.clear()
  auditLogs.length = 0
}
