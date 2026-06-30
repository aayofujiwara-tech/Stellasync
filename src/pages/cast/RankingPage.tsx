import { useEffect, useState } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useTargetCastId } from '../../hooks/useTargetCastId'
import { type HourlyMetric, type PostGroup, groupByPost, TYPE_META } from '../../lib/posts'
import { engagementScore, engagementRate } from '../../lib/engagement'
import { Trophy } from 'lucide-react'

type SortAxis = 'imp' | 'score' | 'rate'

const AXIS_TABS: { key: SortAxis; label: string }[] = [
  { key: 'imp',   label: 'IMP順' },
  { key: 'score', label: 'スコア順' },
  { key: 'rate',  label: 'ER順' },
]

const TOP_N = 10
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function sortValue(post: PostGroup, axis: SortAxis): number {
  if (axis === 'imp')   return post.latest_imp
  if (axis === 'score') return engagementScore(post.latest_like, post.latest_rt)
  return engagementRate(post.latest_like, post.latest_rt, post.latest_imp)
}

function formatDate(post: PostGroup): string {
  if (!post.posted_at) return '—'
  return new Date(post.posted_at.toMillis()).toLocaleString('ja-JP', {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function RankRow({ post, rank, axis }: { post: PostGroup; rank: number; axis: SortAxis }) {
  const score = engagementScore(post.latest_like, post.latest_rt)
  const rate  = engagementRate(post.latest_like, post.latest_rt, post.latest_imp)
  const meta  = TYPE_META[post.post_type]

  const highlight = (active: SortAxis): { color: string; fontWeight?: number } =>
    axis === active
      ? { color: '#7C6FE0', fontWeight: 600 }
      : { color: '#C0C0D0' }

  return (
    <div className="px-4 py-3 border-b last:border-0" style={{ borderColor: '#2A2A3C' }}>
      <div className="flex items-start gap-3">
        <div
          className="text-sm font-bold tabular-nums w-6 shrink-0 pt-0.5 text-center"
          style={{ color: rank <= 3 ? '#7C6FE0' : '#606070' }}
        >
          {rank}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            {post.post_type !== 'original' && (
              <span
                className="rounded-full"
                style={{
                  backgroundColor: meta.bg,
                  color: meta.fg,
                  fontSize: 10,
                  padding: '2px 6px',
                }}
              >
                {meta.label}
              </span>
            )}
            <span className="text-xs" style={{ color: '#606070' }}>{formatDate(post)}</span>
          </div>
          <p className="text-sm line-clamp-2 mb-2" style={{ color: '#E0E0E8' }}>
            {post.text || '（テキストなし）'}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <span>
              <span style={{ color: '#A0A0B0' }}>IMP </span>
              <span style={highlight('imp')}>{post.latest_imp.toLocaleString()}</span>
            </span>
            <span>
              <span style={{ color: '#A0A0B0' }}>♥ </span>
              <span style={{ color: '#C0C0D0' }}>{post.latest_like.toLocaleString()}</span>
            </span>
            <span>
              <span style={{ color: '#A0A0B0' }}>RT </span>
              <span style={{ color: '#C0C0D0' }}>{post.latest_rt.toLocaleString()}</span>
            </span>
            <span>
              <span style={{ color: '#A0A0B0' }}>Score </span>
              <span style={highlight('score')}>{score}</span>
            </span>
            <span>
              <span style={{ color: '#A0A0B0' }}>ER </span>
              <span style={highlight('rate')}>{(rate * 100).toFixed(2)}%</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RankingPage() {
  const { targetCastId } = useTargetCastId()
  const [posts, setPosts] = useState<PostGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [axis, setAxis] = useState<SortAxis>('imp')

  useEffect(() => {
    if (!targetCastId) {
      setLoading(false)
      return
    }
    setLoading(true)
    getDocs(
      query(
        collection(db, 'post_hourly_metrics'),
        where('cast_id', '==', targetCastId),
      ),
    )
      .then((snap) => {
        const sevenDaysAgo = Date.now() - SEVEN_DAYS_MS
        const metrics = snap.docs.map((d) => d.data() as HourlyMetric)
        const grouped = groupByPost(metrics)
        setPosts(
          grouped.filter(
            (p) =>
              p.post_type !== 'reply' &&
              (p.posted_at?.toMillis() ?? 0) >= sevenDaysAgo,
          ),
        )
      })
      .finally(() => setLoading(false))
  }, [targetCastId])

  const ranked = [...posts]
    .sort((a, b) => sortValue(b, axis) - sortValue(a, axis))
    .slice(0, TOP_N)

  if (loading) {
    return (
      <div className="px-4 py-6 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl h-20 animate-pulse" style={{ backgroundColor: '#1A1A24' }} />
        ))}
      </div>
    )
  }

  return (
    <div className="py-6">
      <div className="flex items-center gap-2 px-4 mb-4">
        <Trophy size={16} style={{ color: '#7C6FE0' }} />
        <h2 className="text-sm font-bold" style={{ color: '#E0E0EE' }}>
          直近7日ランキング（リプライ除外・TOP{TOP_N}）
        </h2>
      </div>

      <div className="flex gap-2 px-4 mb-4">
        {AXIS_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setAxis(key)}
            className="flex-1 text-xs py-1.5 rounded-full font-medium transition-colors"
            style={{
              backgroundColor: axis === key ? '#7C6FE0' : '#1A1A24',
              color:           axis === key ? '#FFFFFF'  : '#A0A0B0',
              minHeight: '32px',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {ranked.length === 0 ? (
        <div className="flex items-center justify-center py-16 px-4">
          <p className="text-sm text-center" style={{ color: '#A0A0B0' }}>
            対象期間の投稿がありません
          </p>
        </div>
      ) : (
        <div className="mx-4 rounded-xl overflow-hidden" style={{ backgroundColor: '#1A1A24' }}>
          {ranked.map((post, i) => (
            <RankRow key={post.post_id} post={post} rank={i + 1} axis={axis} />
          ))}
        </div>
      )}
    </div>
  )
}
