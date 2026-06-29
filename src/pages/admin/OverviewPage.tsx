import { useEffect, useState } from 'react'
import {
  collection, query, where, orderBy, limit,
  getDocs, type Timestamp,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../hooks/useAuth'
import { TrendingUp } from 'lucide-react'

interface AccountDoc {
  uid: string
  display_name: string
  store_id: string
  store_name?: string
  followers_count?: number
}

interface DailyMetricDoc {
  impressions?: number
  likes?: number
  retweets?: number
  posts_count?: number
  date: Timestamp
}

interface CastStats {
  totalImp: number
  totalLikes: number
  totalRt: number
  totalPosts: number
}

interface CastRow extends AccountDoc {
  stats: CastStats
}

interface StoreGroup {
  storeId: string
  storeName: string
  casts: CastRow[]
}

function pct(val: number, total: number): string {
  if (total === 0) return '—'
  return `${((val / total) * 100).toFixed(1)}%`
}

function fmtNum(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)
}

function storeLabel(storeId: string, storeName?: string): string {
  if (storeName) return storeName
  return storeId.replace(/^store_/, '').replace(/_/g, ' ').toUpperCase()
}

async function fetchStats(uid: string): Promise<CastStats> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'daily_metrics'),
        where('cast_id', '==', uid),
        orderBy('date', 'desc'),
        limit(7),
      ),
    )
    let totalImp = 0, totalLikes = 0, totalRt = 0, totalPosts = 0
    for (const d of snap.docs) {
      const data = d.data() as DailyMetricDoc
      totalImp   += data.impressions  ?? 0
      totalLikes += data.likes        ?? 0
      totalRt    += data.retweets     ?? 0
      totalPosts += data.posts_count  ?? 0
    }
    return { totalImp, totalLikes, totalRt, totalPosts }
  } catch (e) {
    console.error('[OverviewPage] daily_metrics getDoc FAILED (cast_id=' + uid + '):', e)
    return { totalImp: 0, totalLikes: 0, totalRt: 0, totalPosts: 0 }
  }
}

export default function OverviewPage() {
  const { role, managedStores } = useAuth()
  const [groups, setGroups] = useState<StoreGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        // アカウント取得（admin: 全件 / manager: 担当店舗のみ）
        let accountsSnap
        if (role === 'admin') {
          try {
            accountsSnap = await getDocs(collection(db, 'accounts'))
          } catch (e) {
            console.error('[OverviewPage] accounts 一覧取得 FAILED:', e)
            throw e
          }
        } else {
          if (managedStores.length === 0) {
            setGroups([])
            setLoading(false)
            return
          }
          try {
            accountsSnap = await getDocs(
              query(collection(db, 'accounts'), where('store_id', 'in', managedStores)),
            )
          } catch (e) {
            console.error('[OverviewPage] accounts 担当店舗絞り込み取得 FAILED:', e)
            throw e
          }
        }

        const accounts: AccountDoc[] = accountsSnap.docs
          .map((d) => {
            const data = d.data()
            return {
              uid:            d.id,
              display_name:   data.display_name as string,
              store_id:       (data.store_id as string) ?? '',
              store_name:     data.store_name as string | undefined,
              followers_count: data.followers_count as number | undefined,
            }
          })
          .filter((a) => a.display_name && a.store_id)

        // 各キャストの daily_metrics を並列取得
        const rows: CastRow[] = await Promise.all(
          accounts.map(async (a) => ({
            ...a,
            stats: await fetchStats(a.uid),
          })),
        )

        // 店舗ごとにグルーピング
        const map = new Map<string, StoreGroup>()
        for (const row of rows) {
          if (!map.has(row.store_id)) {
            map.set(row.store_id, {
              storeId:   row.store_id,
              storeName: storeLabel(row.store_id, row.store_name),
              casts:     [],
            })
          }
          map.get(row.store_id)!.casts.push(row)
        }

        // 各店舗のキャストを IMP 降順でソート
        const sorted = [...map.values()].sort((a, b) => a.storeId.localeCompare(b.storeId))
        for (const g of sorted) {
          g.casts.sort((a, b) => b.stats.totalImp - a.stats.totalImp)
        }

        if (!cancelled) {
          setGroups(sorted)
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'データ取得に失敗しました')
          setLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [role, managedStores])

  const totalStores = groups.length
  const totalCasts  = groups.reduce((s, g) => s + g.casts.length, 0)

  const headerLabel = role === 'admin'
    ? `管理者ビュー（全${totalStores}店舗 / ${totalCasts}キャスト）`
    : `マネージャービュー（${totalStores}店舗 / ${totalCasts}キャスト）`

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div
          className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: '#7C6FE0', borderTopColor: 'transparent' }}
        />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center text-sm" style={{ color: '#E06060' }}>
        {error}
      </div>
    )
  }

  return (
    <div className="px-4 py-5 max-w-4xl mx-auto">
      {/* ページヘッダ */}
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp size={18} style={{ color: '#7C6FE0' }} />
        <h2 className="text-base font-bold" style={{ color: '#E0E0EE' }}>
          {headerLabel}
        </h2>
      </div>

      {groups.length === 0 && (
        <p className="text-sm" style={{ color: '#A0A0B0' }}>表示できるデータがありません。</p>
      )}

      {groups.map((group) => {
        const groupImp = group.casts.reduce((s, c) => s + c.stats.totalImp, 0)
        return (
          <section key={group.storeId} className="mb-8">
            {/* 店舗ヘッダ */}
            <div
              className="flex items-center justify-between px-4 py-3 rounded-xl mb-3"
              style={{ backgroundColor: '#1A1A2E' }}
            >
              <div>
                <p className="text-xs font-semibold tracking-wide" style={{ color: '#7C6FE0' }}>
                  {group.storeName}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#A0A0B0' }}>
                  {group.casts.length} キャスト
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs" style={{ color: '#A0A0B0' }}>7日IMP合計</p>
                <p className="text-lg font-bold" style={{ color: '#E0E0EE' }}>
                  {fmtNum(groupImp)}
                </p>
              </div>
            </div>

            {/* キャスト一覧テーブル */}
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1A1A24' }}>
              {/* テーブルヘッダ */}
              <div
                className="grid grid-cols-[1fr_5rem_5rem_4rem_5rem_3rem] gap-2 px-4 py-2 text-xs border-b"
                style={{ color: '#A0A0B0', borderColor: '#2A2A34' }}
              >
                <span>キャスト</span>
                <span className="text-right">フォロワー</span>
                <span className="text-right">7日IMP</span>
                <span className="text-right">ER</span>
                <span className="text-right">投稿数</span>
                <span></span>
              </div>

              {group.casts.map((cast, idx) => {
                const er = pct(cast.stats.totalLikes + cast.stats.totalRt, cast.stats.totalImp)
                return (
                  <div
                    key={cast.uid}
                    className="grid grid-cols-[1fr_5rem_5rem_4rem_5rem_3rem] gap-2 px-4 py-3 items-center text-sm border-b last:border-0"
                    style={{ borderColor: '#2A2A34' }}
                  >
                    <div>
                      <p className="font-medium" style={{ color: '#E0E0EE' }}>
                        {cast.display_name}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: '#A0A0B0' }}>
                        #{idx + 1}
                      </p>
                    </div>
                    <p className="text-right tabular-nums" style={{ color: '#C0C0D0' }}>
                      {cast.followers_count != null ? fmtNum(cast.followers_count) : '—'}
                    </p>
                    <p className="text-right font-medium tabular-nums" style={{ color: '#E0E0EE' }}>
                      {fmtNum(cast.stats.totalImp)}
                    </p>
                    <p className="text-right tabular-nums" style={{ color: '#A08FE0' }}>
                      {er}
                    </p>
                    <p className="text-right tabular-nums" style={{ color: '#C0C0D0' }}>
                      {cast.stats.totalPosts}
                    </p>
                    <div className="flex justify-end">
                      <span
                        className="text-xs px-2 py-1 rounded cursor-not-allowed"
                        style={{ color: '#505060', backgroundColor: '#222230' }}
                        title="詳細ビューは次フェーズで実装予定"
                      >
                        詳細
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
