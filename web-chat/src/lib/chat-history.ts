export type HistoryMessage = { role: string; content: string }

export function isCatalogRequest(message: string) {
  const normalized = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return /(catalog|produto|item|vende|venda|dispon|estoque|preco|quanto custa|comprar|quero)/.test(normalized)
}

export function intentAppearsInHistory(messages: HistoryMessage[], intentId: string) {
  return messages.some((message) => {
    if (message.role !== 'tool') return false
    try {
      const result = JSON.parse(message.content) as { intencao_id?: unknown; status?: unknown }
      return result.intencao_id === intentId && result.status === 'pendente'
    } catch {
      return false
    }
  })
}
