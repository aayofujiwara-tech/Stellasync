import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from './crypto'

const VALID_KEY = 'a'.repeat(64)

describe('crypto', () => {
  it('encrypt → decrypt で元の文字列に戻ること', () => {
    const plaintext = 'hello stellasync'
    const encoded = encrypt(plaintext, VALID_KEY)
    expect(decrypt(encoded, VALID_KEY)).toBe(plaintext)
  })

  it('同じ平文でも毎回異なる暗号文が生成されること', () => {
    const plaintext = 'hello stellasync'
    const encoded1 = encrypt(plaintext, VALID_KEY)
    const encoded2 = encrypt(plaintext, VALID_KEY)
    expect(encoded1).not.toBe(encoded2)
  })

  it('不正なキーで復号するとエラーになること', () => {
    const plaintext = 'secret token'
    const encoded = encrypt(plaintext, VALID_KEY)
    const wrongKey = 'b'.repeat(64)
    expect(() => decrypt(encoded, wrongKey)).toThrow('Decryption failed')
  })

  it('空文字列の暗号化・復号が正しく動くこと', () => {
    const encoded = encrypt('', VALID_KEY)
    expect(decrypt(encoded, VALID_KEY)).toBe('')
  })
})
