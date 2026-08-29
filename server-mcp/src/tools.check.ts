import assert from 'node:assert/strict'
import { CATALOGO, listarCatalogo } from './tools.ts'

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

console.log('tools.check.ts: listar_catalogo validado com sucesso.')
