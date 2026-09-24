import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { auth, db, functions, storage } from './firebase'
import { httpsCallable } from 'firebase/functions'

async function sendPushNotification(notificationId) {
  if (!functions || !notificationId) return
  try {
    await httpsCallable(functions, 'sendPushNotification')({ notificationId })
  } catch (error) {
    console.warn('push notification unavailable', error)
  }
}

export function subscribeTasks(board, onData, onError) {
  if (!db) return () => {}
  const taskQuery = query(collection(db, 'tasks'), where('board', '==', board), orderBy('createdAt', 'desc'))
  return onSnapshot(taskQuery, (snapshot) => onData(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }))), onError)
}

export function subscribeAllTasks(onData, onError) {
  if (!db) return () => {}
  const taskQuery = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'))
  return onSnapshot(taskQuery, (snapshot) => onData(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }))), onError)
}

export function subscribeNotifications(userId, onData, onError) {
  if (!db) return () => {}
  const notificationQuery = query(collection(db, 'notifications'), where('recipientId', '==', userId), limit(20))
  return onSnapshot(notificationQuery, (snapshot) => onData(snapshot.docs.map((item) => ({ ...item.data(), id: item.id })).sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt))), onError)
}

export async function createTask(task) {
  if (!db) return { id: `demo-${Date.now()}`, ...task }
  const { id: _clientId, ...taskData } = task
  return addDoc(collection(db, 'tasks'), { ...taskData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
}

function timestampMillis(value) {
  if (!value) return 0
  if (typeof value.toMillis === 'function') return value.toMillis()
  if (typeof value.toDate === 'function') return value.toDate().getTime()
  if (typeof value === 'object' && value.seconds) return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000)
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

export async function createActivityLog(activity) {
  if (!db) return { id: `activity-${Date.now()}`, ...activity }
  return addDoc(collection(db, 'activityLogs'), { ...activity, createdAt: serverTimestamp() })
}

export function subscribeTaskActivity(taskId, onData, onError) {
  if (!db || !taskId) return () => {}
  return onSnapshot(query(collection(db, 'activityLogs'), where('taskId', '==', taskId), limit(50)), (snapshot) => onData(snapshot.docs.map((item) => ({ ...item.data(), id: item.id })).sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt))), onError)
}

export async function updateTask(taskId, patch) {
  if (!db) return
  const cleanPatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined))
  await updateDoc(doc(db, 'tasks', taskId), { ...cleanPatch, updatedAt: serverTimestamp() })
}

export async function deleteTask(taskId) {
  if (!db) return
  await deleteDoc(doc(db, 'tasks', taskId))
}

export async function deleteFileLink(linkId) {
  if (!db) return
  await deleteDoc(doc(db, 'fileLinks', linkId))
}

export async function upsertUserProfile(user, profile = {}) {
  if (!db || !user?.uid) return
  await setDoc(doc(db, 'users', user.uid), { uid: user.uid, name: user.displayName || user.email?.split('@')[0] || 'Workspace member', email: user.email || '', photoURL: user.photoURL || '', ...profile, updatedAt: serverTimestamp() }, { merge: true })
}

export async function saveMessagingToken(userId, token) {
  if (!db || !userId || !token) return
  await setDoc(doc(db, 'users', userId), { messagingTokens: { [token]: true }, updatedAt: serverTimestamp() }, { merge: true })
}

export function subscribeUsers(onData, onError) {
  if (!db) return () => {}
  return onSnapshot(query(collection(db, 'users'), orderBy('name')), (snapshot) => onData(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }))), onError)
}

export async function addTaskComment(taskId, comment, recipients = []) {
  if (!db) return
  await updateDoc(doc(db, 'tasks', taskId), { comments: arrayUnion(comment), updatedAt: serverTimestamp() })
  await Promise.all(recipients.map(async (recipient) => {
    const notification = await addDoc(collection(db, 'notifications'), { type: 'comment', text: `มีคอมเมนต์ใหม่ในงาน ${comment.taskTitle || taskId}`, taskId, recipientId: recipient.uid, createdBy: auth?.currentUser?.uid || '', createdAt: serverTimestamp(), read: false })
    await sendPushNotification(notification.id)
  }))
}

export async function deleteTaskComment(taskId, comment) {
  if (!db || !taskId || !comment) return
  await updateDoc(doc(db, 'tasks', taskId), { comments: arrayRemove(comment), updatedAt: serverTimestamp() })
}

export function getMentionNotifications(taskId, taskTitle, text, author, users = [], tasks = []) {
  const people = [...new Set((text.match(/@\[[^\]]+\]|@[\w.-]+/gu) || []).map((item) => item.replace(/^@\[|^@|\]$/g, '').trim()).filter(Boolean))]
  const taskIds = [...new Set((text.match(/#\[[^\]]+\]|#(?:[\w.-]+)|\[\[[^\]]+\]\]/gu) || []).map((item) => item.replace(/^#\[|^#|^\[\[/, '').replace(/\]\]$|\]$/, '').trim()).filter(Boolean))]
  const personNotifications = people.map((person) => { const user = users.find((item) => item.name === person); return { type: 'mention', text: `${author} แท็กคุณในงาน ${taskTitle}`, recipient: person, recipientId: user?.uid || user?.id, taskId } })
  const taskNotifications = taskIds.flatMap((mentionedTaskId) => {
    const mentionedTask = tasks.find((item) => item.id === mentionedTaskId || item.title === mentionedTaskId)
    const recipients = (mentionedTask?.assignees || []).map((assignee) => users.find((user) => user.name === assignee || user.uid === assignee || user.id === assignee)).filter((user) => user?.uid || user?.id)
    return recipients.map((user) => ({ type: 'task-mention', text: `${author} แท็กงาน ${mentionedTask.title || mentionedTaskId} จาก ${taskTitle}`, recipient: user.name, recipientId: user.uid || user.id, recipientTaskId: mentionedTaskId, taskId }))
  })
  const byRecipient = new Map()
  for (const notification of [...personNotifications, ...taskNotifications]) {
    if (notification.recipientId && notification.recipientId !== auth?.currentUser?.uid && !byRecipient.has(notification.recipientId)) byRecipient.set(notification.recipientId, notification)
  }
  return [...byRecipient.values()]
}

export async function notifyMentions(taskId, taskTitle, text, author, users = [], tasks = []) {
  const notifications = getMentionNotifications(taskId, taskTitle, text, author, users, tasks)
  if (!db) return notifications
  await Promise.all(notifications.map(async (notification) => {
    const saved = await addDoc(collection(db, 'notifications'), { ...notification, createdBy: auth?.currentUser?.uid || '', createdAt: serverTimestamp(), read: false })
    await sendPushNotification(saved.id)
  }))
  return notifications
}

export async function moveTask(taskId, status, recipients = [], due = undefined) {
  if (!db) return
  await updateDoc(doc(db, 'tasks', taskId), { status, ...(due !== undefined ? { due } : {}), updatedAt: serverTimestamp() })
  await Promise.all(recipients.map(async (recipient) => {
    const notification = await addDoc(collection(db, 'notifications'), { type: 'workflow', text: `งานถูกย้ายไป ${status}`, taskId, recipientId: recipient.uid, createdBy: auth?.currentUser?.uid || '', createdAt: serverTimestamp(), read: false })
    await sendPushNotification(notification.id)
  }))
}

export async function createNotification(notification) {
  if (!db) return
  if (!notification.recipientId) return
  const saved = await addDoc(collection(db, 'notifications'), { ...notification, createdBy: auth?.currentUser?.uid || '', createdAt: serverTimestamp(), read: false })
  await sendPushNotification(saved.id)
}

export async function markNotificationRead(notificationId) {
  if (!db || !notificationId) return
  await updateDoc(doc(db, 'notifications', notificationId), { read: true, readAt: serverTimestamp() })
}

export async function uploadTaskImage(file, taskId) {
  if (!storage) return URL.createObjectURL(file)
  const imageRef = ref(storage, `tasks/${taskId}/${Date.now()}-${file.name}`)
  await uploadBytes(imageRef, file)
  return getDownloadURL(imageRef)
}

export async function uploadCommentFile(file, taskId) {
  if (!file || !taskId) return null
  if (!storage) return { name: file.name, url: URL.createObjectURL(file), type: file.type, size: file.size }
  const safeName = file.name.replace(/[\\/#?%*:|"<>]/g, '_')
  const fileRef = ref(storage, `tasks/${taskId}/comments/${Date.now()}-${safeName}`)
  let lastError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { await uploadBytes(fileRef, file, { contentType: file.type || 'application/octet-stream' }); lastError = null; break } catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1))) }
  }
  if (lastError) throw lastError
  return { name: file.name, url: await getDownloadURL(fileRef), type: file.type, size: file.size }
}

export function subscribeFileLinks(onData, onError) {
  if (!db) return () => {}
  const linksQuery = query(collection(db, 'fileLinks'), orderBy('createdAt', 'desc'))
  return onSnapshot(linksQuery, (snapshot) => onData(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }))), onError)
}

export function subscribeFolders(onData, onError) {
  if (!db) return () => {}
  return onSnapshot(query(collection(db, 'fileFolders'), orderBy('createdAt', 'asc')), (snapshot) => onData(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }))), onError)
}

export async function createFolder(folder) {
  if (!db) return { id: `demo-folder-${Date.now()}`, ...folder }
  return addDoc(collection(db, 'fileFolders'), { ...folder, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
}

export async function updateFileLink(linkId, patch) {
  if (!db || !linkId) return
  await updateDoc(doc(db, 'fileLinks', linkId), { ...patch, updatedAt: serverTimestamp() })
}

export async function deleteFolder(folderId) {
  if (!db || !folderId) return
  const snapshot = await getDocs(collection(db, 'fileFolders'))
  await Promise.all(snapshot.docs.filter((item) => item.data().path === folderId || item.data().path?.startsWith(`${folderId}/`)).map((item) => deleteDoc(item.ref)))
}

export async function createFileLink(link) {
  if (!db) return { id: `demo-link-${Date.now()}`, ...link }
  return addDoc(collection(db, 'fileLinks'), { ...link, createdAt: serverTimestamp() })
}
