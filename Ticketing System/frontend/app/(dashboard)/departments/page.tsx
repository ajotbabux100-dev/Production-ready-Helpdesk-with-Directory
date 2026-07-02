'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Departments management moved to Settings → Departments. This redirect
// keeps old bookmarks/links working.
export default function DepartmentsRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/settings?tab=departments')
  }, [router])
  return null
}
