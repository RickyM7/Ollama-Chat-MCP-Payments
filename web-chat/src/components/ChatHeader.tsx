'use client'

import type { AuthResponse } from '@/types/index'

type Props = {
  user: AuthResponse
  onLogout: () => void
  onToggleInspect: () => void
  isInspecting: boolean
}

export function ChatHeader({ user, onLogout, onToggleInspect, isInspecting }: Props) {
  const formattedLimit = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(user.limite)

  return (
    <header className="flex items-center justify-between border-b pb-3 pt-1">
      <div>
        <h1 className="text-base font-bold text-gray-900 dark:text-gray-100">
          Chatbot de Pagamentos MCP
        </h1>
        <p className="text-xs text-gray-500">
          Usuário: <strong className="text-gray-800 dark:text-gray-200">{user.username}</strong>
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div className="rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          Limite: {formattedLimit}
        </div>
        <button
          type="button"
          onClick={onToggleInspect}
          className={`rounded border px-2.5 py-1 text-xs transition-colors ${
            isInspecting
              ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300 font-medium'
              : 'border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
          }`}
          title="Alternar painel de inspeção de histórico do modelo"
        >
          {isInspecting ? '✕ Fechar Inspeção' : '🔍 Inspecionar Histórico'}
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Sair
        </button>
      </div>
    </header>
  )
}
