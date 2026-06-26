import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'fs'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { describe, it, beforeAll, afterAll, afterEach } from 'vitest'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

afterAll(async () => {
  await env.cleanup()
})

afterEach(async () => {
  await env.clearFirestore()
})

// ─── accounts ─────────────────────────────────────────────
describe('accounts', () => {
  it('自分のドキュメントは読める', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'accounts/user-a'), { display_name: 'A' })
    })
    const db = env.authenticatedContext('user-a').firestore()
    await assertSucceeds(getDoc(doc(db, 'accounts/user-a')))
  })

  it('他人のドキュメントは読めない', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'accounts/user-a'), { display_name: 'A' })
    })
    const db = env.authenticatedContext('user-b').firestore()
    await assertFails(getDoc(doc(db, 'accounts/user-a')))
  })

  it('未認証では読めない', async () => {
    const db = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'accounts/user-a')))
  })

  it('クライアントからは書き込めない', async () => {
    const db = env.authenticatedContext('user-a').firestore()
    await assertFails(setDoc(doc(db, 'accounts/user-a'), { display_name: 'hacked' }))
  })
})

// ─── stores（H-1: 全クライアント拒否）────────────────────────
describe('stores（H-1 fix）', () => {
  it('認証済みユーザーでも読めない', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'stores/store-1'), { name: 'Store A' })
    })
    const db = env.authenticatedContext('user-a').firestore()
    await assertFails(getDoc(doc(db, 'stores/store-1')))
  })

  it('未認証でも読めない', async () => {
    const db = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'stores/store-1')))
  })
})

// ─── daily_metrics ────────────────────────────────────────
describe('daily_metrics', () => {
  it('自分の cast_id のデータは読める', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'daily_metrics/user-a_2024-01-01'), {
        cast_id: 'user-a', impressions: 100,
      })
    })
    const db = env.authenticatedContext('user-a').firestore()
    await assertSucceeds(getDoc(doc(db, 'daily_metrics/user-a_2024-01-01')))
  })

  it('他人の cast_id のデータは読めない', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'daily_metrics/user-a_2024-01-01'), {
        cast_id: 'user-a', impressions: 100,
      })
    })
    const db = env.authenticatedContext('user-b').firestore()
    await assertFails(getDoc(doc(db, 'daily_metrics/user-a_2024-01-01')))
  })

  it('未認証では読めない', async () => {
    const db = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'daily_metrics/user-a_2024-01-01')))
  })

  it('クライアントからは書き込めない', async () => {
    const db = env.authenticatedContext('user-a').firestore()
    await assertFails(setDoc(doc(db, 'daily_metrics/user-a_2024-01-01'), { cast_id: 'user-a' }))
  })
})

// ─── post_hourly_metrics ──────────────────────────────────
describe('post_hourly_metrics', () => {
  it('自分の cast_id のデータは読める', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'post_hourly_metrics/tweet1_0'), {
        cast_id: 'user-a', imp_cumulative: 50,
      })
    })
    const db = env.authenticatedContext('user-a').firestore()
    await assertSucceeds(getDoc(doc(db, 'post_hourly_metrics/tweet1_0')))
  })

  it('他人の cast_id のデータは読めない', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'post_hourly_metrics/tweet1_0'), {
        cast_id: 'user-a', imp_cumulative: 50,
      })
    })
    const db = env.authenticatedContext('user-b').firestore()
    await assertFails(getDoc(doc(db, 'post_hourly_metrics/tweet1_0')))
  })

  it('クライアントからは書き込めない', async () => {
    const db = env.authenticatedContext('user-a').firestore()
    await assertFails(setDoc(doc(db, 'post_hourly_metrics/tweet1_0'), { cast_id: 'user-a' }))
  })
})

// ─── oauth_sessions ───────────────────────────────────────
describe('oauth_sessions', () => {
  it('認証済みユーザーでも読めない', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'oauth_sessions/some-state'), {
        uid: 'user-a', code_verifier: 'abc',
      })
    })
    const db = env.authenticatedContext('user-a').firestore()
    await assertFails(getDoc(doc(db, 'oauth_sessions/some-state')))
  })

  it('認証済みユーザーでも書き込めない', async () => {
    const db = env.authenticatedContext('user-a').firestore()
    await assertFails(setDoc(doc(db, 'oauth_sessions/some-state'), { uid: 'user-a' }))
  })

  it('未認証では読めない', async () => {
    const db = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'oauth_sessions/some-state')))
  })
})

// ─── organizations/members（H-3 fix）─────────────────────
describe('organizations/members（H-3 fix）', () => {
  it('自分のメンバーシップは読める', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'organizations/org-1/members/user-a'),
        { role: 'manager' },
      )
    })
    const db = env.authenticatedContext('user-a').firestore()
    await assertSucceeds(getDoc(doc(db, 'organizations/org-1/members/user-a')))
  })

  it('他人のメンバーシップは読めない', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'organizations/org-1/members/user-a'),
        { role: 'manager' },
      )
    })
    const db = env.authenticatedContext('user-b').firestore()
    await assertFails(getDoc(doc(db, 'organizations/org-1/members/user-a')))
  })

  it('未認証では読めない', async () => {
    const db = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'organizations/org-1/members/user-a')))
  })

  it('クライアントからは書き込めない', async () => {
    const db = env.authenticatedContext('user-a').firestore()
    await assertFails(setDoc(
      doc(db, 'organizations/org-1/members/user-a'),
      { role: 'hacked' },
    ))
  })
})
