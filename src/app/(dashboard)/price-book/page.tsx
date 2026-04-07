import { BookOpen, Plus } from 'lucide-react'

export default function PriceBookPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl text-navy-900">Price Book</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage your materials, labour rates, and standard items</p>
        </div>
        <button className="btn-amber">
          <Plus size={16} />
          Add Item
        </button>
      </div>

      <div className="card py-16 text-center">
        <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <h3 className="font-serif text-lg text-gray-700 mb-1">Price Book coming soon</h3>
        <p className="text-gray-500 text-sm">
          Build your catalogue of standard materials, labour rates, and bundled items — then pull them directly into quotes.
        </p>
      </div>
    </div>
  )
}
