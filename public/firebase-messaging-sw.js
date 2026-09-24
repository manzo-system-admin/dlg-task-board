/* Firebase Messaging background handler. The app passes its public Firebase config in the registration URL. */
importScripts('https://www.gstatic.com/firebasejs/12.2.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.2.1/firebase-messaging-compat.js')

const encodedConfig = new URL(self.location.href).searchParams.get('config')
if (encodedConfig) {
  firebase.initializeApp(JSON.parse(atob(encodedConfig)))
  const messaging = firebase.messaging()
  messaging.onBackgroundMessage((payload) => {
    const data = payload.data || {}
    const title = data.title || payload.notification?.title || 'DLG Board'
    const options = { body: data.body || payload.notification?.body || 'มีการแจ้งเตือนใหม่', icon: '/favicon.svg', data: { taskId: data.taskId || '' } }
    self.registration.showNotification(title, options)
  })
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const taskId = event.notification.data?.taskId
  const url = taskId ? `/?task=${encodeURIComponent(taskId)}` : '/'
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
    const existing = windows.find((window) => 'focus' in window)
    if (existing) { await existing.focus(); return taskId ? existing.navigate(url) : existing }
    return clients.openWindow(url)
  }))
})
