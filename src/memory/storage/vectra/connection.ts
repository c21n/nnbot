import { LocalIndex } from 'vectra'
import path from 'path'

let index: LocalIndex | null = null

const DEFAULT_DATA_PATH = './data/vectra-memories'

export async function getVectraIndex(): Promise<LocalIndex> {
  if (index) return index

  const dataPath = process.env.VECTRA_DATA_PATH || DEFAULT_DATA_PATH
  index = new LocalIndex(path.resolve(dataPath))

  if (!(await index.isIndexCreated())) {
    await index.createIndex()
  }

  return index
}

export async function closeVectra(): Promise<void> {
  index = null
}
