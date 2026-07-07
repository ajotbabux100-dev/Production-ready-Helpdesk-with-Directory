
export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-8xl font-black text-blue-900/10 select-none">404</p>
        <h1 className="text-2xl font-bold text-gray-900 -mt-4 mb-2">Page not found</h1>
        <p className="text-gray-400 text-sm mb-8">The page you're looking for doesn't exist or has been moved.</p>
        <a
          href="/dashboard"
          className="inline-flex items-center gap-2 bg-blue-900 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-blue-800 transition-colors"
        >
          Back to Dashboard
        </a>
      </div>
    </div>
  )
}
