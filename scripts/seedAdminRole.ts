/**
 * roles/x_2956697281 に { role: 'admin' } を付与するスクリプト。
 *
 * 実行前準備:
 *   set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\adminsdk.json
 * 実行:
 *   npm run seed:admin
 */

import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({ projectId: 'stellasync-app' })

const db = getFirestore()
const UID = 'x_2956697281'

;(async () => {
  await db.collection('roles').doc(UID).set({ role: 'admin' }, { merge: true })
  const snap = await db.collection('roles').doc(UID).get()
  console.log(`roles/${UID} =`, JSON.stringify(snap.data()))
  console.log('seed:admin 完了')
  process.exit(0)
})()
