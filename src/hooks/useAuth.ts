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

      // ── accounts ──────────────────────────────────────────────────
      let accountValid = false
      try {
        const accountSnap = await getDoc(doc(db, 'accounts', user.uid))
        if (!accountSnap.exists()) {
          console.warn('[useAuth] accounts getDoc: doc not found (uid=' + user.uid + ')')
          await signOut(auth)
          setState({ user: null, loading: false, role: 'cast', managedStores: [] })
          return
        }
        if (!accountSnap.data().x_user_id) {
          console.warn('[useAuth] accounts getDoc: x_user_id missing (uid=' + user.uid + ')')
          await signOut(auth)
          setState({ user: null, loading: false, role: 'cast', managedStores: [] })
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
