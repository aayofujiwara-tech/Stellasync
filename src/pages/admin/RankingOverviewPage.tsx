import { useEffect, useState } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../hooks/useAuth'
import { type HourlyMetric, type PostGroup, groupByPost, TYPE_META } from '../../lib/posts'
import { engagementScore, engagementRate } from '../../lib/engagement'
import { Trophy } from 'lucide-react'
import VelocityModal from '../../components/VelocityModal'

type SortAxis = 'imp' | 'score' | 'rate'

interface AccountInfo {
  uid: string
  displayName: string
  storeId: string
  storeName: string
}

interface RankedPost extends PostGroup {
  castId: string
  castName: string
  storeId: string
  storeName: string
}

const AXIS_TABS: { key: SortAxis; label: string }[] = [
  { key: 'imp',   label: 'IMP順' },
  { key: 'score', label: 'スコア順' },
  { key: 'rate',  label: 'ER順' },
]

const TOP_N = 20
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function storeLabel(storeId: string, storeName?: string): string {
  if (storeName) return storeName
  return storeId.replace(/^store_/, '').replace(/_/g, ' ').toUpperCase()
}

function sortValue(post: RankedPost, axis: SortAxis): number {
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

async function fetchPostsForCast(uid: string): Promise<PostGroup[]> {
  const snap = await getDocs(
    query(
      collection(db, 'post_hourly_metrics'),
      where('cast_id', '==', uid),
    ),
  )
  const sevenDaysAgo = Date.now() - SEVEN_DAYS_MS
  const metrics = snap.docs.map((d) => d.data() as HourlyMetric)
  const grouped = groupByPost(metrics)
  return grouped.filter(
    (p) =>
      p.post_type !== 'reply' &&
      (p.posted_at?.toMillis() ?? 0) >= sevenDaysAgo,
  )
}

function RankedRow({
  post, rank, axis, onClick,
}: {
  post: RankedPost
  rank: number
  axis: SortAxis
  onClick: () => void
}) {
  const score = engagementScore(post.latest_like, post.latest_rt)
  const rate  = engagementRate(post.latest_like, post.latest_rt, post.latest_imp)
  const meta  = TYPE_META[post.post_type]

  const highlight = (active: SortAxis): { color: string; fontWeight?: number } =>
    axis === active
      ? { color: '#7C6FE0', fontWeight: 600 }
      : { color: '#C0C0D0' }

  return (
    <div
      className="px-4 py-3 border-b last:border-0 cursor-pointer transition-colors"
      style={{ borderColor: '#2A2A3C' }}
      onClick={onClick}
      role="button"
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(124,111,224,0.06)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="text-sm font-bold tabular-nums w-7 shrink-0 pt-0.5 text-center"
          style={{ color: rank <= 3 ? '#7C6FE0' : '#606070' }}
        >
          {rank}
        </div>
        <div className="flex-1 min-w-0">
          {/* キャスト名・店舗・日時 */}
          <div className="flex items-center justify-between mb-1 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium truncate" style={{ color: '#E0E0EE' }}>
                {post.castName}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded-full shrink-0"
                style={{ backgroundColor: '#1E1A3A', color: '#A08FE0' }}
              >
                {post.storeName}
              </span>
            </div>
            <span className="text-xs shrink-0" style={{ color: '#606070' }}>
              {formatDate(post)}
            </span>
          </div>
          {/* 投稿タイプバッジ */}
          {post.post_type !== 'original' && (
            <span
              className="inline-block rounded-full mb-1"
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
          {/* テキスト */}
          <p className="text-sm line-clamp-2 mb-2" style={{ color: '#C0C0CC' }}>
            {post.text || '（テキストなし）'}
          </p>
          {/* メトリクス */}
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
          <p className="text-xs mt-1.5" style={{ color: '#7C6FE0' }}>↗ クリックで初速を見る</p>
        </div>
      </div>
    </div>
  )
}

export default function RankingOverviewPage() {
  const { role, managedStores } = useAuth()
  const [allPosts, setAllPosts]     = useState<RankedPost[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [axis, setAxis]             = useState<SortAxis>('imp')
  const [selectedPost, setSelected] = useState<PostGroup | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        let accountsSnap
        if (role === 'admin') {
          accountsSnap = await getDocs(collection(db, 'accounts'))
        } else {
          if (managedStores.length === 0) {
            setAllPosts([])
            setLoading(false)
            return
          }
          accountsSnap = await getDocs(
            query(collection(db, 'accounts'), where('store_id', 'in', managedStores)),
          )
        }

        const accounts: AccountInfo[] = accountsSnap.docs
          .map((d) => {
            const data = d.data()
            return {
              uid:         d.id,
              displayName: data.display_name as string,
              storeId:     (data.store_id as string) ?? '',
              storeName:   storeLabel(
                (data.store_id as string) ?? '',
                data.store_name as string | undefined,
              ),
            }
          })
          .filter((a) => a.displayName && a.storeId)

        const results = await Promise.all(
          accounts.map(async (a) => {
            const posts = await fetchPostsForCast(a.uid)
            return posts.map<RankedPost>((p) => ({
              ...p,
              castId:    a.uid,
              castName:  a.displayName,
              storeId:   a.storeId,
              storeName: a.storeName,
            }))
          }),
        )

        if (!cancelled) {
          setAllPosts(results.flat())
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

  const ranked = [...allPosts]
    .sort((a, b) => sortValue(b, axis) - sortValue(a, axis))
    .slice(0, TOP_N)

  const headerLabel = role === 'admin' ? '全体ランキング（admin）' : '全体ランキング'

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
    <>
      <div className="px-4 py-5 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <Trophy size={18} style={{ color: '#7C6FE0' }} />
          <h2 className="text-base font-bold" style={{ color: '#E0E0EE' }}>
            {headerLabel}
          </h2>
          <span className="text-xs" style={{ color: '#A0A0B0' }}>
            直近7日・リプライ除外・TOP{TOP_N}
          </span>
        </div>

        <div className="flex gap-2 mb-4">
          {AXIS_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setAxis(key)}
              className="text-xs px-4 py-1.5 rounded-full font-medium transition-colors"
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
          <div className="flex items-center justify-center py-16">
            <p className="text-sm" style={{ color: '#A0A0B0' }}>
              対象期間の投稿がありません
            </p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1A1A24' }}>
            {ranked.map((post, i) => (
              <RankedRow
                key={`${post.castId}-${post.post_id}`}
                post={post}
                rank={i + 1}
                axis={axis}
                onClick={() => setSelected(post)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedPost !== null && (
        <VelocityModal post={selectedPost} onClose={() => setSelected(null)} />
      )}
    </>
  )
}
