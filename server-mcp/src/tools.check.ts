import assert from 'node:assert/strict'
import {
  CATALOGO,
  listarCatalogo,
  obterLimiteDisponivel,
  realizarCompra,
  registrarIntencao,
  resetPaymentStateForTests,
  type PaymentContext,
} from './tools.ts'

resetPaymentStateForTests()

// Testa listagem completa sem filtros
const all = listarCatalogo()
assert.equal(all.produtos.length, CATALOGO.length)
assert.equal(typeof all.produtos[0].id, 'string')
assert.equal(typeof all.produtos[0].nome, 'string')
assert.equal(typeof all.produtos[0].preco, 'number')
assert.equal(all.produtos[0].moeda, 'BRL')
assert.equal(typeof all.produtos[0].estoque, 'number')

// Testa filtro por categoria existente
const audio = listarCatalogo({ categoria: 'audio' })
assert.equal(audio.produtos.length, 1)
assert.equal(audio.produtos[0].id, 'prod_003')
assert.equal(audio.produtos[0].nome, 'Fone Bluetooth')

// Testa filtro case-insensitive e com espaços
const perifericos = listarCatalogo({ categoria: '  PERIFERICOS ' })
assert.equal(perifericos.produtos.length, 2)

// Testa categoria inexistente
const vazia = listarCatalogo({ categoria: 'categoria_que_nao_existe' })
assert.equal(vazia.produtos.length, 0)

const alice: PaymentContext = { username: 'alice', sessionId: 'chat-alice', limiteInicial: 500 }
const invalidProduct = registrarIntencao(alice, { produto_id: 'prod_inexistente', quantidade: 1 })
assert.equal(invalidProduct.status, 'recusado')
assert.equal(invalidProduct.erro, 'PRODUTO_INVALIDO')
const invalidQuantity = registrarIntencao(alice, { produto_id: 'prod_003', quantidade: 0 })
assert.equal(invalidQuantity.status, 'recusado')
assert.equal(invalidQuantity.erro, 'QUANTIDADE_INVALIDA')
const estoqueAntesDaIntencao = CATALOGO.find((item) => item.id === 'prod_003')?.estoque
const intent = registrarIntencao(alice, { produto_id: 'prod_003', quantidade: 1 })
assert.equal(intent.status, 'pendente')
assert.ok(intent.intencao_id)
const intentId = intent.intencao_id
assert.match(intentId, /^int_[a-f0-9]+$/)
assert.equal(intent.valor_total, 249.9)
assert.equal(obterLimiteDisponivel(alice), 500)
assert.equal(CATALOGO.find((item) => item.id === 'prod_003')?.estoque, estoqueAntesDaIntencao)

const pix = realizarCompra(alice, { intencao_id: intentId, metodo_pagamento: 'pix' })
assert.equal(pix.status, 'aprovado')
if (pix.status === 'aprovado') assert.equal(pix.limite_restante, 250.1)
assert.equal(obterLimiteDisponivel(alice), 250.1)

const repeated = realizarCompra(alice, { intencao_id: intentId, metodo_pagamento: 'pix' })
assert.equal(repeated.status, 'recusado')
if (repeated.status === 'recusado') assert.equal(repeated.erro, 'INTENCAO_JA_PAGA')

const invented = realizarCompra(alice, { intencao_id: 'int_inventada', metodo_pagamento: 'pix' })
assert.equal(invented.status, 'recusado')
if (invented.status === 'recusado') assert.equal(invented.erro, 'INTENCAO_INVALIDA')

const owner: PaymentContext = { username: 'bob', sessionId: 'chat-bob-1', limiteInicial: 1500 }
const ownerIntent = registrarIntencao(owner, { produto_id: 'prod_006', quantidade: 1 })
assert.ok(ownerIntent.intencao_id)
const ownerIntentId = ownerIntent.intencao_id
const otherSession = realizarCompra(
  { ...owner, sessionId: 'chat-bob-2' },
  { intencao_id: ownerIntentId, metodo_pagamento: 'cartao' }
)
assert.equal(otherSession.status, 'recusado')
if (otherSession.status === 'recusado') assert.equal(otherSession.erro, 'INTENCAO_INVALIDA')

const otherUser = realizarCompra(
  { username: 'mallory', sessionId: owner.sessionId, limiteInicial: 10000 },
  { intencao_id: ownerIntentId, metodo_pagamento: 'cartao' }
)
assert.equal(otherUser.status, 'recusado')
if (otherUser.status === 'recusado') assert.equal(otherUser.erro, 'INTENCAO_INVALIDA')

const invalidMethod = realizarCompra(owner, { intencao_id: ownerIntentId, metodo_pagamento: 'dinheiro' })
assert.equal(invalidMethod.status, 'recusado')
if (invalidMethod.status === 'recusado') assert.equal(invalidMethod.erro, 'METODO_INVALIDO')

const card = realizarCompra(owner, { intencao_id: ownerIntentId, metodo_pagamento: 'cartao' })
assert.equal(card.status, 'aprovado')

const poor: PaymentContext = { username: 'poor', sessionId: 'chat-poor', limiteInicial: 100 }
const expensive = registrarIntencao(poor, { produto_id: 'prod_003', quantidade: 1 })
assert.ok(expensive.intencao_id)
const exceeded = realizarCompra(poor, { intencao_id: expensive.intencao_id, metodo_pagamento: 'pix' })
assert.equal(exceeded.status, 'recusado')
if (exceeded.status === 'recusado') assert.equal(exceeded.erro, 'LIMITE_EXCEDIDO')

const expiredAt = new Date('2026-01-01T00:00:00.000Z')
const expiredIntent = registrarIntencao(
  { username: 'expired', sessionId: 'chat-expired', limiteInicial: 1000 },
  { produto_id: 'prod_006', quantidade: 1 },
  expiredAt
)
assert.ok(expiredIntent.intencao_id)
const expired = realizarCompra(
  { username: 'expired', sessionId: 'chat-expired', limiteInicial: 1000 },
  { intencao_id: expiredIntent.intencao_id, metodo_pagamento: 'pix' },
  new Date(expiredAt.getTime() + 11 * 60 * 1000)
)
assert.equal(expired.status, 'recusado')
if (expired.status === 'recusado') assert.equal(expired.erro, 'INTENCAO_EXPIRADA')

console.log('tools.check.ts: catálogo, intenções e compras validados com sucesso.')
