'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/toaster'
import { Image as ImageIcon, Loader2, MessageSquarePlus, Trash2, CheckCircle, Circle, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'

// ── Image Lightbox ────────────────────────────────────────────────
function ImageLightbox({
  images,
  startIndex,
  onClose,
}: {
  images: string[]
  startIndex: number
  onClose: () => void
}) {
  const [idx, setIdx] = useState(startIndex)
  const prev = () => setIdx(i => Math.max(0, i - 1))
  const next = () => setIdx(i => Math.min(images.length - 1, i + 1))

  // keyboard navigation
  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') prev()
    else if (e.key === 'ArrowRight') next()
    else if (e.key === 'Escape') onClose()
  }, [images.length])

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={handleKey}
      tabIndex={0}
      style={{ outline: 'none' }}
    >
      {/* Close */}
      <button
        className="absolute top-4 right-4 p-2 rounded-full bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors z-10"
        onClick={onClose}
      >
        <X size={20} />
      </button>

      {/* Counter */}
      {images.length > 1 && (
        <p className="absolute top-4 left-1/2 -translate-x-1/2 text-xs text-zinc-400 bg-zinc-800/80 px-3 py-1 rounded-full">
          {idx + 1} / {images.length}
        </p>
      )}

      {/* Prev */}
      {idx > 0 && (
        <button
          className="absolute left-4 p-2 rounded-full bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors z-10"
          onClick={(e) => { e.stopPropagation(); prev() }}
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {/* Image */}
      <img
        src={images[idx]}
        alt={`Attachment ${idx + 1}`}
        className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Next */}
      {idx < images.length - 1 && (
        <button
          className="absolute right-4 p-2 rounded-full bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors z-10"
          onClick={(e) => { e.stopPropagation(); next() }}
        >
          <ChevronRight size={24} />
        </button>
      )}
    </div>
  )
}

export default function SuggestRevisionPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [images, setImages] = useState<string[]>([])
  
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Lightbox state
  const [lightboxImages, setLightboxImages] = useState<string[] | null>(null)
  const [lightboxIdx, setLightboxIdx] = useState(0)
  
  const { data: revisions, isLoading } = useQuery({
    queryKey: ['revisions'],
    queryFn: () => fetch('/api/revisions').then(r => r.json()).then(d => d.data ?? [])
  })

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile()
        if (file) {
          const reader = new FileReader()
          reader.onload = (event) => {
            if (event.target?.result) {
              setImages(prev => [...prev, event.target!.result as string])
            }
          }
          reader.readAsDataURL(file)
        }
      }
    }
  }, [])

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      toast({ title: 'Judul Wajib Diisi', type: 'error' })
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/revisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          imagesBase64: images
        })
      })
      if (!res.ok) throw new Error('Gagal menambah revisi')
      
      toast({ title: 'Sukses Menambah Revisi', type: 'success' })
      setTitle('')
      setDescription('')
      setImages([])
      qc.invalidateQueries({ queryKey: ['revisions'] })
    } catch (err: any) {
      toast({ title: err.message, type: 'error' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'PENDING' ? 'COMPLETED' : 'PENDING'
    
    // Optimistic update
    qc.setQueryData(['revisions'], (old: any[]) => 
      old?.map(r => r.id === id ? { ...r, status: newStatus } : r)
    )

    try {
      const res = await fetch('/api/revisions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus })
      })
      if (!res.ok) throw new Error('Gagal update status')
    } catch (err: any) {
      toast({ title: err.message, type: 'error' })
      qc.invalidateQueries({ queryKey: ['revisions'] })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus saran revisi ini?')) return
    
    try {
      const res = await fetch(`/api/revisions?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Gagal menghapus')
      qc.invalidateQueries({ queryKey: ['revisions'] })
      toast({ title: 'Sukses menghapus', type: 'success' })
    } catch (err: any) {
      toast({ title: err.message, type: 'error' })
    }
  }

  const openLightbox = (imgs: string[], idx: number) => {
    setLightboxImages(imgs)
    setLightboxIdx(idx)
  }

  const pendingRevs = revisions?.filter((r: any) => r.status === 'PENDING') || []
  const completedRevs = revisions?.filter((r: any) => r.status === 'COMPLETED') || []

  return (
    <AppLayout>
      {/* Lightbox */}
      {lightboxImages && (
        <ImageLightbox
          images={lightboxImages}
          startIndex={lightboxIdx}
          onClose={() => setLightboxImages(null)}
        />
      )}

      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><MessageSquarePlus size={22} className="text-emerald-400"/>Suggest Revision</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form area */}
        <div className="lg:col-span-1 border border-zinc-800 rounded-xl bg-zinc-900 overflow-hidden h-fit">
          <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-900/50">
            <h2 className="text-sm font-semibold text-zinc-100">Tambah Revisi Baru</h2>
            <p className="text-xs text-zinc-500 mt-1">Kamu bisa Paste (CTRL+V) screenshot langsung ke form ini.</p>
          </div>
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Judul Revisi / Fitur *</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Cth: Laporan Neraca belum sync..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Deskripsi Tambahan</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                onPaste={handlePaste}
                placeholder="Jelaskan secara detail... (Bisa CTRL+V gambar di sini)"
                rows={4}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 resize-none"
              />
            </div>
            
            {images.length > 0 && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-400">Attachments ({images.length})</label>
                <div className="grid grid-cols-2 gap-2">
                  {images.map((img, i) => (
                    <div key={i} className="relative group rounded-md border border-zinc-700 overflow-hidden bg-zinc-800 aspect-video">
                      <img
                        src={img}
                        alt="Pasted attachment"
                        className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => openLightbox(images, i)}
                      />
                      <button 
                        type="button" 
                        onClick={() => removeImage(i)}
                        className="absolute top-1 right-1 bg-red-500/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button 
              type="submit" 
              disabled={isSubmitting || !title.trim()}
              className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <MessageSquarePlus size={16} />}
              Submit Saran
            </button>
          </form>
        </div>

        {/* List area */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Pending */}
          <div>
            <h3 className="text-sm font-medium text-amber-400 mb-3 flex items-center gap-2">
              <Circle size={16} /> Belum Dikerjakan ({pendingRevs.length})
            </h3>
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-zinc-500" /></div>
            ) : pendingRevs.length === 0 ? (
              <div className="p-6 border border-dashed border-zinc-800 rounded-xl text-center">
                <p className="text-sm text-zinc-500">Belum ada saran revisi yang tertinggal.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingRevs.map((rev: any) => (
                  <RevisionCard key={rev.id} rev={rev} onToggle={toggleStatus} onDelete={handleDelete} onOpenLightbox={openLightbox} />
                ))}
              </div>
            )}
          </div>

          {/* Completed */}
          {completedRevs.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-emerald-400 mb-3 flex items-center gap-2 mt-8">
                <CheckCircle size={16} /> Selesai ({completedRevs.length})
              </h3>
              <div className="space-y-3 opacity-60 hover:opacity-100 transition-opacity">
                {completedRevs.map((rev: any) => (
                  <RevisionCard key={rev.id} rev={rev} onToggle={toggleStatus} onDelete={handleDelete} onOpenLightbox={openLightbox} />
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </AppLayout>
  )
}

function RevisionCard({
  rev,
  onToggle,
  onDelete,
  onOpenLightbox,
}: {
  rev: any
  onToggle: (id: string, st: string) => void
  onDelete: (id: string) => void
  onOpenLightbox: (imgs: string[], idx: number) => void
}) {
  const isCompleted = rev.status === 'COMPLETED'
  return (
    <div className={`border rounded-xl p-4 transition-colors ${isCompleted ? 'border-emerald-900/30 bg-emerald-900/10' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'}`}>
      <div className="flex items-start gap-3">
        <button 
          onClick={() => onToggle(rev.id, rev.status)}
          className={`mt-1 rounded-full shrink-0 ${isCompleted ? 'text-emerald-500' : 'text-zinc-500 hover:text-emerald-400'} transition-colors`}
        >
          {isCompleted ? <CheckCircle size={20} /> : <Circle size={20} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-4">
            <h4 className={`text-base font-medium ${isCompleted ? 'text-zinc-400 line-through' : 'text-zinc-100'}`}>{rev.title}</h4>
            <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded text-zinc-500 shrink-0 whitespace-nowrap">{formatDate(rev.createdAt)}</span>
          </div>
          
          {rev.description && (
            <p className={`text-sm mt-2 whitespace-pre-wrap ${isCompleted ? 'text-zinc-500' : 'text-zinc-400'}`}>{rev.description}</p>
          )}

          {rev.imagesBase64?.length > 0 && (
            <div className="mt-4 flex gap-2 overflow-auto pb-2 custom-scrollbar">
              {rev.imagesBase64.map((img: string, i: number) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onOpenLightbox(rev.imagesBase64, i)}
                  className="shrink-0 focus:outline-none"
                >
                  <img
                    src={img}
                    alt="Attachment"
                    className="h-24 w-auto rounded border border-zinc-700 hover:opacity-80 hover:border-emerald-500/50 transition-all cursor-pointer"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
        
        <button 
          onClick={() => onDelete(rev.id)}
          className="text-zinc-600 hover:text-red-400 transition-colors p-1"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}
