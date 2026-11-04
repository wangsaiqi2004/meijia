"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoaderCircle } from 'lucide-react'
import { NailShell } from '@/components/nail/nail-shell'
import { nailFetch, type NailUser } from '@/lib/nail/client'

export function NailPageFrame({ children, roles }: { children: (user: NailUser) => React.ReactNode; roles?: NailUser['role'][] }) {
  const router = useRouter()
  const roleKey = roles?.join(',') || ''
  const [user, setUser] = useState<NailUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    void nailFetch<{ user: NailUser | null }>('/api/nail/auth/me').then(({ user: current }) => {
      if (!active) return
      if (!current) {
        router.replace('/login')
        return
      }
      const allowed = roleKey ? roleKey.split(',') : []
      if (allowed.length && !allowed.includes(current.role)) {
        router.replace(current.role === 'admin' ? '/admin' : '/')
        return
      }
      setUser(current)
      setLoading(false)
    }).catch(() => {
      if (active) router.replace('/login')
    })
    return () => { active = false }
  }, [roleKey, router])

  if (loading || !user) {
    return <div className="grid min-h-dvh place-items-center bg-[#f3f5f2] text-[#718077]"><LoaderCircle className="size-5 animate-spin" /></div>
  }

  return <NailShell user={user}>{children(user)}</NailShell>
}
