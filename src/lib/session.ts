import { getIronSession, IronSession, SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export interface SessionData {
  userId: string
  username: string
  userRole: 'OWNER' | 'FINANCE' | 'STAFF' | 'EXTERNAL'
  fullName: string | null
  isLoggedIn: boolean
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET as string,
  cookieName: 'elyasr-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies()
  return getIronSession<SessionData>(cookieStore, sessionOptions)
}

export async function getSessionFromRequest(
  req: NextRequest
): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(req, NextResponse.next(), sessionOptions)
}

// Helper: get current user from session (for Server Components)
export async function getCurrentUser() {
  const session = await getSession()
  if (!session.isLoggedIn) return null
  return {
    userId: session.userId,
    username: session.username,
    userRole: session.userRole,
    fullName: session.fullName,
  }
}

// Permission helpers
export const Roles = {
  OWNER: 'OWNER',
  FINANCE: 'FINANCE',
  STAFF: 'STAFF',
  EXTERNAL: 'EXTERNAL',
} as const

export type UserRole = keyof typeof Roles

export function isOwner(role?: string) {
  return role === 'OWNER'
}

export function canEdit(role?: string) {
  return role === 'OWNER' || role === 'FINANCE'
}

export function isStaff(role?: string) {
  return ['OWNER', 'FINANCE', 'STAFF'].includes(role ?? '')
}

export function canAccess(role?: string, allowedRoles: string[] = []) {
  return allowedRoles.includes(role ?? '')
}
