import { doc, getDoc, type Timestamp } from 'firebase/firestore'
import { db } from './firebase'

export interface VelocitySample {
  imp: number
  like: number
  rt: number
  atMs: number
  slot: number
}

export interface PostVelocityData {
  post_id: string
  samples: VelocitySample[]  // slot(0,15,30,45,60) 昇順
}

export interface VelocityDeltaResult {
  // スロット間の増分配列（0→15, 15→30, …）
  deltas: Array<{ fromSlot: number; toSlot: number; dImp: number; dLike: number; dRt: number }>
  // 最初のスロット→次のスロット の Δimp（立ち上がりの速さ）
  firstDeltaImp: number
  // 最終IMP に対して 15分以内(slot<=15)で何%獲得したか
  earlyReachPct: number
}

interface RawSample {
  imp: number
  like: number
  rt: number
  at: Timestamp
}

export async function fetchPostVelocity(postId: string): Promise<PostVelocityData | null> {
  const snap = await getDoc(doc(db, 'post_velocity', postId))
  if (!snap.exists()) return null

  const raw = snap.data().samples as Record<string, RawSample> | undefined
  if (!raw) return { post_id: postId, samples: [] }

  const samples: VelocitySample[] = Object.entries(raw)
    .map(([key, val]) => ({
      slot:  parseInt(key, 10),
      imp:   val.imp  ?? 0,
      like:  val.like ?? 0,
      rt:    val.rt   ?? 0,
      atMs:  val.at?.toMillis() ?? 0,
    }))
    .sort((a, b) => a.slot - b.slot)

  return { post_id: postId, samples }
}

export function velocityDeltas(samples: VelocitySample[]): VelocityDeltaResult {
  // 各スロット間の増分: slice(1) の index i が前のスロット samples[i] に対応
  const deltas = samples.slice(1).map((cur, i) => {
    const prev = samples[i]
    return {
      fromSlot: prev.slot,
      toSlot:   cur.slot,
      dImp:     cur.imp  - prev.imp,
      dLike:    cur.like - prev.like,
      dRt:      cur.rt   - prev.rt,
    }
  })

  const firstDeltaImp = deltas.length > 0 ? deltas[0].dImp : 0

  const finalImp = samples.length > 0 ? samples[samples.length - 1].imp : 0
  // slot <= 15 の中で最も大きいスロットのサンプル
  const at15 = [...samples].filter((s) => s.slot <= 15).pop()
  const earlyImp = at15?.imp ?? 0
  const earlyReachPct = finalImp > 0 ? (earlyImp / finalImp) * 100 : 0

  return { deltas, firstDeltaImp, earlyReachPct }
}
