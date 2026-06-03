import { ChromaClient, Collection } from 'chromadb'
import { config } from '../../config'

let client: ChromaClient | null = null
let collection: Collection | null = null

export async function getChromaCollection(): Promise<Collection> {
  if (collection) return collection

  client = new ChromaClient({
    path: config.chromadb.url
  })

  collection = await client.getOrCreateCollection({
    name: 'memories',
    metadata: {
      'hnsw:space': 'cosine'
    }
  })

  return collection
}

export async function closeChroma(): Promise<void> {
  client = null
  collection = null
}
