import type { NotificationItem } from '../types'
import { createId } from '../utils/ids'

export const createNotification = (title: string, message: string, type: NotificationItem['type'] = 'info'): NotificationItem => ({
  id: createId('notification'),
  type,
  title,
  message,
  createdAt: new Date().toISOString(),
  read: false,
})
