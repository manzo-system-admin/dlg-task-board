const { logger } = require('firebase-functions')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const admin = require('firebase-admin')
const { createHash } = require('node:crypto')

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

async function sendStoredPush(notificationId, notification) {
  const userRef = db.collection('users').doc(notification.recipientId)
  const userSnapshot = await userRef.get()
  if (!userSnapshot.exists) return { sent: 0 }

  const user = userSnapshot.data() || {}
  const tokenMap = user.messagingTokens || {}
  const tokens = Object.keys(tokenMap).filter(Boolean)
  if (!tokens.length) return { sent: 0 }

  const response = await messaging.sendEachForMulticast({
    tokens,
    data: {
      notificationId,
      type: stringValue(notification.type),
      title: titles[notification.type] || 'DLG Board',
      body: stringValue(notification.text) || 'มีการแจ้งเตือนใหม่',
      taskId: stringValue(notification.taskId),
    },
    webpush: {
      headers: { Urgency: 'high' },
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
}

exports.sendPushNotification = onCall({ region: 'asia-southeast2' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'ต้องเข้าสู่ระบบก่อนส่ง notification')
  const notificationId = request.data?.notificationId
  if (!notificationId) throw new HttpsError('invalid-argument', 'ไม่พบ notificationId')
  const notificationSnapshot = await db.collection('notifications').doc(notificationId).get()
  const notification = notificationSnapshot.data()
  if (!notification?.recipientId) return { sent: 0 }
  if (notification.createdBy !== request.auth.uid) throw new HttpsError('permission-denied', 'ไม่ใช่ผู้สร้าง notification นี้')
  return sendStoredPush(notificationId, notification)
})

async function createDueNotification(taskId, task, recipientId, due, kind) {
  const hash = createHash('sha256').update(JSON.stringify([taskId, recipientId, due, kind])).digest('hex')
  const notificationId = `due-${hash}`
  const notificationRef = db.collection('notifications').doc(notificationId)
  const notification = {
    type: kind,
    text: kind === 'overdue' ? `งาน ${task.title} เลยกำหนดแล้ว` : `งาน ${task.title} ใกล้ถึงกำหนดส่ง`,
    taskId,
    recipientId,
    createdBy: 'system',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
  }
  const created = await db.runTransaction(async (transaction) => {
    if ((await transaction.get(notificationRef)).exists) return false
    transaction.set(notificationRef, notification)
    return true
  })
  if (!created) return false
  try {
    await sendStoredPush(notificationId, notification)
  } catch (error) {
    logger.error('DLG Board deadline push failed', { notificationId, error })
  }
  return true
}

exports.sendDailyDeadlines = onSchedule({
  schedule: '0 9 * * *',
  timeZone: 'Asia/Bangkok',
  region: 'asia-southeast2',
  timeoutSeconds: 540,
}, async () => {
  const [tasksSnapshot, usersSnapshot] = await Promise.all([
    db.collection('tasks').get(),
    db.collection('users').get(),
  ])
  const usersByName = new Map(usersSnapshot.docs.map((doc) => [doc.data().name, doc.id]))
  let created = 0
  for (const taskSnapshot of tasksSnapshot.docs) {
    const task = taskSnapshot.data()
    if (['เสร็จ', 'รูปภาพเสร็จแล้ว', 'Finish', 'Work Done', 'Completed', 'Done'].includes(task.status)) continue
    const due = task.steps?.find((step) => step.status === task.status)?.due || task.due
    if (typeof due !== 'string' || !due) continue
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T23:59:59.999+07:00`) : new Date(due)
    if (Number.isNaN(dueDate.getTime())) continue
    const days = (dueDate.getTime() - Date.now()) / 86400000
    if (days > 3 || days < -1) continue
    const kind = days < 0 ? 'overdue' : 'deadline'
    const recipients = new Set((task.assignees || []).map((name) => usersByName.get(name)).filter(Boolean))
    for (const recipientId of recipients) {
      if (await createDueNotification(taskSnapshot.id, task, recipientId, due, kind)) created += 1
    }
  }
  logger.info('DLG Board daily deadlines checked', { tasks: tasksSnapshot.size, created })
})
