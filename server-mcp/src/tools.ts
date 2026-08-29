export type Product = {
  id: string
  nome: string
  preco: number
  moeda: string
  estoque: number
  categoria?: string
}

export const CATALOGO: Product[] = [
  { id: 'prod_001', nome: 'PlayStation 5', preco: 4799.0, moeda: 'BRL', estoque: 10, categoria: 'games' },
  { id: 'prod_002', nome: 'PC Gamer', preco: 12499.0, moeda: 'BRL', estoque: 5, categoria: 'informatica' },
  { id: 'prod_003', nome: 'Fone Bluetooth', preco: 249.9, moeda: 'BRL', estoque: 12, categoria: 'audio' },
  { id: 'prod_004', nome: 'Monitor Gamer 27" 144Hz', preco: 1899.9, moeda: 'BRL', estoque: 8, categoria: 'monitores' },
  { id: 'prod_005', nome: 'Cadeira Gamer Ergonômica', preco: 1299.0, moeda: 'BRL', estoque: 15, categoria: 'moveis' },
  { id: 'prod_006', nome: 'Mouse Sem Fio', preco: 149.5, moeda: 'BRL', estoque: 25, categoria: 'perifericos' },
  { id: 'prod_007', nome: 'Teclado Mecânico RGB', preco: 299.9, moeda: 'BRL', estoque: 18, categoria: 'perifericos' },
]

export function listarCatalogo(args?: { categoria?: string }) {
  const cat = typeof args?.categoria === 'string' ? args.categoria.trim().toLowerCase() : ''
  const produtos = cat
    ? CATALOGO.filter((p) => p.categoria?.toLowerCase() === cat)
    : CATALOGO

  return {
    produtos: produtos.map(({ id, nome, preco, moeda, estoque }) => ({
      id,
      nome,
      preco,
      moeda,
      estoque,
    })),
  }
}
