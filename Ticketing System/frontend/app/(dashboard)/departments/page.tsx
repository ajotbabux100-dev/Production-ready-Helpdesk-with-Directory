'use client'
import { useEffect } from 'react'

// Departments management moved to Settings → Departments. This redirect
// keeps old bookmarks/links working.
export default function DepartmentsRedirect() {
  useEffect(() => {
    window.location.href = '/settings?tab=departments'
  }, [])
  return null
}
