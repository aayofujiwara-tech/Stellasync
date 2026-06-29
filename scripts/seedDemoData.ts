/**
 * デモ用組織・店舗・キャスト・daily_metrics を本番 Firestore に作成する。
 * is_active=false でポーリング対象外（X API を叩かない）。
 *
 * 実行前準備:
 *   set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\adminsdk.json
 * 実行:
 *   npm run seed:demo
 * 削除:
 *   npm run teardown:demo
 */

import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

initializeApp({ projectId: 'stellasync-app' })

const db = getFirestore()

const ORG_ID = 'org_demo'
const STORE_A = 'store_demo_A'
const STORE_B = 'store_demo_B'

interface CastProfile {
  uid: string
  displayName: string
  storeId: string
  followers: number
  baseImp: number
  likeRate: number
  rtRate: number
}

const CASTS: CastProfile[] = [
  { uid: 'demo_cast_a1', displayName: 'デモ華A1', storeId: STORE_A, followers: 1200, baseImp: 800,  likeRate: 0.050, rtRate: 0.012 },
  { uid: 'demo_cast_a2', displayName: 'デモ凛A2', storeId: STORE_A, followers:  860, baseImp: 450,  likeRate: 0.040, rtRate: 0.008 },
  { uid: 'demo_cast_b1', displayName: 'デモ咲B1', storeId: STORE_B, followers: 2100, baseImp: 1200, likeRate: 0.060, rtRate: 0.018 },
  { uid: 'demo_cast_b2', displayName: 'デモ澪B2', storeId: STORE_B, followers:  540, baseImp: 380,  likeRate: 0.035, rtRate: 0.006 },
]

function rnd(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function jstMidnight(daysAgo: number): Date {
  const d = new Date()
  d.setUTCHours(d.getUTCHours() + 9)  // JST
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - daysAgo)
  d.setUTCHours(-9, 0, 0, 0)  // back to UTC
  return d
}

async function seed(): Promise<void> {
  let total = 0

  // 1. organizations/org_demo
  await db.collection('organizations').doc(ORG_ID).set({ name: 'デモ組織' }, { merge: true })
  console.log(`organizations/${ORG_ID} OK`)

  // 2. stores
  const storeBase = {
    org_id: ORG_ID,
    is_active: false,
    business_hours: { open: '20:00', close: '05:00', timezone: 'Asia/Tokyo' },
    polling_config: { high_freq_start_offset: -60, high_freq_end_offset: 120, high_freq_interval: 15, low_freq_interval: 60 },
  }
  await db.collection('stores').doc(STORE_A).set({ ...storeBase, name: 'DEMO STORE A' })
  await db.collection('stores').doc(STORE_B).set({ ...storeBase, name: 'DEMO STORE B' })
  console.log(`stores/${STORE_A}, stores/${STORE_B} OK`)

  // 3. accounts（ダミーキャスト4人、is_active=false）
  for (const c of CASTS) {
    await db.collection('accounts').doc(c.uid).set({
      display_name: c.displayName,
      x_user_id: '0',
      store_id: c.storeId,
      store_name: c.storeId === STORE_A ? 'DEMO STORE A' : 'DEMO STORE B',
      org_id: ORG_ID,
      is_active: false,
      token_status: 'none',
      followers_count: c.followers,
    })
    console.log(`accounts/${c.uid} OK`)
  }

  // 4. daily_metrics: 直近7日分
  const batch = db.batch()
  for (const c of CASTS) {
    for (let day = 0; day < 7; day++) {
      const date = jstMidnight(day)
      const imp       = rnd(Math.floor(c.baseImp * 0.7), Math.floor(c.baseImp * 1.3))
      const likes     = Math.floor(imp * c.likeRate * (0.7 + Math.random() * 0.6))
      const rts       = Math.floor(imp * c.rtRate  * (0.7 + Math.random() * 0.6))
      const posts     = rnd(6, 18)
      const origPosts = Math.floor(posts * 0.6)
      const repPosts  = posts - origPosts
      const origImp   = Math.floor(imp * 0.55)
      const repImp    = imp - origImp
      const withMedia = rnd(1, Math.floor(origPosts * 0.5))
      const woMedia   = origPosts - withMedia
      const avgImpW   = withMedia > 0 ? Math.floor(origImp * 0.6 / withMedia) : 0
      const avgImpWO  = woMedia   > 0 ? Math.floor(origImp * 0.4 / woMedia)   : 0

      const docId = `${c.uid}_${date.toISOString().slice(0, 10)}`
      batch.set(db.collection('daily_metrics').doc(docId), {
        cast_id:     c.uid,
        store_id:    c.storeId,
        org_id:      ORG_ID,
        date:        Timestamp.fromDate(date),
        impressions: imp,
        likes,
        retweets:    rts,
        followers:   c.followers + rnd(-5, 10),
        posts_count: posts,
        by_type: {
          original: { impressions: origImp, likes, retweets: rts, posts_count: origPosts },
          reply:    { impressions: repImp,  likes: 0, retweets: 0, posts_count: repPosts },
          quote:    { impressions: 0, likes: 0, retweets: 0, posts_count: 0 },
          guest:    { impressions: 0, likes: 0, retweets: 0, posts_count: 0 },
        },
        media_breakdown: {
          with_media:    { posts_count: withMedia, avg_imp: avgImpW,  avg_like: withMedia > 0 ? Math.floor(likes * 0.6 / withMedia) : 0 },
          without_media: { posts_count: woMedia,   avg_imp: avgImpWO, avg_like: woMedia   > 0 ? Math.floor(likes * 0.4 / woMedia)   : 0 },
        },
      })
      total++
    }
  }
  await batch.commit()
  console.log(`daily_metrics: ${total} 件作成`)

  // 5. roles/demo_manager_A（area_manager for store_demo_A）
  await db.collection('roles').doc('demo_manager_A').set({
    role: 'area_manager',
    managed_stores: [STORE_A],
  }, { merge: true })
  console.log('roles/demo_manager_A OK')

  console.log(`\nseed:demo 完了 — 店舗2、キャスト${CASTS.length}、daily_metrics ${total}件`)
  process.exit(0)
}

seed().catch((err) => {
  console.error('seed:demo failed:', err)
  process.exit(1)
})
