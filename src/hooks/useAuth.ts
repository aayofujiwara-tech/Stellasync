import { useState, useEffect } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

type Role = 'cast' | 'manager' | 'area_manager'

interface AuthState {
  user: User | null
  role: Role | null
  loading: boolean
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    role: null,
    loading: true,
  })

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ user: null, role: null, loading: false })
        return
      }

      try {
        const accountSnap = await getDoc(doc(db, 'accounts', user.uid))
        let role: Role = 'cast'

        if (accountSnap.exists()) {
          const orgId = accountSnap.data().org_id as string | undefined
          if (orgId) {
            const memberSnap = await getDoc(
              doc(db, 'organizations', orgId, 'members', user.uid),
            )
            if (memberSnap.exists()) {
              role = (memberSnap.data().role as Role) ?? 'cast'
            }
          }
        }

        setState({ user, role, loading: false })
      } catch {
        setState({ user, role: 'cast', loading: false })
      }
    })

    return unsubscribe
  }, [])

  return state
}
