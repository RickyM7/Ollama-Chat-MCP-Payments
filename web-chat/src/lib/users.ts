export interface UserSeed {
    id: string
    username: string
    password: string
    limite: number
}

export const USERS_SEED: UserSeed[] = [
    { id: 'user_001', username: 'alice', password: 'senha123', limite: 50000 },
    { id: 'user_002', username: 'bob', password: 'senha456', limite: 15000 },
    { id: 'user_003', username: 'carol', password: 'senha789', limite: 5000 },
]

export function findUserByUsername(username: string): UserSeed | undefined {
    return USERS_SEED.find((u) => u.username === username)
}

export function findUserById(id: string): UserSeed | undefined {
    return USERS_SEED.find((u) => u.id === id)
}

export interface AuthPayload {
    id: string
    username: string
}
