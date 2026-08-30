'use client'

import { useState } from 'react'
import type { AuthResponse } from '@/types/index'

type Props = {
  onLoginSuccess: (auth: AuthResponse) => void
}

export function LoginForm({ onLoginSuccess }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleLogin(e: React.SubmitEvent) {
    e.preventDefault()
    if (!username.trim() || !password.trim() || busy) return

    setError(null)
    setBusy(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao autenticar.')
      }

      onLoginSuccess(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex h-screen max-w-md flex-col justify-center p-4">
      <div className="rounded border border-gray-300 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
          Login no Chat de Pagamentos
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Autentique-se para conversar com o assistente e realizar compras.
        </p>

        {error && (
          <div className="mt-3 rounded border border-red-300 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="mt-4 flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Usuário
            </label>
            <input
              type="text"
              required
              className="w-full rounded border px-3 py-2 text-sm bg-transparent border-gray-300 dark:border-gray-700 focus:outline-none focus:border-blue-600"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Digite seu usuário..."
              disabled={busy}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Senha
            </label>
            <input
              type="password"
              required
              className="w-full rounded border px-3 py-2 text-sm bg-transparent border-gray-300 dark:border-gray-700 focus:outline-none focus:border-blue-600"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite sua senha..."
              disabled={busy}
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
