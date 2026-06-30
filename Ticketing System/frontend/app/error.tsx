'use client'
import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Unhandled error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h1>
        <p className="text-gray-400 text-sm mb-6">
          An unexpected error occurred. Please try again or contact your administrator if the issue persists.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="bg-blue-900 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-blue-800 transition-colors"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="border border-gray-200 text-gray-700 text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Go to Dashboard
          </a>
        </div>
        {error?.digest && (
          <p className="text-xs text-gray-300 mt-6 font-mono">Error ID: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
