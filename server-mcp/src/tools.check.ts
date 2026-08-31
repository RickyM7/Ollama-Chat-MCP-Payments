import assert from 'node:assert/strict'
import {
  CATALOGO,
  listarCatalogo,
  obterLimiteDisponivel,
  obterLogsAuditoria,
  realizarCompra,
  registrarIntencao,
  resetPaymentStateForTests,
  type PaymentContext,
} from './tools.ts'

resetPaymentStateForTests()

// 1. Testa listagem completa do catálogo
const all = listarCatalogo()
assert.equal(all.produtos.length, CATALOGO.length)
assert.equal(typeof all.produtos[0].id, 'string')
assert.equal(typeof all.produtos[0].nome, 'string')
assert.equal(typeof all.produtos[0].preco, 'number')
assert.equal(all.produtos[0].moeda, 'BRL')
assert.equal(typeof all.produtos[0].estoque, 'number')

// 2. Testa filtro por categoria existente
const audio = listarCatalogo({ categoria: 'audio' })
assert.equal(audio.produtos.length, 1)
assert.equal(audio.produtos[0].id, 'prod_003')
assert.equal(audio.produtos[0].nome, 'Fone Bluetooth')

// 3. Testa filtro case-insensitive e com espaços
const perifericos = listarCatalogo({ categoria: '  PERIFERICOS ' })
assert.equal(perifericos.produtos.length, 2)

// 4. Testa categoria inexistente
const vazia = listarCatalogo({ categoria: 'categoria_que_nao_existe' })
assert.equal(vazia.produtos.length, 0)

// 5. Testa registrar_intencao com erros de validação
const alice: PaymentContext = { username: 'alice', sessionId: 'chat-alice', limiteInicial: 500 }
const invalidProduct = registrarIntencao(alice, { produto_id: 'prod_inexistente', quantidade: 1 })
assert.equal(invalidProduct.status, 'recusado')
if (invalidProduct.status === 'recusado') assert.equal(invalidProduct.erro, 'PRODUTO_INVALIDO')

const invalidQuantity = registrarIntencao(alice, { produto_id: 'prod_003', quantidade: 0 })
assert.equal(invalidQuantity.status, 'recusado')
if (invalidQuantity.status === 'recusado') assert.equal(invalidQuantity.erro, 'QUANTIDADE_INVALIDA')

const exceedStock = registrarIntencao(alice, { produto_id: 'prod_003', quantidade: 9999 })
assert.equal(exceedStock.status, 'recusado')
if (exceedStock.status === 'recusado') assert.equal(exceedStock.erro, 'ESTOQUE_INSUFICIENTE')

// 6. Testa registrar_intencao com sucesso (sem movimentação de saldo ou estoque)
const estoqueAntes = CATALOGO.find((item) => item.id === 'prod_003')?.estoque
const intent = registrarIntencao(alice, { produto_id: 'prod_003', quantidade: 1 })
assert.equal(intent.status, 'pendente')
if (intent.status !== 'pendente') throw new Error('Esperada intenção pendente')

const intentId = intent.intencao_id
assert.match(intentId, /^int_[a-f0-9]+$/)
assert.equal(intent.valor_total, 249.9)
assert.equal(obterLimiteDisponivel(alice), 500)
assert.equal(CATALOGO.find((item) => item.id === 'prod_003')?.estoque, estoqueAntes)

// 7. Testa compra bem-sucedida via PIX com dedução de saldo e estoque
const pix = realizarCompra(alice, { intencao_id: intentId, metodo_pagamento: 'pix' })
assert.equal(pix.status, 'aprovado')
if (pix.status === 'aprovado') assert.equal(pix.limite_restante, 250.1)
assert.equal(obterLimiteDisponivel(alice), 250.1)

// 8. Testa tentativa de reutilizar intenção já paga (INTENCAO_JA_PAGA)
const repeated = realizarCompra(alice, { intencao_id: intentId, metodo_pagamento: 'pix' })
assert.equal(repeated.status, 'recusado')
if (repeated.status === 'recusado') assert.equal(repeated.erro, 'INTENCAO_JA_PAGA')

// 9. Testa intenção inventada pelo modelo (INTENCAO_INVALIDA)
const invented = realizarCompra(alice, { intencao_id: 'int_inventada', metodo_pagamento: 'pix' })
assert.equal(invented.status, 'recusado')
if (invented.status === 'recusado') assert.equal(invented.erro, 'INTENCAO_INVALIDA')

// 10. Testa compra em outra sessão do mesmo usuário (INTENCAO_INVALIDA)
const owner: PaymentContext = { username: 'bob', sessionId: 'chat-bob-1', limiteInicial: 1500 }
const ownerIntent = registrarIntencao(owner, { produto_id: 'prod_006', quantidade: 1 })
assert.equal(ownerIntent.status, 'pendente')
if (ownerIntent.status !== 'pendente') throw new Error('Esperada intenção pendente')

const ownerIntentId = ownerIntent.intencao_id
const otherSession = realizarCompra(
  { ...owner, sessionId: 'chat-bob-2' },
  { intencao_id: ownerIntentId, metodo_pagamento: 'cartao' }
)
assert.equal(otherSession.status, 'recusado')
if (otherSession.status === 'recusado') assert.equal(otherSession.erro, 'INTENCAO_INVALIDA')

// 11. Testa intenção de outro usuário (INTENCAO_INVALIDA)
const otherUser = realizarCompra(
  { username: 'mallory', sessionId: owner.sessionId, limiteInicial: 10000 },
  { intencao_id: ownerIntentId, metodo_pagamento: 'cartao' }
)
assert.equal(otherUser.status, 'recusado')
if (otherUser.status === 'recusado') assert.equal(otherUser.erro, 'INTENCAO_INVALIDA')

// 12. Testa método de pagamento inválido (METODO_INVALIDO)
const invalidMethod = realizarCompra(owner, { intencao_id: ownerIntentId, metodo_pagamento: 'dinheiro' })
assert.equal(invalidMethod.status, 'recusado')
if (invalidMethod.status === 'recusado') assert.equal(invalidMethod.erro, 'METODO_INVALIDO')

// 13. Testa compra bem-sucedida via Cartão de Crédito
const card = realizarCompra(owner, { intencao_id: ownerIntentId, metodo_pagamento: 'cartao' })
assert.equal(card.status, 'aprovado')

// 14. Testa tentativa com saldo insuficiente (LIMITE_EXCEDIDO)
const poor: PaymentContext = { username: 'poor', sessionId: 'chat-poor', limiteInicial: 100 }
const expensive = registrarIntencao(poor, { produto_id: 'prod_003', quantidade: 1 })
assert.equal(expensive.status, 'pendente')
if (expensive.status !== 'pendente') throw new Error('Esperada intenção pendente')

const exceeded = realizarCompra(poor, { intencao_id: expensive.intencao_id, metodo_pagamento: 'pix' })
assert.equal(exceeded.status, 'recusado')
if (exceeded.status === 'recusado') assert.equal(exceeded.erro, 'LIMITE_EXCEDIDO')

// 15. Testa intenção fora do prazo de validade (INTENCAO_EXPIRADA)
const expiredAt = new Date('2026-01-01T00:00:00.000Z')
const expiredIntent = registrarIntencao(
  { username: 'expired', sessionId: 'chat-expired', limiteInicial: 1000 },
  { produto_id: 'prod_006', quantidade: 1 },
  expiredAt
)
assert.equal(expiredIntent.status, 'pendente')
if (expiredIntent.status !== 'pendente') throw new Error('Esperada intenção pendente')

const expired = realizarCompra(
  { username: 'expired', sessionId: 'chat-expired', limiteInicial: 1000 },
  { intencao_id: expiredIntent.intencao_id, metodo_pagamento: 'pix' },
  new Date(expiredAt.getTime() + 11 * 60 * 1000)
)
assert.equal(expired.status, 'recusado')
if (expired.status === 'recusado') assert.equal(expired.erro, 'INTENCAO_EXPIRADA')

// 16. Testa se os logs de auditoria foram gerados corretamente
const logs = obterLogsAuditoria()
assert.ok(logs.length >= 10, 'Logs de auditoria devem ter sido registrados para cada operação')
assert.equal(typeof logs[0].timestamp, 'string')
assert.equal(typeof logs[0].usuario, 'string')
assert.equal(typeof logs[0].tool, 'string')

console.log('tools.check.ts: 100% dos cenários e regras de negócio validados com sucesso!')
