import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) {
    return apiError('Not authenticated', 401)
  }
  return apiSuccess({
    userId: session.userId,
    username: session.username,
    userRole: session.userRole,
    fullName: session.fullName,
  })
}
