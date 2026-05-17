import { apiSuccess } from '@/lib/utils'
import { getSession } from '@/lib/session'

export async function POST() {
  const session = await getSession()
  session.destroy()
  return apiSuccess({ message: 'Logged out' })
}
