import { useParams } from 'react-router-dom'
import { useAuth } from './useAuth'

export function useTargetCastId() {
  const { castId } = useParams<{ castId?: string }>()
  const { user } = useAuth()
  const targetCastId = castId ?? user?.uid ?? null
  const isViewingOther = !!castId && castId !== user?.uid
  return { targetCastId, isViewingOther }
}
