import type { Timestamp } from 'firebase/firestore'

export type PostType = 'original' | 'quote' | 'guest' | 'reply'

export interface HourlyMetric {
  post_id: string
  hour_offset: number
  imp_cumulative: number
  like_cumulative: number
  rt_cumulative: number
  posted_at: Timestamp | null
  has_media: boolean
  media_url?: string | null
  text: string
  post_type?: PostType
}

export interface PostGroup {
  post_id: string
  posted_at: Timestamp | null
  has_media: boolean
  latest_imp: number
  latest_like: number
  latest_rt: number
  hours: HourlyMetric[]
  text: string
  media_url: string | null
  post_type: PostType
}

export const TYPE_META: Record<PostType, { label: string; bg: string; fg: string }> = {
  original: { label: '通常',     bg: '#1A1A24', fg: '#A0A0B0' },
  quote:    { label: '引用',     bg: '#11243A', fg: '#85B7EB' },
  guest:    { label: 'ゲスト',   bg: '#211C3A', fg: '#AFA9EC' },
  reply:    { label: 'リプライ', bg: '#2A2A2E', fg: '#888780' },
}

export function groupByPost(metrics: HourlyMetric[]): PostGroup[] {
  const map = new Map<string, HourlyMetric[]>()
  for (const m of metrics) {
    if (!map.has(m.post_id)) map.set(m.post_id, [])
    map.get(m.post_id)!.push(m)
  }

  return Array.from(map.entries())
    .map(([post_id, hours]) => {
      const sorted = [...hours].sort((a, b) => b.hour_offset - a.hour_offset)
      const latest = sorted[0]
      return {
        post_id,
        posted_at:   latest.posted_at ?? null,
        has_media:   latest.has_media,
        latest_imp:  latest.imp_cumulative,
        latest_like: latest.like_cumulative,
        latest_rt:   latest.rt_cumulative,
        hours:       hours.sort((a, b) => a.hour_offset - b.hour_offset),
        text:        latest.text ?? '',
        media_url:   latest.media_url ?? null,
        post_type:   latest.post_type ?? 'original',
      }
    })
    .sort((a, b) => {
      const aMs = a.posted_at?.toMillis() ?? 0
      const bMs = b.posted_at?.toMillis() ?? 0
      return bMs - aMs
    })
}
