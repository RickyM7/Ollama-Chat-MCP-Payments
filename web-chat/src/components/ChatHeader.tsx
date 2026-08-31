'use client'

import type { AuthResponse } from '@/types/index'

type Props = {
  user: AuthResponse
  onLogout: () => void
}

export function ChatHeader({ user, onLogout }: Props) {
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

      <div className="flex items-center gap-3">
        <div className="rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          Limite: {formattedLimit}
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="rounded border px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Sair
        </button>
      </div>
    </header>
  )
}
