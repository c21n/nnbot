/**
 * Chinese tokenizer using @node-rs/jieba
 * Uses search mode for finer-grained segmentation
 */

import { Jieba } from '@node-rs/jieba'

let jieba: Jieba | null = null

// Common Chinese stop words (single characters and particles)
const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就',
  '不', '人', '都', '一', '一个', '上', '也', '很',
  '到', '说', '要', '去', '你', '会', '着', '没有',
  '看', '好', '自己', '这', '他', '她', '它',
  '吗', '吧', '啊', '呢', '嗯', '哦', '呀',
])

function getJieba(): Jieba {
  if (!jieba) {
    jieba = new Jieba()
  }
  return jieba
}

/**
 * Cut text into tokens using jieba search mode.
 * Search mode produces finer-grained segments for better recall.
 *
 * Example: "小明喜欢用VS Code写代码"
 * → ["小明", "喜欢", "用", "VS", "Code", "写", "代码", "写代码"]
 */
export function tokenize(text: string): string[] {
  const words = getJieba().cut(text, true) // true = search mode
  return words
    .map(w => w.trim())
    .filter(w => w.length > 0 && !STOP_WORDS.has(w))
}

/**
 * Tokenize and join with spaces for FTS5 indexing.
 * FTS5 uses space as token separator.
 */
export function tokenizeForFTS5(text: string): string {
  return tokenize(text).join(' ')
}
