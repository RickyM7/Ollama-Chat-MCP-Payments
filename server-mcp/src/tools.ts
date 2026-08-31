
import { listProdutos, getProduto, saveIntencao, getIntencao, getUser, saveTransacao, getLimiteRestante, debitarLimite, type Intencao } from './store.ts'

export const CATALOG = (() => {
  const prods = listProdutos()
  return prods.map((p) => ({
    sku: p.id,
    id: p.id,
    nome: p.nome,
    name: p.nome,
    preco: p.preco,
    price: p.preco,
    moeda: p.moeda,
    currency: p.moeda,
    estoque: p.estoque,
    categoria: p.categoria,
  }))
})()

// Counter for generating unique intention IDs
let intencaoCounter = 0

export function listarCatalogo(args: { categoria?: unknown }) {
  const categoria = typeof args.categoria === 'string' ? args.categoria.trim() : undefined
  const produtos = listProdutos(categoria)

  if (produtos.length === 0) {
    if (categoria) {
      return {
        total: 0,
        categoria,
        produtos: [],
        mensagem: `Nenhum produto encontrado na categoria "${categoria}"`
      }
    }
    return { total: 0, produtos: [] }
  }

  return {
    total: produtos.length,
    ...(categoria && { categoria }),
    produtos: produtos.map((p) => ({
      id: p.id,
      nome: p.nome,
      preco: p.preco,
      moeda: p.moeda,
      estoque: p.estoque,
      categoria: p.categoria,
    })),
  }
}

export interface RegistrarIntencaoArgs {
  produto_id?: unknown
  quantidade?: unknown
}

export function registrarIntencao(args: RegistrarIntencaoArgs, userId: string) {
  // Validate product_id
  if (!args.produto_id || typeof args.produto_id !== 'string') {
    throw new BadArgs('produto_id é obrigatório e deve ser uma string (ex: prod_001)')
  }

  // Validate quantidade
  if (!args.quantidade || typeof args.quantidade !== 'number' || args.quantidade <= 0) {
    throw new BadArgs('quantidade é obrigatória e deve ser um número maior que 0')
  }

  // Check if user exists
  const user = getUser(userId)
  if (!user) {
    throw new BadArgs(`Usuário ${userId} não encontrado`)
  }

  // Check if produto exists
  const produto = getProduto(args.produto_id)
  if (!produto) {
    throw new BadArgs(`Produto ${args.produto_id} não encontrado no catálogo`)
  }

  // Check estoque
  if (args.quantidade > produto.estoque) {
    throw new BadArgs(
      `Quantidade solicitada (${args.quantidade}) excede o estoque disponível (${produto.estoque}) do produto ${produto.nome}`
    )
  }

  // Generate intention ID
  intencaoCounter++
  const intencaoId = `int_${String(intencaoCounter).padStart(6, '0')}`

  // Calculate valorTotal
  const valorTotal = args.quantidade * produto.preco

  // Set expiration (15 minutes from now)
  const criadaEm = new Date()
  const expiraEm = new Date(criadaEm.getTime() + 15 * 60 * 1000)

  // Create and save intention
  const intencao: Intencao = {
    id: intencaoId,
    userId,
    produtoId: args.produto_id,
    quantidade: args.quantidade,
    valorTotal,
    status: 'pendente',
    criadaEm,
    expiraEm,
  }

  saveIntencao(intencao)

  return {
    intencao_id: intencao.id,
    produto_id: produto.id,
    produto_nome: produto.nome,
    quantidade: args.quantidade,
    preco_unitario: produto.preco,
    valor_total: valorTotal,
    moeda: produto.moeda,
    status: intencao.status,
    criada_em: criadaEm.toISOString(),
    expira_em: expiraEm.toISOString(),
    mensagem: `Intenção ${intencaoId} registrada. Válida por 15 minutos.`,
  }
}

// Counter for generating unique transaction IDs
let transacaoCounter = 0

export interface RealizarCompraArgs {
  intencao_id?: unknown
  metodo_pagamento?: unknown
}

export function realizarCompra(args: RealizarCompraArgs, userId: string) {
  // Validate intencao_id
  if (!args.intencao_id || typeof args.intencao_id !== 'string') {
    throw new BadArgs('INTENCAO_INVALIDA: intencao_id é obrigatório')
  }

  // Validate metodo_pagamento
  if (!args.metodo_pagamento || typeof args.metodo_pagamento !== 'string') {
    throw new BadArgs('METODO_INVALIDO: metodo_pagamento é obrigatório')
  }

  const metodo = (args.metodo_pagamento as string).toLowerCase().trim()
  if (metodo !== 'pix' && metodo !== 'cartao') {
    throw new BadArgs('METODO_INVALIDO: metodo_pagamento deve ser "pix" ou "cartao"')
  }

  // Get intention
  const intencao = getIntencao(args.intencao_id)
  if (!intencao) {
    throw new BadArgs('INTENCAO_INVALIDA: intenção não encontrada')
  }

  // Validate user exists BEFORE checking intention ownership
  const user = getUser(userId)
  if (!user) {
    throw new BadArgs(`USUARIO_INVALIDO: usuário ${userId} não encontrado`)
  }

  // Check if intention belongs to this user
  if (intencao.userId !== userId) {
    throw new BadArgs('INTENCAO_INVALIDA: esta intenção não pertence ao usuário')
  }

  // Check if already paid
  if (intencao.status === 'paga') {
    throw new BadArgs('INTENCAO_JA_PAGA: esta intenção já foi paga')
  }

  // Check if expired
  if (intencao.status === 'expirada' || new Date() > intencao.expiraEm) {
    intencao.status = 'expirada'
    throw new BadArgs('INTENCAO_EXPIRADA: esta intenção expirou')
  }

  // Validate limite
  const limiteRestante = getLimiteRestante(userId)
  if (intencao.valorTotal > limiteRestante) {
    throw new BadArgs(
      `LIMITE_EXCEDIDO: limite disponível R$ ${limiteRestante.toFixed(2)}, valor solicitado R$ ${intencao.valorTotal.toFixed(2)}`
    )
  }

  // Debit the limit (will return false if failed, but we already checked above)
  const debitSuccess = debitarLimite(userId, intencao.valorTotal)
  if (!debitSuccess) {
    throw new BadArgs('LIMITE_EXCEDIDO: não foi possível debitar o valor do limite')
  }

  // Now mark intention as paid (only after limit validation and debit)
  intencao.status = 'paga'

  // Create transaction
  transacaoCounter++
  const transacaoId = `trans_${String(transacaoCounter).padStart(6, '0')}`
  const agora = new Date()

  saveTransacao({
    id: transacaoId,
    userId,
    intencaoId: args.intencao_id,
    valor: intencao.valorTotal,
    metodo: metodo as 'pix' | 'cartao',
    data: agora,
  })

  // Get updated limite_restante after debit
  const limiteRestanteApos = getLimiteRestante(userId)

  return {
    status: 'sucesso',
    transacao_id: transacaoId,
    intencao_id: args.intencao_id,
    valor: intencao.valorTotal,
    metodo_pagamento: metodo,
    limite_restante: limiteRestanteApos,
    data: agora.toISOString(),
    mensagem: `Compra no valor de R$ ${intencao.valorTotal.toFixed(2)} realizada com sucesso via ${metodo}`,
  }
}

export class BadArgs extends Error { }
