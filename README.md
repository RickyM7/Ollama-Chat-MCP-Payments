# Ollama Chat MCP Payments

Chatbot inteligente integrado a um servidor MCP (Model Context Protocol) para consultas de catálogo e compras simuladas com segurança e validação no backend.

---

## Estrutura do Projeto

```text
Ollama-Chat-MCP-Payments/
├── .env.example                  # Modelo de variáveis de ambiente
├── .gitignore                    # Arquivos e pastas ignorados pelo Git
├── README.md                     # Documentação principal e instruções de execução
│
├── docs/                         # Documentação e especificações
│   ├── desafio.md                # Requisitos e contratos oficiais do desafio
│   ├── setup-ollama.md           # Guia de configuração e teste do Ollama
│   └── screenshots/              # Evidências e testes de execução
│
├── server-mcp/                   # Servidor MCP de Pagamentos (Porta 4000)
│   ├── package.json              # Scripts e dependências do servidor MCP
│   ├── tsconfig.json             # Configuração TypeScript do server
│   └── src/
│       ├── server.ts             # Servidor MCP HTTP exposto em /mcp
│       ├── tools.ts              # Implementação das 3 ferramentas e catálogo
│       └── tools.check.ts        # Testes e validações locais das tools
│
└── web-chat/                     # Aplicação Web Fullstack Next.js (Porta 3000)
    ├── package.json              # Scripts e dependências do web-chat
    ├── tsconfig.json             # Configuração TypeScript do Next.js
    ├── next.config.ts            # Configurações do Next.js
    ├── postcss.config.mjs        # Configuração do PostCSS / Tailwind
    ├── eslint.config.mjs         # Configuração de linter ESLint
    └── src/
        ├── components/           # Componentes visuais (LoginForm, ChatHeader, etc.)
        ├── lib/                  # Utilitários de backend e auth (JWT, scrypt)
        ├── types/                # Tipagens TypeScript centralizadas
        └── app/
            ├── layout.tsx        # Layout raiz da aplicação
            ├── globals.css       # Estilos globais e Tailwind v4
            ├── page.tsx          # Interface de usuário (Login e Chat)
            └── api/
                ├── auth/         # Rotas de autenticação (Login e consulta de saldo)
                └── chat/         # Rota do agente conectada ao MCP e LLM
```

---

## Como Executar Localmente

### Pré-requisitos
- [Node.js](https://nodejs.org) (v20+ recomendado) e [npm](https://www.npmjs.com/)
- [Ollama](https://ollama.com) instalado e rodando com o modelo configurado

### 1. Iniciar o Ollama
Em um terminal:
```bash
ollama serve
```
Certifique-se de que o modelo está baixado:
```bash
ollama pull qwen3:1.7b
```

### 2. Iniciar o Servidor MCP (`server-mcp`)
Em outro terminal:
```bash
cd server-mcp
npm install
npm run dev
```
Servidor MCP disponível em: `http://localhost:4000/mcp`

### 3. Iniciar a Aplicação Web (`web-chat`)
Em outro terminal:
```bash
cd web-chat
npm install
npm run dev
```
Interface disponível em: `http://localhost:3000`
