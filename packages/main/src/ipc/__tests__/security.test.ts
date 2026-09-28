import { describe, it, expect } from 'vitest'
import { isAuthorizedSender, assertAuthorizedSender } from '../security'

function frame(url: string): Electron.WebFrameMain {
  return { url } as unknown as Electron.WebFrameMain
}

describe('isAuthorizedSender', () => {
  it('rejects a null frame', () => {
    expect(isAuthorizedSender(null)).toBe(false)
  })

  it('accepts the packaged file:// renderer', () => {
    expect(isAuthorizedSender(frame('file:///Applications/Shiny.app/index.html'))).toBe(true)
  })

  it('accepts the Vite dev server origin', () => {
    expect(isAuthorizedSender(frame('http://localhost:5173'))).toBe(true)
    expect(isAuthorizedSender(frame('http://localhost:5173/'))).toBe(true)
    expect(isAuthorizedSender(frame('http://localhost:5173/#/settings'))).toBe(true)
  })

  it.each([
    'https://evil.example',
    'https://evil.example/file://',
    'http://localhost:5174',
    'http://localhost',
    'https://localhost:5173',
    'http://127.0.0.1:5173',
    '',
    'about:blank',
  ])('rejects foreign origin %s', (url) => {
    expect(isAuthorizedSender(frame(url))).toBe(false)
  })

  it.each([
    'http://localhost:5173.evil.com',
    'http://localhost:5173@evil.com',
    'http://localhost:51730',
    'not a url',
  ])('rejects lookalike or malformed origin %s', (url) => {
    expect(isAuthorizedSender(frame(url))).toBe(false)
  })
})

describe('assertAuthorizedSender', () => {
  it('does not throw for an authorized frame', () => {
    expect(() => assertAuthorizedSender(frame('file:///index.html'))).not.toThrow()
  })

  it('throws for a null frame', () => {
    expect(() => assertAuthorizedSender(null)).toThrow('Unauthorized IPC sender')
  })

  it('throws for a foreign origin', () => {
    expect(() => assertAuthorizedSender(frame('https://evil.example'))).toThrow(
      'Unauthorized IPC sender'
    )
  })
})
