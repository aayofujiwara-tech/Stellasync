export const RT_WEIGHT = 3
export const LIKE_WEIGHT = 1

export function engagementScore(like: number, rt: number): number {
  return like * LIKE_WEIGHT + rt * RT_WEIGHT
}

export function engagementRate(like: number, rt: number, imp: number): number {
  return imp > 0 ? engagementScore(like, rt) / imp : 0
}
