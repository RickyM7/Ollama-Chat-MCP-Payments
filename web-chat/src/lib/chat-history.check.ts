import assert from 'node:assert/strict'
import { intentAppearsInHistory, isCatalogRequest } from './chat-history.ts'

const history = [
  { role: 'system', content: 'instruções' },
  { role: 'user', content: 'Quero comprar um mouse.' },
  { role: 'tool', content: JSON.stringify({ intencao_id: 'int_valida', status: 'pendente' }) },
]

assert.equal(intentAppearsInHistory(history, 'int_valida'), true)
assert.equal(intentAppearsInHistory(history, 'int_inventada'), false)
assert.equal(
  intentAppearsInHistory([{ role: 'tool', content: JSON.stringify({ intencao_id: 'int_paga', status: 'aprovado' }) }], 'int_paga'),
  false
)
assert.equal(intentAppearsInHistory([{ role: 'tool', content: 'resultado inválido' }], 'int_valida'), false)
assert.equal(isCatalogRequest('Quais produtos estão disponíveis?'), true)
assert.equal(isCatalogRequest('Quero comprar um mouse.'), true)
assert.equal(isCatalogRequest('Pode pagar no pix.'), false)

console.log('chat-history.check.ts: validação do histórico concluída com sucesso.')
