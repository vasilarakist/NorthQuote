'use client'

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-navy-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">N</span>
          </div>
        </div>
        <h1 className="font-serif text-2xl text-gray-900 mb-2">You&apos;re offline</h1>
        <p className="text-gray-500 text-sm mb-6">
          No internet connection detected. Cached pages are still accessible.
          Any drafts you&apos;ve started will sync automatically when you&apos;re back online.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="btn-primary"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
