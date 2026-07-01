import { useEffect, useState } from 'react'
import { useTargetCastId } from '../../hooks/useTargetCastId'
import { db } from '../../lib/firebase'
import {
  collection, query, where, orderBy, limit, getDocs, type Timestamp,
} from 'firebase/firestore'
import {
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'

type MetricTab = 'impressions' | 'likes' | 'retweets' | 'followers' | 'er'
type PeriodTab  = 'week' | 'month'
type Scope      = 'all' | 'original'

interface DailyMetric {
  date: Timestamp
  impressions: number
  likes: number
  retweets: number
  followers: number
  by_type?: { original?: { impressions?: number; likes?: number; retweets?: number } }
}

const metricTabs: { key: MetricTab; label: string }[] = [
  { key: 'impressions', label: 'IMP' },
  { key: 'likes',       label: 'いいね' },
  { key: 'retweets',    label: 'RT' },
  { key: 'followers',   label: 'フォロワー' },
  { key: 'er',          label: 'ER' },
]

function extractMetric(d: DailyMetric, m: MetricTab, scope: Scope): number {
  if (m === 'followers') return d.followers ?? 0
  if (m === 'er') {
    const imp = scope === 'original' ? (d.by_type?.original?.impressions ?? 0) : (d.impressions ?? 0)
    const lk  = scope === 'original' ? (d.by_type?.original?.likes ?? 0)       : (d.likes ?? 0)
    const rt  = scope === 'original' ? (d.by_type?.original?.retweets ?? 0)    : (d.retweets ?? 0)
    return imp > 0 ? Number((((lk + rt) / imp) * 100).toFixed(2)) : 0
  }
  if (scope === 'original') {
    const o = d.by_type?.original
    return (m === 'impressions' ? o?.impressions : m === 'likes' ? o?.likes : o?.retweets) ?? 0
  }
  return (m === 'impressions' ? d.impressions : m === 'likes' ? d.likes : d.retweets) ?? 0
}

const SCOPE_KEY = 'stellasync_metric_scope'

export default function GraphPage() {
  const { targetCastId } = useTargetCastId()
  const [metric, setMetric] = useState<MetricTab>('impressions')
  const [period, setPeriod] = useState<PeriodTab>('week')
  const [scope, setScope]   = useState<Scope>(
    (localStorage.getItem(SCOPE_KEY) as Scope) || 'all'
  )
  const [data, setData]     = useState<DailyMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const setScopePersist = (s: Scope) => {
    setScope(s)
    localStorage.setItem(SCOPE_KEY, s)
  }

  useEffect(() => {
    if (!targetCastId) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    const days = period === 'week' ? 7 : 30
    const load = async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'daily_metrics'),
            where('cast_id', '==', targetCastId),
            orderBy('date', 'desc'),
            limit(days),
          ),
        )
        if (!cancelled) setData(snap.docs.map((d) => d.data() as DailyMetric).reverse())
      } catch (e) {
        console.error('[GraphPage] loadData failed:', e)
        if (!cancelled) setLoadError('データの取得に失敗しました。時間をおいて再度お試しください')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [targetCastId, period])

  const isFollowers = metric === 'followers'

  const chartData = data.map((d) => ({
    date: d.date
      ? new Date(d.date.toMillis()).toLocaleDateString('ja-JP', {
          month: 'numeric', day: 'numeric',
        })
      : '',
    value: extractMetric(d, metric, scope),
  }))

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: '#1A1A24',
      border: '1px solid #2A2A3C',
      borderRadius: 8,
      color: '#FFFFFF',
      fontSize: 12,
    },
  }

  return (
    <div className="px-4 py-6">
      {/* メトリクスタブ */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {metricTabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setMetric(key)}
            className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={{
              backgroundColor: metric === key ? '#7C6FE0' : '#1A1A24',
              color: metric === key ? '#FFFFFF' : '#A0A0B0',
              minHeight: '44px',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* スコープトグル */}
      <div className="flex gap-1.5 mb-3" style={{ opacity: isFollowers ? 0.4 : 1 }}>
        {(['all', 'original'] as const).map((s) => (
          <button
            key={s}
            onClick={() => { if (!isFollowers) setScopePersist(s) }}
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

      {/* 期間タブ */}
      <div className="flex gap-1 mb-6">
        {(['week', 'month'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setPeriod(k)}
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={{
              backgroundColor: period === k ? '#2A2A3C' : 'transparent',
              color: period === k ? '#FFFFFF' : '#A0A0B0',
              border: '1px solid',
              borderColor: period === k ? '#7C6FE0' : '#2A2A3C',
              minHeight: '44px',
            }}
          >
            {k === 'week' ? '今週' : '今月'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-xl h-48 animate-pulse" style={{ backgroundColor: '#1A1A24' }} />
      ) : loadError ? (
        <div
          className="flex items-center justify-center h-48 rounded-xl"
          style={{ backgroundColor: '#1A1A24' }}
        >
          <p className="text-sm" style={{ color: '#D85A30' }}>{loadError}</p>
        </div>
      ) : chartData.length === 0 ? (
        <div
          className="flex items-center justify-center h-48 rounded-xl"
          style={{ backgroundColor: '#1A1A24' }}
        >
          <p className="text-sm" style={{ color: '#A0A0B0' }}>データがありません</p>
        </div>
      ) : (
        <div className="rounded-xl p-4" style={{ backgroundColor: '#1A1A24' }}>
          {period === 'week' ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#A0A0B0' }} />
                <YAxis tick={{ fontSize: 10, fill: '#A0A0B0' }} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="value" fill="#7C6FE0" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#A0A0B0' }} />
                <YAxis tick={{ fontSize: 10, fill: '#A0A0B0' }} />
                <Tooltip {...tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#7C6FE0"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  )
}
