import { useState, useEffect } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
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

      // ── accounts ──────────────────────────────────────────────────
      let accountValid = false
      try {
        const accountSnap = await getDoc(doc(db, 'accounts', user.uid))
        if (!accountSnap.exists() || !accountSnap.data().x_user_id) {
          // signOut しない。新規連携直後は Cloud Function の Firestore 書き込みが
          // onAuthStateChanged より後に伝播することがあり、正常フローを誤ってログアウト
          // させてしまうため。user を維持して role='cast' にフォールバックする。
          console.warn('[useAuth] accounts doc missing or x_user_id empty — keeping user, fallback cast (uid=' + user.uid + ')')
          setState({ user, loading: false, role: 'cast', managedStores: [] })
          return
        }
        accountValid = true
      } catch (e) {
        console.error('[useAuth] accounts getDoc FAILED:', e)
      }

      if (!accountValid) {
        setState({ user, loading: false, role: 'cast', managedStores: [] })
        return
      }

      // ── roles ──────────────────────────────────────────────────────
      let role: UserRole = 'cast'
      let managedStores: string[] = []
      try {
        const roleSnap = await getDoc(doc(db, 'roles', user.uid))
        if (!roleSnap.exists()) {
          console.warn('[useAuth] roles getDoc: doc not found (uid=' + user.uid + ') → cast')
        } else {
          const data = roleSnap.data()
          role = (data.role as UserRole) ?? 'cast'
          managedStores = Array.isArray(data.managed_stores) ? (data.managed_stores as string[]) : []
        }
      } catch (e) {
        console.error('[useAuth] roles getDoc FAILED:', e)
      }

      setState({ user, loading: false, role, managedStores })
    })

    return unsubscribe
  }, [])

  return state
}
