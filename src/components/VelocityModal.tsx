import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { X } from 'lucide-react'
import { type PostGroup, type HourlyMetric, TYPE_META } from '../lib/posts'
import {
  fetchPostVelocity, velocityDeltas,
  type PostVelocityData,
} from '../lib/velocity'

/* ---- 型 ---- */

type TabKey = 'velocity' | 'growth'

// 初速タブ用: post_velocity の生値キー
type VelocityMetricKey = 'imp' | 'like' | 'rt'
const VELOCITY_METRIC_LABELS: Record<VelocityMetricKey, string> = {
  imp:  'IMP',
  like: 'いいね',
  rt:   'RT',
}

// 伸び全体タブ用: post_hourly_metrics の累積値キー
type GrowthMetricKey = 'imp_cumulative' | 'like_cumulative' | 'rt_cumulative'
const GROWTH_METRIC_LABELS: Record<GrowthMetricKey, string> = {
  imp_cumulative:  'IMP',
  like_cumulative: 'いいね',
  rt_cumulative:   'RT',
}

interface Props {
  post: PostGroup
  onClose: () => void
}

/* ---- 共通: ピル型タブバー ---- */

function TabBar({ tab, setTab }: { tab: TabKey; setTab: (t: TabKey) => void }) {
  return (
    <div className="flex gap-1 px-5 pb-3">
      {(['velocity', 'growth'] as const).map((t) => (
        <button
          key={t}
          onClick={() => setTab(t)}
          className="px-4 py-1.5 rounded-full text-xs font-medium transition-colors"
          style={{
            backgroundColor: tab === t ? '#7C6FE0' : '#2A2A3C',
            color:           tab === t ? '#FFFFFF'  : '#A0A0B0',
            minHeight: '30px',
          }}
        >
          {t === 'velocity' ? '初速' : '伸び全体'}
        </button>
      ))}
    </div>
  )
}

/* ---- 初速タブ（post_velocity データあり時） ---- */

function VelocityContent({
  data, metric, setMetric,
}: {
  data: PostVelocityData
  metric: VelocityMetricKey
  setMetric: (m: VelocityMetricKey) => void
}) {
  const { samples } = data

  if (samples.length === 0) {
    return (
      <p className="text-sm text-center py-4" style={{ color: '#A0A0B0' }}>
        サンプルデータがありません
      </p>
    )
  }

  const { deltas, firstDeltaImp, earlyReachPct } = velocityDeltas(samples)
  const first = deltas[0]

  const chartData = samples.map((s) => ({
    slot: s.slot,
    imp:  s.imp,
    like: s.like,
    rt:   s.rt,
  }))

  return (
    <>
      {/* 初速サマリー */}
      <div className="rounded-xl px-4 py-3 mb-4" style={{ backgroundColor: '#12121C' }}>
        <p className="text-xs font-semibold mb-2" style={{ color: '#7C6FE0' }}>
          初速サマリー
        </p>
        {first && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-2">
            <span>
              <span style={{ color: '#A0A0B0' }}>最初の15分 IMP </span>
              <span style={{ color: '#E0E0E8', fontWeight: 600 }}>
                +{firstDeltaImp.toLocaleString()}
              </span>
            </span>
            <span>
              <span style={{ color: '#A0A0B0' }}>♥ </span>
              <span style={{ color: '#E0E0E8' }}>+{first.dLike}</span>
            </span>
            <span>
              <span style={{ color: '#A0A0B0' }}>RT </span>
              <span style={{ color: '#E0E0E8' }}>+{first.dRt}</span>
            </span>
          </div>
        )}
        <div className="flex items-baseline gap-2 text-xs flex-wrap">
          <span style={{ color: '#A0A0B0' }}>初速到達率</span>
          <span style={{ color: '#7C6FE0', fontWeight: 700, fontSize: 15 }}>
            {earlyReachPct.toFixed(1)}%
          </span>
          <span style={{ color: '#606070' }}>
            （最終IMP の {earlyReachPct.toFixed(1)}% を15分で獲得）
          </span>
        </div>
      </div>

      {/* スロット間増分チップ */}
      {deltas.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {deltas.map((d) => (
            <div
              key={`${d.fromSlot}-${d.toSlot}`}
              className="flex-1 rounded-lg px-2 py-1.5 text-center"
              style={{ backgroundColor: '#12121C', minWidth: '3.5rem' }}
            >
              <p className="text-xs" style={{ color: '#606070' }}>
                {d.fromSlot}→{d.toSlot}分
              </p>
              <p className="text-xs font-semibold tabular-nums" style={{ color: '#C0C0D0' }}>
                +{d.dImp.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* 指標切替 */}
      <div className="flex gap-1 mb-3">
        {(Object.keys(VELOCITY_METRIC_LABELS) as VelocityMetricKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setMetric(k)}
            className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
            style={{
              backgroundColor: metric === k ? '#7C6FE0' : '#2A2A3C',
              color:           metric === k ? '#FFFFFF'  : '#A0A0B0',
              minHeight: '28px',
            }}
          >
            {VELOCITY_METRIC_LABELS[k]}
          </button>
        ))}
      </div>

      {/* 初速カーブ */}
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="slot"
            tick={{ fontSize: 10, fill: '#A0A0B0' }}
            tickFormatter={(v: number) => `${v}分`}
          />
          <YAxis tick={{ fontSize: 10, fill: '#A0A0B0' }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1A1A24',
              border: '1px solid #2A2A3C',
              borderRadius: 8,
              color: '#FFFFFF',
              fontSize: 12,
            }}
            labelFormatter={(v: number) => `${v}分後`}
          />
          <Line
            type="monotone"
            dataKey={metric}
            stroke="#7C6FE0"
            strokeWidth={2}
            dot={{ fill: '#7C6FE0', r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}

/* ---- 伸び全体タブ（post.hours を使用、新規取得不要） ---- */

function GrowthContent({
  hours, metric, setMetric,
}: {
  hours: HourlyMetric[]
  metric: GrowthMetricKey
  setMetric: (m: GrowthMetricKey) => void
}) {
  // post.hours は groupByPost で hour_offset 昇順ソート済み
  if (hours.length <= 1) {
    return (
      <div
        className="rounded-xl px-4 py-5 text-center"
        style={{ backgroundColor: '#12121C' }}
      >
        <p className="text-sm" style={{ color: '#A0A0B0' }}>伸びデータがまだありません</p>
        <p className="text-xs mt-1" style={{ color: '#606070' }}>
          ポーリングが蓄積されると表示されます
        </p>
      </div>
    )
  }

  const last = hours[hours.length - 1]
  const prev = hours[hours.length - 2]
  const recentDeltaImp  = last.imp_cumulative  - prev.imp_cumulative
  const recentDeltaLike = last.like_cumulative - prev.like_cumulative
  const recentDeltaRt   = last.rt_cumulative   - prev.rt_cumulative

  return (
    <>
      {/* 伸びサマリー */}
      <div className="rounded-xl px-4 py-3 mb-4" style={{ backgroundColor: '#12121C' }}>
        <p className="text-xs font-semibold mb-2" style={{ color: '#7C6FE0' }}>
          現在の累積
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-2">
          <span>
            <span style={{ color: '#A0A0B0' }}>IMP </span>
            <span style={{ color: '#E0E0E8', fontWeight: 600 }}>
              {last.imp_cumulative.toLocaleString()}
            </span>
          </span>
          <span>
            <span style={{ color: '#A0A0B0' }}>♥ </span>
            <span style={{ color: '#E0E0E8' }}>{last.like_cumulative.toLocaleString()}</span>
          </span>
          <span>
            <span style={{ color: '#A0A0B0' }}>RT </span>
            <span style={{ color: '#E0E0E8' }}>{last.rt_cumulative.toLocaleString()}</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span>
            <span style={{ color: '#A0A0B0' }}>経過 </span>
            <span style={{ color: '#C0C0D0' }}>{last.hour_offset}h</span>
          </span>
          <span>
            <span style={{ color: '#A0A0B0' }}>直近の伸び IMP </span>
            <span style={{ color: '#C0C0D0' }}>+{recentDeltaImp.toLocaleString()}</span>
          </span>
          <span>
            <span style={{ color: '#A0A0B0' }}>♥ </span>
            <span style={{ color: '#C0C0D0' }}>+{recentDeltaLike}</span>
          </span>
          <span>
            <span style={{ color: '#A0A0B0' }}>RT </span>
            <span style={{ color: '#C0C0D0' }}>+{recentDeltaRt}</span>
          </span>
        </div>
      </div>

      {/* 指標切替 */}
      <div className="flex gap-1 mb-3">
        {(Object.keys(GROWTH_METRIC_LABELS) as GrowthMetricKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setMetric(k)}
            className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
            style={{
              backgroundColor: metric === k ? '#7C6FE0' : '#2A2A3C',
              color:           metric === k ? '#FFFFFF'  : '#A0A0B0',
              minHeight: '28px',
            }}
          >
            {GROWTH_METRIC_LABELS[k]}
          </button>
        ))}
      </div>

      {/* 累積カーブ */}
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={hours} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="hour_offset"
            tick={{ fontSize: 10, fill: '#A0A0B0' }}
            tickFormatter={(v: number) => `${v}h`}
          />
          <YAxis tick={{ fontSize: 10, fill: '#A0A0B0' }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1A1A24',
              border: '1px solid #2A2A3C',
              borderRadius: 8,
              color: '#FFFFFF',
              fontSize: 12,
            }}
            labelFormatter={(v: number) => `${v}時間後`}
          />
          <Line
            type="monotone"
            dataKey={metric}
            stroke="#7C6FE0"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}

/* ---- モーダル本体 ---- */

export default function VelocityModal({ post, onClose }: Props) {
  const [tab, setTab]                   = useState<TabKey>('velocity')
  const [velocityData, setVelocityData] = useState<PostVelocityData | null>(null)
  const [loading, setLoading]           = useState(true)
  const [velocityMetric, setVelocityMetric] = useState<VelocityMetricKey>('imp')
  const [growthMetric, setGrowthMetric]     = useState<GrowthMetricKey>('imp_cumulative')

  // Esc で閉じる
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // 初速データ取得（タブに関わらず事前にフェッチ）
  useEffect(() => {
    setLoading(true)
    fetchPostVelocity(post.post_id)
      .then(setVelocityData)
      .finally(() => setLoading(false))
  }, [post.post_id])

  const meta = TYPE_META[post.post_type]
  const postedAt = post.posted_at
    ? new Date(post.posted_at.toMillis()).toLocaleString('ja-JP', {
        month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ backgroundColor: '#1A1A24', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダ: 投稿情報 + 閉じるボタン */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div className="flex-1 min-w-0 mr-3">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              {post.post_type !== 'original' && (
                <span
                  className="rounded-full text-xs"
                  style={{ backgroundColor: meta.bg, color: meta.fg, padding: '2px 8px' }}
                >
                  {meta.label}
                </span>
              )}
              <span className="text-xs" style={{ color: '#A0A0B0' }}>{postedAt}</span>
            </div>
            <p className="text-sm line-clamp-3" style={{ color: '#E0E0E8' }}>
              {post.text || '（テキストなし）'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-full shrink-0"
            style={{ backgroundColor: '#2A2A3C', color: '#A0A0B0', width: 32, height: 32 }}
            aria-label="閉じる"
          >
            <X size={16} />
          </button>
        </div>

        {/* タブバー */}
        <TabBar tab={tab} setTab={setTab} />

        {/* コンテンツ */}
        <div className="px-5 pb-5">
          {tab === 'velocity' && (
            <>
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <div
                    className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                    style={{ borderColor: '#7C6FE0', borderTopColor: 'transparent' }}
                  />
                </div>
              )}
              {!loading && velocityData === null && (
                <div
                  className="rounded-xl px-4 py-5 text-center"
                  style={{ backgroundColor: '#12121C' }}
                >
                  <p className="text-sm" style={{ color: '#A0A0B0' }}>
                    この投稿には初速データがありません
                  </p>
                  <p className="text-xs mt-1" style={{ color: '#606070' }}>
                    連携後の新規投稿から記録されます
                  </p>
                </div>
              )}
              {!loading && velocityData !== null && (
                <VelocityContent
                  data={velocityData}
                  metric={velocityMetric}
                  setMetric={setVelocityMetric}
                />
              )}
            </>
          )}

          {tab === 'growth' && (
            <GrowthContent
              hours={post.hours}
              metric={growthMetric}
              setMetric={setGrowthMetric}
            />
          )}
        </div>
      </div>
    </div>
  )
}
