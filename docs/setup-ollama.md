# Setup do Ollama + Qwen3

Este guia mostra como preparar o ambiente para executar uma LLM localmente usando **Ollama** e **Qwen3**.

A configuração recomendada para a trilha é:

- **Ollama**
- **Qwen3 1.7B**
- **Node.js**
- Execução local, sem necessidade de AWS
- GPU dedicada não obrigatória

> Para padronizar o ambiente da turma, use sempre `qwen3:1.7b` nos exercícios.

---

## 1. Pré-requisitos

### Recomendado

- Windows 10/11, macOS 14+ ou Linux
- 8 GB de RAM no mínimo
- 16 GB de RAM recomendado
- Aproximadamente 5 GB livres em disco
- Node.js instalado
- Conexão com a internet para baixar o Ollama e o modelo

Não é obrigatório possuir GPU dedicada.

---

## 2. Instalar o Ollama

### Windows

Baixe e instale o Ollama:

https://ollama.com/download/windows

Depois da instalação, abra um novo PowerShell e execute:

```powershell
ollama --version
```

O comando deve retornar a versão instalada.

---

### macOS

Baixe o Ollama:

https://ollama.com/download/mac

Instale o aplicativo e depois execute no terminal:

```bash
ollama --version
```

---

### Linux

Execute:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Depois valide:

```bash
ollama --version
```

Caso seja necessário iniciar o servidor manualmente:

```bash
ollama serve
```

---

## 3. Baixar o Qwen3

Para os exercícios da trilha, vamos utilizar:

```text
qwen3:1.7b
```

Baixe o modelo:

```bash
ollama pull qwen3:1.7b
```

O download é de aproximadamente **1,4 GB**.

---

## 4. Verificar se o modelo foi instalado

Execute:

```bash
ollama ls
```

Deve aparecer algo semelhante a:

```text
NAME          ID              SIZE
qwen3:1.7b    xxxxxxxxxxxx    1.4 GB
```

---

## 5. Conversar com a LLM pelo terminal

Execute:

```bash
ollama run qwen3:1.7b
```

---

## 6. Testar a API HTTP do Ollama

O Ollama disponibiliza uma API local em:

```text
http://localhost:11434
```

Execute para testar:

```bash
curl http://localhost:11434/api/chat \
  -d '{
    "model": "qwen3:1.7b",
    "messages": [
      {
        "role": "user",
        "content": "Explique o que é uma API REST em uma frase."
      }
    ],
    "stream": false
  }'
```

