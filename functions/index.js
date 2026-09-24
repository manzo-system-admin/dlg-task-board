const { logger } = require('firebase-functions')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')

admin.initializeApp()

const db = admin.firestore()
const messaging = admin.messaging()

const titles = {
  assignment: 'ได้รับมอบหมายงาน',
  comment: 'มีคอมเมนต์ใหม่',
  mention: 'มีคนแท็กคุณ',
  'task-mention': 'มีการแท็กงาน',
  workflow: 'งานถูกย้ายสถานะ',
  deadline: 'งานใกล้ถึงกำหนดส่ง',
  overdue: 'งานเลยกำหนด',
}

function stringValue(value) {
  return value === undefined || value === null ? '' : String(value)
}

exports.sendPushNotification = onCall({ region: 'asia-southeast2' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'ต้องเข้าสู่ระบบก่อนส่ง notification')
  const notificationId = request.data?.notificationId
  if (!notificationId) throw new HttpsError('invalid-argument', 'ไม่พบ notificationId')
  const notificationSnapshot = await db.collection('notifications').doc(notificationId).get()
  const notification = notificationSnapshot.data()
  if (!notification?.recipientId) return { sent: 0 }
  if (notification.createdBy !== request.auth.uid) throw new HttpsError('permission-denied', 'ไม่ใช่ผู้สร้าง notification นี้')

  const userRef = db.collection('users').doc(notification.recipientId)
  const userSnapshot = await userRef.get()
  if (!userSnapshot.exists) return { sent: 0 }

  const user = userSnapshot.data() || {}
  const tokenMap = user.messagingTokens || {}
  const tokens = Object.keys(tokenMap).filter(Boolean)
  if (!tokens.length) return { sent: 0 }

  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: titles[notification.type] || 'DLG Board',
      body: stringValue(notification.text) || 'มีการแจ้งเตือนใหม่',
    },
    data: {
      notificationId,
      type: stringValue(notification.type),
      title: titles[notification.type] || 'DLG Board',
      body: stringValue(notification.text) || 'มีการแจ้งเตือนใหม่',
      taskId: stringValue(notification.taskId),
    },
    webpush: {
      fcmOptions: {
        link: notification.taskId ? `/?task=${encodeURIComponent(notification.taskId)}` : '/',
      },
    },
  })

  const invalidTokens = []
  response.responses.forEach((result, index) => {
    if (!result.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(result.error?.code)) {
      invalidTokens.push(tokens[index])
    }
  })

  if (invalidTokens.length) {
    const nextTokens = { ...tokenMap }
    invalidTokens.forEach((token) => delete nextTokens[token])
    await userRef.set({ messagingTokens: nextTokens }, { merge: true })
  }

  logger.info('DLG Board push notification sent', {
    notificationId,
    recipientId: notification.recipientId,
    tokenCount: tokens.length,
    successCount: response.successCount,
    failureCount: response.failureCount,
  })
  return { sent: response.successCount, removed: invalidTokens.length }
})
