export type Role = 'user'

export type User = {
  username: string
  passwordHash: string
  role: Role
  limite: number
}

export type AuthResponse = {
  token: string
  username: string
  role: Role
  limite: number
  expiresIn: string
}
