export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <span className="font-serif text-2xl text-white">NorthQuote</span>
          </div>
          <p className="text-navy-300 text-sm">AI-powered quoting for Canadian tradespeople</p>
        </div>
        <div className="card shadow-xl">
          {children}
        </div>
      </div>
    </div>
  )
}
