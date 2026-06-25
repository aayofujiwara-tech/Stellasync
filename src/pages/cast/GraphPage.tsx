import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { db } from '../../lib/firebase'
import {
  collection, query, where, orderBy, limit, getDocs, type Timestamp,
} from 'firebase/firestore'
import {
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'

type MetricTab = 'impressions' | 'likes' | 'retweets' | 'followers'
type PeriodTab  = 'week' | 'month'

interface DailyMetric {
  date: Timestamp
  impressions: number
  likes: number
  retweets: number
  followers: number
}

const metricTabs: { key: MetricTab; label: string }[] = [
  { key: 'impressions', label: 'IMP' },
  { key: 'likes',       label: 'いいね' },
  { key: 'retweets',    label: 'RT' },
  { key: 'followers',   label: 'フォロワー' },
]

function extractMetric(d: DailyMetric, m: MetricTab): number {
  const values: Record<MetricTab, number> = {
    impressions: d.impressions,
    likes:       d.likes,
    retweets:    d.retweets,
    followers:   d.followers,
  }
  return values[m] ?? 0
}

export default function GraphPage() {
  const { user } = useAuth()
  const [metric, setMetric] = useState<MetricTab>('impressions')
  const [period, setPeriod] = useState<PeriodTab>('week')
  const [data, setData] = useState<DailyMetric[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    const days = period === 'week' ? 7 : 30
    getDocs(
      query(
        collection(db, 'daily_metrics'),
        where('cast_id', '==', user.uid),
        orderBy('date', 'desc'),
        limit(days),
      ),
    )
      .then((snap) =>
        setData(snap.docs.map((d) => d.data() as DailyMetric).reverse()),
      )
      .finally(() => setLoading(false))
  }, [user, period])

  const chartData = data.map((d) => ({
    date: d.date
      ? new Date(d.date.toMillis()).toLocaleDateString('ja-JP', {
          month: 'numeric', day: 'numeric',
        })
      : '',
    value: extractMetric(d, metric),
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
