import { useEffect, useState } from 'react'
import { useTargetCastId } from '../../hooks/useTargetCastId'
import { db } from '../../lib/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Image } from 'lucide-react'
import {
  type PostType, type HourlyMetric, type PostGroup,
  groupByPost, TYPE_META,
} from '../../lib/posts'

type MetricKey = 'imp_cumulative' | 'like_cumulative' | 'rt_cumulative'

const metricLabels: Record<MetricKey, string> = {
  imp_cumulative:  'IMP',
  like_cumulative: 'いいね',
  rt_cumulative:   'RT',
}

const FILTER_ORDER: Array<'all' | PostType> = ['all', 'original', 'quote', 'guest', 'reply']
const FILTER_LABELS: Record<'all' | PostType, string> = {
  all:      'すべて',
  original: '通常',
  quote:    '引用',
  guest:    'ゲスト',
  reply:    'リプライ',
}

function PostCard({ post }: { post: PostGroup }) {
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState<MetricKey>('imp_cumulative')

  const postedAt = post.posted_at
    ? new Date(post.posted_at.toMillis()).toLocaleString('ja-JP', {
        month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—'

  const meta = TYPE_META[post.post_type]

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1A1A24' }}>
      <button
        className="w-full text-left px-4 py-3"
        onClick={() => setExpanded((v) => !v)}
        style={{ minHeight: '44px' }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs" style={{ color: '#A0A0B0' }}>{postedAt}</span>
          <div className="flex items-center gap-1.5">
            {post.post_type !== 'original' && (
              <span style={{
                backgroundColor: meta.bg,
                color: meta.fg,
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 999,
              }}>
                {meta.label}
              </span>
            )}
            {post.has_media && (
              <span
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                style={{ backgroundColor: '#2A2A3C', color: '#7C6FE0' }}
              >
                <Image size={11} />
                メディア
              </span>
            )}
          </div>
        </div>
        {post.text && (
          <div
            className="text-sm mb-2 whitespace-pre-wrap line-clamp-2"
            style={{ color: '#E0E0E8' }}
          >
            {post.text}
          </div>
        )}
        {post.media_url && (
          <img
            src={post.media_url}
            alt=""
            loading="lazy"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, marginTop: 8 }}
          />
        )}
        <div className="flex gap-4 text-sm">
          <span>
            <span style={{ color: '#A0A0B0' }}>IMP </span>
            <span style={{ color: '#7C6FE0', fontWeight: 600 }}>{post.latest_imp.toLocaleString()}</span>
          </span>
          <span>
            <span style={{ color: '#A0A0B0' }}>♥ </span>
            <span style={{ color: '#FFFFFF' }}>{post.latest_like.toLocaleString()}</span>
          </span>
          <span>
            <span style={{ color: '#A0A0B0' }}>RT </span>
            <span style={{ color: '#FFFFFF' }}>{post.latest_rt.toLocaleString()}</span>
          </span>
          {post.latest_imp > 0 && (
            <span>
              <span style={{ color: '#A0A0B0' }}>ER </span>
              <span style={{ color: '#7C6FE0', fontWeight: 600 }}>
                {(((post.latest_like + post.latest_rt) / post.latest_imp) * 100).toFixed(1)}%
              </span>
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: '#2A2A3C' }}>
          <div className="flex gap-1 mt-3 mb-2">
            {(Object.keys(metricLabels) as MetricKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                style={{
                  backgroundColor: tab === k ? '#7C6FE0' : '#2A2A3C',
                  color: tab === k ? '#FFFFFF' : '#A0A0B0',
                  minHeight: '28px',
                }}
              >
                {metricLabels[k]}
              </button>
            ))}
          </div>

          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={post.hours} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
                dataKey={tab}
                stroke="#7C6FE0"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export default function PostsPage() {
  const { targetCastId } = useTargetCastId()
  const [posts, setPosts] = useState<PostGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | PostType>('all')

  useEffect(() => {
    if (!targetCastId) return
    let cancelled = false
    const load = async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'post_hourly_metrics'),
            where('cast_id', '==', targetCastId),
          ),
        )
        if (!cancelled) {
          const metrics = snap.docs.map((d) => d.data() as HourlyMetric)
          setPosts(groupByPost(metrics))
        }
      } catch (e) {
        console.error('[PostsPage] loadData failed:', e)
        if (!cancelled) setLoadError('データの取得に失敗しました。時間をおいて再度お試しください')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [targetCastId])

  if (loading) {
    return (
      <div className="px-4 py-6 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl h-20 animate-pulse" style={{ backgroundColor: '#1A1A24' }} />
        ))}
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <p className="text-sm text-center" style={{ color: '#D85A30' }}>{loadError}</p>
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <p className="text-sm text-center" style={{ color: '#A0A0B0' }}>
          まだ投稿データがありません
        </p>
      </div>
    )
  }

  const counts: Record<'all' | PostType, number> = {
    all:      posts.length,
    original: posts.filter((p) => p.post_type === 'original').length,
    quote:    posts.filter((p) => p.post_type === 'quote').length,
    guest:    posts.filter((p) => p.post_type === 'guest').length,
    reply:    posts.filter((p) => p.post_type === 'reply').length,
  }
  const visible = filter === 'all' ? posts : posts.filter((p) => p.post_type === filter)

  return (
    <div className="py-6 space-y-3">
      <div className="flex gap-2 px-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {FILTER_ORDER.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full font-medium"
            style={{
              backgroundColor: filter === f ? '#7C6FE0' : '#1A1A24',
              color:           filter === f ? '#FFFFFF'  : '#A0A0B0',
              minHeight: '28px',
            }}
          >
            {FILTER_LABELS[f]}({counts[f]})
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex items-center justify-center py-16 px-4">
          <p className="text-sm text-center" style={{ color: '#A0A0B0' }}>
            該当する投稿がありません
          </p>
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {visible.map((post) => (
            <PostCard key={post.post_id} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}
