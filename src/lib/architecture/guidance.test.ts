import { describe, expect, it } from 'vitest'
import { getChallenge } from './challenges'
import { coachPrompt, nextHints, whyComponent } from './guidance'
import { design } from './testing'

const url = getChallenge('url-shortener')!
const video = getChallenge('video-platform')!

describe('progressive hints', () => {
  it('asks for an entry point first', () => {
    const h = nextHints(design('url-shortener').add('client', 'client').build(), url)
    expect(h.id).toBe('entry')
    expect(h.hints[0]).toContain('receive the user’s request first')
    expect(h.hints[2]).toContain('API Gateway')
  })

  it('then asks for storage, then for connections', () => {
    expect(nextHints(design('url-shortener').add('client', 'client').add('api', 'gateway').build(), url).id).toBe('storage')
    expect(
      nextHints(design('url-shortener').add('client', 'client').add('api', 'gateway').add('db', 'sql').build(), url).id,
    ).toBe('connect')
  })

  it('suggests a cache for a read-heavy design that reads the database', () => {
    const arch = design('url-shortener')
      .add('client', 'client')
      .add('api', 'gateway')
      .add('svc', 'service')
      .add('db', 'sql')
      .link('client', 'api', 'svc', 'db')
      .build()
    expect(nextHints(arch, url).id).toBe('reads')
  })

  it('suggests a CDN for global media', () => {
    const arch = design('video-platform')
      .add('client', 'client')
      .add('api', 'gateway')
      .add('svc', 'service')
      .add('c', 'cache')
      .add('db', 'sql')
      .link('client', 'api', 'svc', 'c')
      .link('svc', 'db')
      .build()
    expect(nextHints(arch, video).id).toBe('edge')
  })
})

describe('coach and why', () => {
  it('asks a question about a CDN instead of answering it', () => {
    expect(coachPrompt('cdn', url)?.question).toMatch(/\?$/)
  })

  it('explains a cache in terms of the challenge', () => {
    expect(whyComponent('cache', url)).toContain('read-heavy')
  })
})
