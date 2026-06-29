import { useState, useEffect } from 'react'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

export type UserRole = 'cast' | 'area_manager' | 'admin'

interface AuthState {
  user: User | null
  loading: boolean
  role: UserRole
  managedStores: string[]
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    role: 'cast',
    managedStores: [],
  })

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ user: null, loading: false, role: 'cast', managedStores: [] })
        return
      }

      try {
        const accountSnap = await getDoc(doc(db, 'accounts', user.uid))

        // X OAuth 未完了の匿名ユーザーは未認証として扱う
        if (!accountSnap.exists() || !accountSnap.data().x_user_id) {
          await signOut(auth)
          setState({ user: null, loading: false, role: 'cast', managedStores: [] })
          return
        }

        // roles/{uid} でロールを確認（存在しない UID は cast 扱い）
        const roleSnap = await getDoc(doc(db, 'roles', user.uid))
        let role: UserRole = 'cast'
        let managedStores: string[] = []

        if (roleSnap.exists()) {
          const data = roleSnap.data()
          role = (data.role as UserRole) ?? 'cast'
          managedStores = Array.isArray(data.managed_stores) ? (data.managed_stores as string[]) : []
        }

        setState({ user, loading: false, role, managedStores })
      } catch (e) {
        console.error('[useAuth] role/account fetch failed:', e)
        setState({ user, loading: false, role: 'cast', managedStores: [] })
      }
    })

    return unsubscribe
  }, [])

  return state
}
