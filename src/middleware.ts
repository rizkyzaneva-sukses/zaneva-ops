import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'

// Routes accessible without login
const PUBLIC_ROUTES = [
  '/login',
  '/public-stock',
  '/public-stock-minus',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/public',
  '/api/report/daily',
  '/api/report/cron-telegram',
  '/api/telegram/webhook',     // Telegram bot webhook — diproteksi di dalam handler (whitelist chat ID)
  '/api/telegram/set-webhook', // Setup webhook — diproteksi dengan secret query param
  '/api/telegram/adye-models', // Debug: cek model list Adye
]

// Routes only for OWNER
const OWNER_ONLY = [
  '/owner-room',
  '/audit-logs',
  '/user-management',
  '/data-backup',
  '/api/users',
  '/api/backup',
  '/api/audit',
]

// Routes for OWNER + FINANCE only
const FINANCE_ROUTES = [
  '/payouts',
  '/reports',
  '/stock-opname',
  '/purchase-orders',
  '/vendors',
  '/vendor-payments',
  '/procurement',
  '/finance',
  '/utang-piutang',
  '/master-products',
  '/master-categories',
  '/alerts',
  '/api/payouts',
  '/api/wallet',
  '/api/purchase-orders',
  '/api/vendors',
  '/api/vendor-payments',
  '/api/procurement',
  '/api/finance',
  '/api/opname',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public routes
  const isPublic = PUBLIC_ROUTES.some(r => pathname.startsWith(r))
  if (isPublic) return NextResponse.next()

  // Get session
  const response = NextResponse.next()
  const session = await getIronSession<SessionData>(request, response, sessionOptions)

  // Not logged in → redirect to login
  if (!session.isLoggedIn) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const { userRole } = session

  // EXTERNAL users can only access external inventory
  if (userRole === 'EXTERNAL' && !pathname.startsWith('/external-inventory')) {
    return NextResponse.redirect(new URL('/external-inventory', request.url))
  }

  // OWNER only routes
  const isOwnerOnly = OWNER_ONLY.some(r => pathname.startsWith(r))
  if (isOwnerOnly && userRole !== 'OWNER') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // FINANCE routes (OWNER + FINANCE only)
  const isFinanceRoute = FINANCE_ROUTES.some(r => pathname.startsWith(r))
  if (isFinanceRoute && !['OWNER', 'FINANCE'].includes(userRole)) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|images).*)',
  ],
}
