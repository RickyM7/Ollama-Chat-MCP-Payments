import assert from 'node:assert/strict'
import { BadArgs, CATALOG, listarCatalogo, registrarIntencao, realizarCompra } from './tools.ts'
import { getUser, getProduto, listProdutos, resetStore, getIntencao, getTransacao } from './store.ts'

// Store tests
resetStore()

// Test users
assert.equal(getUser('user_001')?.username, 'alice')
assert.equal(getUser('user_002')?.username, 'bob')
assert.equal(getUser('user_003')?.username, 'carol')
assert.equal(getUser('user_999'), undefined)

// Test produtos
const prod1 = getProduto('prod_001')
assert.ok(prod1)
assert.equal(prod1.nome, 'PlayStation 5')
assert.equal(prod1.preco, 4799.0)
assert.equal(prod1.moeda, 'BRL')
assert.equal(prod1.estoque, 10)
assert.equal(prod1.categoria, 'Eletrônicos')

// Test CATALOG ids start with prod_
const allProds = listProdutos()
assert.equal(allProds.length, 6)
allProds.forEach((p) => {
    assert.match(p.id, /^prod_\d+/)
    assert.ok(p.nome.length > 0)
    assert.ok(p.preco > 0)
    assert.equal(p.moeda, 'BRL')
    assert.ok(p.estoque > 0)
    assert.ok(p.categoria.length > 0)
})

// Test filtragem por categoria
const eletronicos = listProdutos('Eletrônicos')
assert.equal(eletronicos.length, 1)
assert.equal(eletronicos[0].nome, 'PlayStation 5')

const computadores = listProdutos('Computadores')
assert.equal(computadores.length, 2)

// Test produto inexistente
assert.equal(getProduto('prod_999'), undefined)

// Test listarCatalogo
const catalogoCompleto = listarCatalogo({})
assert.equal(catalogoCompleto.total, 6)
assert.equal(catalogoCompleto.produtos.length, 6)
assert.ok(catalogoCompleto.produtos[0].id.startsWith('prod_'))

// Test listarCatalogo com categoria válida
const catalogoEletronicos = listarCatalogo({ categoria: 'Eletrônicos' })
assert.equal(catalogoEletronicos.total, 1)
assert.equal(catalogoEletronicos.categoria, 'Eletrônicos')
assert.equal(catalogoEletronicos.produtos[0].nome, 'PlayStation 5')

// Test listarCatalogo com categoria case-insensitive
const catalogoComputadores = listarCatalogo({ categoria: 'COMPUTADORES' })
assert.equal(catalogoComputadores.total, 2)

// Test listarCatalogo com categoria inválida
const catalogoVazio = listarCatalogo({ categoria: 'CategoriaInexistente' })
assert.equal(catalogoVazio.total, 0)
assert.equal(catalogoVazio.produtos.length, 0)

// Test registrarIntencao com produto válido
resetStore()
const intencao1 = registrarIntencao({ produto_id: 'prod_001', quantidade: 2 }, 'user_001')
assert.ok(intencao1.intencao_id.startsWith('int_'))
assert.equal(intencao1.produto_id, 'prod_001')
assert.equal(intencao1.produto_nome, 'PlayStation 5')
assert.equal(intencao1.quantidade, 2)
assert.equal(intencao1.preco_unitario, 4799.0)
assert.equal(intencao1.valor_total, 9598.0)
assert.equal(intencao1.moeda, 'BRL')
assert.equal(intencao1.status, 'pendente')

// Verify intention was saved
const savedIntencao = getIntencao(intencao1.intencao_id)
assert.ok(savedIntencao)
assert.equal(savedIntencao.status, 'pendente')
assert.equal(savedIntencao.quantidade, 2)
assert.equal(savedIntencao.userId, 'user_001')

// Test registrarIntencao com produto inválido
assert.throws(
    () => registrarIntencao({ produto_id: 'prod_999', quantidade: 1 }, 'user_001'),
    /Produto prod_999 não encontrado/
)

// Test registrarIntencao com quantidade inválida
assert.throws(
    () => registrarIntencao({ produto_id: 'prod_001', quantidade: 0 }, 'user_001'),
    /quantidade é obrigatória/
)

assert.throws(
    () => registrarIntencao({ produto_id: 'prod_001', quantidade: -5 }, 'user_001'),
    /quantidade é obrigatória/
)

assert.throws(
    () => registrarIntencao({ produto_id: 'prod_001' }, 'user_001'),
    /quantidade é obrigatória/
)

// Test registrarIntencao sem produto_id
assert.throws(
    () => registrarIntencao({}, 'user_001'),
    /produto_id é obrigatório/
)

// Test registrarIntencao com quantidade que excede estoque
assert.throws(
    () => registrarIntencao({ produto_id: 'prod_001', quantidade: 100 }, 'user_001'),
    /Quantidade solicitada.*excede o estoque/
)

// Test registrarIntencao com estoque exato
const intencao2 = registrarIntencao({ produto_id: 'prod_006', quantidade: 1 }, 'user_001')
assert.equal(intencao2.quantidade, 1)
assert.equal(intencao2.valor_total, 4200000000.0)

// Test registrarIntencao com usuário inválido
assert.throws(
    () => registrarIntencao({ produto_id: 'prod_001', quantidade: 1 }, 'user_999'),
    /Usuário user_999 não encontrado/
)

// Test realizarCompra
resetStore()

// Create an intention first
const intencao3 = registrarIntencao({ produto_id: 'prod_001', quantidade: 1 }, 'user_001')
const intencaoId = intencao3.intencao_id

// Test realizarCompra com PIX - sucesso
const compra1 = realizarCompra({ intencao_id: intencaoId, metodo_pagamento: 'pix' }, 'user_001')
assert.equal(compra1.status, 'sucesso')
assert.ok(compra1.transacao_id.startsWith('trans_'))
assert.equal(compra1.intencao_id, intencaoId)
assert.equal(compra1.valor, 4799.0)
assert.equal(compra1.metodo_pagamento, 'pix')

// Verify transaction was saved
const savedTransacao = getTransacao(compra1.transacao_id)
assert.ok(savedTransacao)
assert.equal(savedTransacao.userId, 'user_001')
assert.equal(savedTransacao.intencaoId, intencaoId)
assert.equal(savedTransacao.valor, 4799.0)
assert.equal(savedTransacao.metodo, 'pix')

// Test realizarCompra com intenção já paga
const intencao4 = registrarIntencao({ produto_id: 'prod_002', quantidade: 1 }, 'user_002')
realizarCompra({ intencao_id: intencao4.intencao_id, metodo_pagamento: 'cartao' }, 'user_002')

// Try to pay again
assert.throws(
    () => realizarCompra({ intencao_id: intencao4.intencao_id, metodo_pagamento: 'pix' }, 'user_002'),
    /INTENCAO_JA_PAGA/
)

// Test realizarCompra com intenção inválida
assert.throws(
    () => realizarCompra({ intencao_id: 'int_999999', metodo_pagamento: 'pix' }, 'user_001'),
    /INTENCAO_INVALIDA/
)

// Test realizarCompra com método inválido
const intencao5 = registrarIntencao({ produto_id: 'prod_003', quantidade: 1 }, 'user_003')
assert.throws(
    () => realizarCompra({ intencao_id: intencao5.intencao_id, metodo_pagamento: 'boleto' }, 'user_003'),
    /METODO_INVALIDO/
)

// Test realizarCompra com cartão
const intencao6 = registrarIntencao({ produto_id: 'prod_004', quantidade: 2 }, 'user_001')
const compra2 = realizarCompra({ intencao_id: intencao6.intencao_id, metodo_pagamento: 'cartao' }, 'user_001')
assert.equal(compra2.metodo_pagamento, 'cartao')
assert.equal(compra2.valor, 3799.8) // 1899.9 * 2

// Test realizarCompra com missing intencao_id
assert.throws(
    () => realizarCompra({ metodo_pagamento: 'pix' }, 'user_001'),
    /INTENCAO_INVALIDA/
)

// Test realizarCompra com missing metodo_pagamento
const intencao7 = registrarIntencao({ produto_id: 'prod_005', quantidade: 1 }, 'user_001')
assert.throws(
    () => realizarCompra({ intencao_id: intencao7.intencao_id }, 'user_001'),
    /METODO_INVALIDO/
)

// Test limite excedido
resetStore()

// Carol tem limite de 5000, PS5 custa 4799
const carol = getUser('user_003')
assert.ok(carol)
assert.equal(carol.limite, 5000)

const intencaoCarol1 = registrarIntencao({ produto_id: 'prod_001', quantidade: 1 }, 'user_003')
assert.equal(intencaoCarol1.valor_total, 4799.0)

// First purchase should succeed
const compraCarol1 = realizarCompra({ intencao_id: intencaoCarol1.intencao_id, metodo_pagamento: 'pix' }, 'user_003')
assert.equal(compraCarol1.status, 'sucesso')
assert.equal(compraCarol1.limite_restante, 5000 - 4799) // 201

// Verify gasto was updated
const carolApos = getUser('user_003')
assert.equal(carolApos?.gasto, 4799.0)

// Try to buy another PS5 (would cost 4799 but only 201 left)
const intencaoCarol2 = registrarIntencao({ produto_id: 'prod_001', quantidade: 1 }, 'user_003')
assert.throws(
    () => realizarCompra({ intencao_id: intencaoCarol2.intencao_id, metodo_pagamento: 'pix' }, 'user_003'),
    /LIMITE_EXCEDIDO/
)

// Try Alice (limite 50000) buying PC Gamer (12499) twice
resetStore()
const alice = getUser('user_001')
assert.equal(alice?.limite, 50000)

const intencaoAlice1 = registrarIntencao({ produto_id: 'prod_002', quantidade: 1 }, 'user_001')
const compraAlice1 = realizarCompra({ intencao_id: intencaoAlice1.intencao_id, metodo_pagamento: 'cartao' }, 'user_001')
assert.equal(compraAlice1.status, 'sucesso')
assert.equal(compraAlice1.limite_restante, 50000 - 12499)

const intencaoAlice2 = registrarIntencao({ produto_id: 'prod_002', quantidade: 1 }, 'user_001')
const compraAlice2 = realizarCompra({ intencao_id: intencaoAlice2.intencao_id, metodo_pagamento: 'pix' }, 'user_001')
assert.equal(compraAlice2.status, 'sucesso')
assert.equal(compraAlice2.limite_restante, 50000 - 12499 - 12499)

// Try to buy LHC (4.2 billion) - everyone should fail
resetStore()
const intencaoLHC = registrarIntencao({ produto_id: 'prod_006', quantidade: 1 }, 'user_001')
assert.equal(intencaoLHC.valor_total, 4200000000.0)

assert.throws(
    () => realizarCompra({ intencao_id: intencaoLHC.intencao_id, metodo_pagamento: 'pix' }, 'user_001'),
    /LIMITE_EXCEDIDO/
)

// Test invalid user
resetStore()
const intencaoAlice3 = registrarIntencao({ produto_id: 'prod_001', quantidade: 1 }, 'user_001')
assert.throws(
    () => realizarCompra({ intencao_id: intencaoAlice3.intencao_id, metodo_pagamento: 'pix' }, 'user_999'),
    /USUARIO_INVALIDO/
)

// Test user trying to pay another user's intention
resetStore()
const intencaoBob = registrarIntencao({ produto_id: 'prod_001', quantidade: 1 }, 'user_002')
assert.throws(
    () => realizarCompra({ intencao_id: intencaoBob.intencao_id, metodo_pagamento: 'pix' }, 'user_001'),
    /INTENCAO_INVALIDA.*não pertence/
)

console.log('tools.ts ok')
console.log('store.ts ok')
console.log('listar_catalogo ok')
console.log('registrar_intencao ok')
console.log('realizar_compra ok')
console.log('validacao_limite ok')
console.log('usuario_binding ok')

