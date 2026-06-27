import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { db, functions } from '../../lib/firebase'
import {
  doc, getDoc,
  collection, query, where, orderBy, limit, getDocs,
  type Timestamp,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { TrendingUp, TrendingDown } from 'lucide-react'

type Scope = 'all' | 'original'

type ManualFetchResult =
  | { ok: true }
  | { ok: false; reason: 'cooldown'; retryAfterSec: number }

interface AccountData {
  display_name: string
  best_times: Array<{ hour: number; avg_imp: number; sample_count: number }>
}

interface DailyMetric {
  date: Timestamp
  impressions: number
  followers: number
  posts_count: number
  by_type?: { original?: { impressions?: number; posts_count?: number } }
}

function SkeletonCard() {
  return (
    <div className="rounded-xl p-4 animate-pulse" style={{ backgroundColor: '#1A1A24' }}>
      <div className="h-3 w-20 rounded mb-3" style={{ backgroundColor: '#2A2A34' }} />
      <div className="h-8 w-28 rounded mb-2" style={{ backgroundColor: '#2A2A34' }} />
      <div className="h-3 w-16 rounded" style={{ backgroundColor: '#2A2A34' }} />
    </div>
  )
}

const SCOPE_KEY = 'stellasync_metric_scope'

export default function HomePage() {
  const { user } = useAuth()
  const [account, setAccount]           = useState<AccountData | null>(null)
  const [metrics, setMetrics]           = useState<DailyMetric[]>([])
  const [loading, setLoading]           = useState(true)
  const [fetchLoading, setFetchLoading] = useState(false)
  const [cd, setCd]                     = useState(0)
  const [fetchError, setFetchError]     = useState<string | null>(null)
  const [fetchOk, setFetchOk]           = useState(false)
  const [scope, setScope]               = useState<Scope>(
    (localStorage.getItem(SCOPE_KEY) as Scope) || 'all'
  )

  const setScopePersist = (s: Scope) => {
    setScope(s)
    localStorage.setItem(SCOPE_KEY, s)
  }

  const loadData = useCallback(async () => {
    if (!user) return
    try {
      const [accountSnap, metricsSnap] = await Promise.all([
        getDoc(doc(db, 'accounts', user.uid)),
        getDocs(
          query(
            collection(db, 'daily_metrics'),
            where('cast_id', '==', user.uid),
            orderBy('date', 'desc'),
            limit(14),
          ),
        ),
      ])

      if (accountSnap.exists()) {
        setAccount(accountSnap.data() as AccountData)
      }
      setMetrics(metricsSnap.docs.map((d) => d.data() as DailyMetric))
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (cd <= 0) return
    const timer = setTimeout(() => setCd((prev) => prev - 1), 1000)
    return () => clearTimeout(timer)
  }, [cd])

  const onManualFetch = async () => {
    setFetchLoading(true)
    setFetchError(null)
    setFetchOk(false)
    try {
      const callable = httpsCallable<Record<string, never>, ManualFetchResult>(
        functions,
        'manualFetch',
      )
      const res = await callable()
      if (res.data.ok) {
        setFetchOk(true)
        await loadData()
      } else if (res.data.reason === 'cooldown') {
        setCd(res.data.retryAfterSec)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '更新に失敗しました'
      setFetchError(msg.includes('再連携') ? msg : '更新に失敗しました。もう一度お試しください')
    } finally {
      setFetchLoading(false)
    }
  }

  const thisWeek = metrics.slice(0, 7)
  const lastWeek  = metrics.slice(7, 14)

  const impOf   = (m: DailyMetric) =>
    scope === 'original' ? (m.by_type?.original?.impressions ?? 0) : (m.impressions ?? 0)
  const postsOf = (m: DailyMetric) =>
    scope === 'original' ? (m.by_type?.original?.posts_count ?? 0) : (m.posts_count ?? 0)

  const totalImps  = thisWeek.reduce((s, m) => s + impOf(m), 0)
  const prevImps   = lastWeek.reduce((s, m) => s + impOf(m), 0)
  const impChange  = prevImps > 0
    ? Math.round(((totalImps - prevImps) / prevImps) * 100)
    : null

  const latestFollowers  = thisWeek[0]?.followers ?? 0
  const oldestFollowers  = thisWeek[thisWeek.length - 1]?.followers ?? latestFollowers
  const weekFollowerGain = latestFollowers - oldestFollowers
  const totalPosts       = thisWeek.reduce((s, m) => s + postsOf(m), 0)
  const bestHour         = account?.best_times?.[0]?.hour

  if (loading) {
    return (
      <div className="px-4 py-6 space-y-4">
        <div className="h-6 w-40 rounded animate-pulse" style={{ backgroundColor: '#1A1A24' }} />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  const hasData = metrics.length > 0

  return (
    <div className="px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-base font-medium" style={{ color: '#FFFFFF' }}>
          こんにちは、{account?.display_name ?? 'ゲスト'}さん
        </p>
        <button
          onClick={onManualFetch}
          disabled={fetchLoading || cd > 0}
          className="text-xs px-3 py-1.5 rounded-lg font-medium transition-opacity disabled:opacity-40"
          style={{ backgroundColor: '#7C6FE0', color: '#FFFFFF', minHeight: '32px' }}
        >
          {fetchLoading ? (
            <span className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"
                style={{ display: 'inline-block' }}
              />
              更新中
            </span>
          ) : cd > 0 ? (
            `${cd}秒後に再試行`
          ) : (
            '今すぐ更新'
          )}
        </button>
      </div>

      {fetchOk && (
        <p className="text-xs" style={{ color: '#1D9E75' }}>データを更新しました</p>
      )}
      {fetchError && (
        <p className="text-xs" style={{ color: '#D85A30' }}>{fetchError}</p>
      )}

      {/* スコープトグル */}
      <div className="flex gap-1.5">
        {(['all', 'original'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScopePersist(s)}
            className="px-3 py-1 rounded-full text-xs font-medium"
            style={{
              backgroundColor: scope === s ? '#7C6FE0' : '#1A1A24',
              color:           scope === s ? '#FFFFFF'  : '#A0A0B0',
              minHeight: '28px',
            }}
          >
            {s === 'all' ? '全体' : '通常のみ'}
          </button>
        ))}
      </div>

      <div className="h-px" style={{ backgroundColor: '#1A1A24' }} />

      {!hasData ? (
        <div className="rounded-xl p-6 text-center" style={{ backgroundColor: '#1A1A24' }}>
          <p className="text-sm" style={{ color: '#A0A0B0' }}>
            データを取得中です。しばらくお待ちください
          </p>
        </div>
      ) : (
        <>
          {/* IMP */}
          <div className="rounded-xl p-4" style={{ backgroundColor: '#1A1A24' }}>
            <p className="text-xs mb-1" style={{ color: '#A0A0B0' }}>
              {scope === 'original' ? '今週のIMP（通常のみ）' : '今週のIMP'}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold" style={{ color: '#7C6FE0' }}>
                {totalImps.toLocaleString()}
              </span>
              {impChange !== null && (
                <span
                  className="flex items-center text-sm font-medium"
                  style={{ color: impChange >= 0 ? '#1D9E75' : '#D85A30' }}
                >
                  {impChange >= 0
                    ? <TrendingUp size={14} className="mr-0.5" />
                    : <TrendingDown size={14} className="mr-0.5" />}
                  {impChange >= 0 ? '+' : ''}{impChange}%
                </span>
              )}
            </div>
          </div>

          {/* フォロワー（Scope 非対象） */}
          <div className="rounded-xl p-4" style={{ backgroundColor: '#1A1A24' }}>
            <p className="text-xs mb-1" style={{ color: '#A0A0B0' }}>フォロワー</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold" style={{ color: '#7C6FE0' }}>
                {latestFollowers.toLocaleString()}
              </span>
              {weekFollowerGain !== 0 && (
                <span
                  className="text-sm font-medium"
                  style={{ color: weekFollowerGain > 0 ? '#1D9E75' : '#D85A30' }}
                >
                  {weekFollowerGain > 0 ? '+' : ''}{weekFollowerGain}今週
                </span>
              )}
            </div>
          </div>

          {/* 投稿数 */}
          <div className="rounded-xl p-4" style={{ backgroundColor: '#1A1A24' }}>
            <p className="text-xs mb-1" style={{ color: '#A0A0B0' }}>
              {scope === 'original' ? '今週の投稿（通常のみ）' : '今週の投稿'}
            </p>
            <span className="text-3xl font-bold" style={{ color: '#7C6FE0' }}>
              {totalPosts}
              <span className="text-base font-normal ml-1" style={{ color: '#A0A0B0' }}>件</span>
            </span>
          </div>

          {/* ベストタイム（Scope 非対象） */}
          {bestHour !== undefined && (
            <>
              <div className="h-px" style={{ backgroundColor: '#1A1A24' }} />
              <div className="rounded-xl p-4" style={{ backgroundColor: '#1A1A24' }}>
                <p className="text-xs mb-2" style={{ color: '#A0A0B0' }}>⏰ ベストタイム</p>
                <p className="text-sm font-medium" style={{ color: '#FFFFFF' }}>
                  {bestHour}時台が一番伸びる
                </p>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
