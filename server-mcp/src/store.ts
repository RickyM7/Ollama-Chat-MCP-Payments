// Types
export interface User {
    id: string
    username: string
    password: string // hardcoded for testing only
    limite: number
    gasto: number
}

export interface Produto {
    id: string // prod_*
    nome: string
    preco: number
    moeda: string
    estoque: number
    categoria: string
}

export interface Intencao {
    id: string // int_*
    userId: string
    produtoId: string
    quantidade: number
    valorTotal: number
    status: 'pendente' | 'paga' | 'expirada'
    criadaEm: Date
    expiraEm: Date
}

export interface Transacao {
    id: string // trans_*
    userId: string
    intencaoId: string
    valor: number
    metodo: 'pix' | 'cartao'
    data: Date
}

// In-memory store
const users = new Map<string, User>()
const produtos = new Map<string, Produto>()
const intencoes = new Map<string, Intencao>()
const transacoes = new Map<string, Transacao>()

// Same id as web-chat
const seedUsers: User[] = [
    { id: 'user_001', username: 'alice', password: 'senha123', limite: 50000, gasto: 0 },
    { id: 'user_002', username: 'bob', password: 'senha456', limite: 15000, gasto: 0 },
    { id: 'user_003', username: 'carol', password: 'senha789', limite: 5000, gasto: 0 },
]

// Seed produtos (converted from CATALOG, with prod_* ids)
const seedProdutos: Produto[] = [
    { id: 'prod_001', nome: 'PlayStation 5', preco: 4799.0, moeda: 'BRL', estoque: 10, categoria: 'Eletrônicos' },
    { id: 'prod_002', nome: 'PC Gamer', preco: 12499.0, moeda: 'BRL', estoque: 5, categoria: 'Computadores' },
    { id: 'prod_003', nome: 'Notebook de trabalho', preco: 6299.0, moeda: 'BRL', estoque: 8, categoria: 'Computadores' },
    { id: 'prod_004', nome: 'Monitor 27" 144Hz', preco: 1899.9, moeda: 'BRL', estoque: 20, categoria: 'Acessórios' },
    { id: 'prod_005', nome: 'Cadeira gamer', preco: 1299.0, moeda: 'BRL', estoque: 15, categoria: 'Móveis' },
    {
        id: 'prod_006',
        nome: 'Acelerador de partículas de bancada (seminovo, poucos prótons rodados)',
        preco: 4200000000.0,
        moeda: 'BRL',
        estoque: 1,
        categoria: 'Pesquisa',
    },
]

seedUsers.forEach((u) => users.set(u.id, u))
seedProdutos.forEach((p) => produtos.set(p.id, p))

export function getUser(userId: string): User | undefined {
    return users.get(userId)
}

export function getProduto(produtoId: string): Produto | undefined {
    return produtos.get(produtoId)
}

export function listProdutos(categoria?: string): Produto[] {
    const all = Array.from(produtos.values())
    return categoria ? all.filter((p) => p.categoria.toLowerCase() === categoria.toLowerCase()) : all
}

export function saveIntencao(intencao: Intencao): Intencao {
    intencoes.set(intencao.id, intencao)
    return intencao
}

export function getIntencao(intencaoId: string): Intencao | undefined {
    return intencoes.get(intencaoId)
}

export function saveTransacao(transacao: Transacao): Transacao {
    transacoes.set(transacao.id, transacao)
    return transacao
}

export function getTransacao(transacaoId: string): Transacao | undefined {
    return transacoes.get(transacaoId)
}

export function getTransacoesPorUsuario(userId: string): Transacao[] {
    return Array.from(transacoes.values()).filter((t) => t.userId === userId)
}

export function debitarLimite(userId: string, valor: number): boolean {
    const user = getUser(userId)
    if (!user) return false
    const restante = user.limite - user.gasto
    if (valor > restante) return false
    user.gasto += valor
    return true
}

export function getLimiteRestante(userId: string): number {
    const user = getUser(userId)
    return user ? user.limite - user.gasto : 0
}

export function resetStore(): void {
    users.clear()
    produtos.clear()
    intencoes.clear()
    transacoes.clear()
    seedUsers.forEach((u) => users.set(u.id, { ...u }))
    seedProdutos.forEach((p) => produtos.set(p.id, { ...p }))
}
