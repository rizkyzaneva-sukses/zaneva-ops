'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState, createContext, useContext, useEffect } from 'react'

// ── Auth Context ───────────────────────────────────────
interface CurrentUser {
  userId: string
  username: string
  userRole: 'OWNER' | 'FINANCE' | 'STAFF' | 'EXTERNAL'
  fullName: string | null
}

interface AuthContextType {
  user: CurrentUser | null
  isLoading: boolean
  logout: () => Promise<void>
  refetch: () => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  logout: async () => {},
  refetch: () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

// Permission helpers
export function usePermission() {
  const { user } = useAuth()
  return {
    isOwner: user?.userRole === 'OWNER',
    isFinance: user?.userRole === 'FINANCE',
    isStaff: ['OWNER', 'FINANCE', 'STAFF'].includes(user?.userRole ?? ''),
    canEdit: ['OWNER', 'FINANCE'].includes(user?.userRole ?? ''),
    isExternal: user?.userRole === 'EXTERNAL',
    role: user?.userRole,
  }
}

// ── Providers ──────────────────────────────────────────
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      })
  )

  const [user, setUser] = useState<CurrentUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchMe = async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        setUser(data.data)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchMe()
  }, [])

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    window.location.href = '/login'
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ user, isLoading, logout, refetch: fetchMe }}>
        {children}
      </AuthContext.Provider>
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  )
}
