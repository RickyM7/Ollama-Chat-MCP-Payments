export type HistoryMessage = { role: string; content: string }

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
