import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'fs'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { describe, it, beforeAll, beforeEach, afterAll, afterEach } from 'vitest'

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

// ─── roles & 横断アクセス ────────────────────────────────
describe('roles & 横断アクセス', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      // ロール種データ
      await setDoc(doc(db, 'roles/admin-1'),   { role: 'admin' })
      await setDoc(doc(db, 'roles/mgr-mor'),   { role: 'area_manager', managed_stores: ['MORRIGAN'] })
      // アカウント種データ
      await setDoc(doc(db, 'accounts/cast-mor'), { store_id: 'MORRIGAN', display_name: 'カシス' })
      await setDoc(doc(db, 'accounts/cast-vip'), { store_id: 'VIPER',    display_name: 'ILL' })
      // daily_metrics 種データ
      await setDoc(doc(db, 'daily_metrics/dm-mor'), { cast_id: 'cast-mor', store_id: 'MORRIGAN', impressions: 100 })
      await setDoc(doc(db, 'daily_metrics/dm-vip'), { cast_id: 'cast-vip', store_id: 'VIPER',    impressions: 100 })
      // post_velocity 種データ
      await setDoc(doc(db, 'post_velocity/pv-mor'), { cast_id: 'cast-mor', store_id: 'MORRIGAN', samples: {} })
      await setDoc(doc(db, 'post_velocity/pv-vip'), { cast_id: 'cast-vip', store_id: 'VIPER',    samples: {} })
      // account_tokens
      await setDoc(doc(db, 'account_tokens/cast-mor'), { access_token: 'encrypted' })
    })
  })

  // --- admin ---
  it('admin は他人の daily_metrics を読める', async () => {
    const db = env.authenticatedContext('admin-1').firestore()
    await assertSucceeds(getDoc(doc(db, 'daily_metrics/dm-mor')))
  })

  it('admin は他人の accounts を読める', async () => {
    const db = env.authenticatedContext('admin-1').firestore()
    await assertSucceeds(getDoc(doc(db, 'accounts/cast-mor')))
  })

  it('admin は他人の post_velocity を読める', async () => {
    const db = env.authenticatedContext('admin-1').firestore()
    await assertSucceeds(getDoc(doc(db, 'post_velocity/pv-mor')))
  })

  // --- area_manager ---
  it('area_manager は担当店舗の daily_metrics を読める', async () => {
    const db = env.authenticatedContext('mgr-mor').firestore()
    await assertSucceeds(getDoc(doc(db, 'daily_metrics/dm-mor')))
  })

  it('area_manager は担当店舗の accounts を読める', async () => {
    const db = env.authenticatedContext('mgr-mor').firestore()
    await assertSucceeds(getDoc(doc(db, 'accounts/cast-mor')))
  })

  it('area_manager は担当店舗の post_velocity を読める', async () => {
    const db = env.authenticatedContext('mgr-mor').firestore()
    await assertSucceeds(getDoc(doc(db, 'post_velocity/pv-mor')))
  })

  it('area_manager は担当外店舗の daily_metrics を読めない', async () => {
    const db = env.authenticatedContext('mgr-mor').firestore()
    await assertFails(getDoc(doc(db, 'daily_metrics/dm-vip')))
  })

  it('area_manager は担当外店舗の accounts を読めない', async () => {
    const db = env.authenticatedContext('mgr-mor').firestore()
    await assertFails(getDoc(doc(db, 'accounts/cast-vip')))
  })

  it('area_manager は担当外店舗の post_velocity を読めない', async () => {
    const db = env.authenticatedContext('mgr-mor').firestore()
    await assertFails(getDoc(doc(db, 'post_velocity/pv-vip')))
  })

  // --- cast（roles未登録）回帰テスト ---
  it('cast は自分の daily_metrics を読める（回帰）', async () => {
    const db = env.authenticatedContext('cast-mor').firestore()
    await assertSucceeds(getDoc(doc(db, 'daily_metrics/dm-mor')))
  })

  it('cast は他人の daily_metrics を読めない（回帰）', async () => {
    const db = env.authenticatedContext('cast-mor').firestore()
    await assertFails(getDoc(doc(db, 'daily_metrics/dm-vip')))
  })

  // --- account_tokens: admin でも読めない ---
  it('admin でも account_tokens は読めない', async () => {
    const db = env.authenticatedContext('admin-1').firestore()
    await assertFails(getDoc(doc(db, 'account_tokens/cast-mor')))
  })

  // --- roles ドキュメント自体の read ---
  it('自分の roles ドキュメントは読める', async () => {
    const db = env.authenticatedContext('admin-1').firestore()
    await assertSucceeds(getDoc(doc(db, 'roles/admin-1')))
  })

  it('他人の roles ドキュメントは読めない', async () => {
    const db = env.authenticatedContext('cast-mor').firestore()
    await assertFails(getDoc(doc(db, 'roles/admin-1')))
  })

  it('roles はクライアントから書き込めない', async () => {
    const db = env.authenticatedContext('admin-1').firestore()
    await assertFails(setDoc(doc(db, 'roles/admin-1'), { role: 'cast' }))
  })

  // --- post_velocity 詳細 ---
  it('post_velocity: 本人は読める', async () => {
    const db = env.authenticatedContext('cast-mor').firestore()
    await assertSucceeds(getDoc(doc(db, 'post_velocity/pv-mor')))
  })

  it('post_velocity: 担当manager は担当店舗を読める', async () => {
    const db = env.authenticatedContext('mgr-mor').firestore()
    await assertSucceeds(getDoc(doc(db, 'post_velocity/pv-mor')))
  })

  it('post_velocity: 担当manager は担当外店舗を読めない', async () => {
    const db = env.authenticatedContext('mgr-mor').firestore()
    await assertFails(getDoc(doc(db, 'post_velocity/pv-vip')))
  })

  it('post_velocity: 無関係castは読めない', async () => {
    const db = env.authenticatedContext('cast-mor').firestore()
    await assertFails(getDoc(doc(db, 'post_velocity/pv-vip')))
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
