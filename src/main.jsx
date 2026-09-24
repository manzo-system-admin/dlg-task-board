import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlignLeft,
  Bell,
  Bold,
  CalendarDays,
  Check,
  ClipboardList,
  ExternalLink,
  FileText,
  FolderKanban,
  FolderPlus,
  Italic,
  LayoutDashboard,
  Link2,
  List,
  ListFilter,
  ListOrdered,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Plus,
  Redo2,
  Search,
  Settings2,
  Sparkles,
  Tag,
  Undo2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { boardConfigs } from "./data";
import {
  firebaseEnabled,
  setupWebPush,
  signInWithGoogle,
  signOutUser,
  subscribeAuth,
  updateGoogleProfile,
} from "./firebase";
import {
  addTaskComment,
  createActivityLog,
  createFileLink,
  createFolder,
  createNotification,
  createTask,
  deleteFileLink,
  deleteFolder,
  deleteTask,
  deleteTaskComment,
  markNotificationRead,
  moveTask,
  notifyMentions,
  saveMessagingToken,
  subscribeAllTasks,
  subscribeFileLinks,
  subscribeFolders,
  subscribeNotifications,
  subscribeTaskActivity,
  subscribeUsers,
  updateFileLink,
  updateTask,
  uploadCommentFile,
  uploadTaskImage,
  upsertUserProfile,
} from "./services";
import "./styles.css";
import "./extended.css";
import "./rich-editor.css";

const navItems = [
  { label: "ภาพรวม", icon: LayoutDashboard },
  { label: "บอร์ดงาน", icon: FolderKanban },
  { label: "งานทั้งหมด", icon: ClipboardList },
  { label: "ปฏิทิน", icon: CalendarDays },
  { label: "ไฟล์และลิงก์", icon: Link2 },
];

function normalizeTask(task) {
  const { __editing, ...storedTask } = task || {};
  return {
    ...storedTask,
    assignees:
      storedTask.assignees ||
      (storedTask.assignee ? [storedTask.assignee] : []),
    comments: Array.isArray(storedTask.comments) ? storedTask.comments : [],
    activity: Array.isArray(storedTask.activity) ? storedTask.activity : [],
    images: Array.isArray(storedTask.images) ? storedTask.images : [],
    tags: storedTask.tags || (storedTask.tag ? [storedTask.tag] : []),
    department: storedTask.department || storedTask.board,
    steps: storedTask.steps || [],
  };
}
function descriptionPreview(value) {
  if (!value) return "";
  const container = document.createElement("div");
  container.innerHTML = String(value);
  return (container.textContent || container.innerText || "")
    .replace(/\s+/g, " ")
    .trim();
}
function renderCommentText(value) {
  return String(value || "")
    .split(/(@\[[^\]]+\]|#\[[^\]]+\]|\[\[[^\]]+\]\])/g)
    .map((part, index) => {
      if (/^@\[/.test(part))
        return (
          <span className="mention-token person" key={`${part}-${index}`}>
            {part}
          </span>
        );
      if (/^#\[|^\[\[/.test(part))
        return (
          <span className="mention-token task" key={`${part}-${index}`}>
            {part}
          </span>
        );
      return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
    });
}
function parseDue(value) {
  if (!value || value === "ยังไม่กำหนด") return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "object" && value.seconds)
    return new Date(
      value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000),
    );
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function dueAtEndOfDay(value) {
  const parsed = parseDue(value);
  if (!parsed) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate(),
      23,
      59,
      59,
      999,
    );
  }
  return parsed;
}
function relativeTime(value) {
  const date = parseDue(value);
  if (!date) return "";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 60000),
  );
  if (minutes < 1) return "เมื่อสักครู่นี้";
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return `${Math.floor(hours / 24)} วันที่แล้ว`;
}
function currentStepDue(task) {
  return (
    task.steps?.find((step) => step.status === task.status)?.due ||
    task.due ||
    ""
  );
}
function deadlineState(task) {
  const due = dueAtEndOfDay(currentStepDue(task));
  if (
    !due ||
    ["เสร็จ", "รูปภาพเสร็จแล้ว", "Finish", "Work Done", "Completed"].includes(
      task.status,
    )
  )
    return "";
  const days = (due.getTime() - Date.now()) / 86400000;
  if (days < 0) return "overdue";
  if (days <= 3) return "soon";
  return "";
}
function isOverdue(task) {
  const due = dueAtEndOfDay(currentStepDue(task));
  return Boolean(
    due &&
    due < new Date() &&
    !["เสร็จ", "รูปภาพเสร็จแล้ว", "Finish", "Work Done", "Completed"].includes(
      task.status,
    ),
  );
}
function BrandMark() {
  return (
    <div className="brand-mark centered">
      <span>D</span>
      <div>
        <strong>DLG Board</strong>
        <small>เราคือทีม</small>
      </div>
    </div>
  );
}
function UserAvatar({ src, name, className }) {
  const [failed, setFailed] = useState(false);
  const normalized =
    src && src.includes("googleusercontent.com") && !src.includes("=")
      ? `${src}=s96-c`
      : src;
  return (
    <div className={className}>
      {normalized && !failed ? (
        <img
          src={normalized}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        name?.[0] || "G"
      )}
    </div>
  );
}
function FirebaseSetupScreen() {
  return (
    <div className="auth-screen">
      <div className="auth-grid" />
      <div className="auth-card">
        <BrandMark />
        <div className="auth-copy">
          <span>FIREBASE CONNECTION REQUIRED</span>
          <h1>
            ยังไม่ได้เชื่อมต่อ
            <br />
            ข้อมูลจริง
          </h1>
          <p>
            เพิ่มค่า VITE_FIREBASE_* ในไฟล์ .env แล้วเปิด Google Authentication,
            Firestore และ Storage ก่อนใช้งาน
          </p>
        </div>
        <small className="auth-note">ระบบจะไม่แสดงข้อมูลตัวอย่าง</small>
      </div>
    </div>
  );
}
function LoginScreen({ onLogin, error }) {
  return (
    <div className="auth-screen">
      <div className="auth-grid" />
      <div className="auth-card">
        <BrandMark />
        <div className="auth-copy">
          <span>TEAM OPERATING SYSTEM</span>
          <h1>
            งานที่ชัดเจน
            <br />
            ทำให้ทีมไปได้ไกล
          </h1>
          <p>พื้นที่กลางสำหรับวางแผน ผลิต และส่งมอบงานของทุกแผนก</p>
        </div>
        <button className="google-button" onClick={onLogin}>
          <span>G</span>เข้าสู่ระบบด้วย Google
        </button>
        {error && <p className="auth-error">{error}</p>}
        <small className="auth-note">
          ใช้บัญชี Google ขององค์กรเพื่อเข้าใช้งาน workspace
        </small>
      </div>
    </div>
  );
}

function App() {
  const [activeNav, setActiveNav] = useState("บอร์ดงาน"),
    [activeBoard, setActiveBoard] = useState("artwork"),
    [viewMode, setViewMode] = useState("board");
  const [tasks, setTasks] = useState([]),
    [search, setSearch] = useState(""),
    [tagFilter, setTagFilter] = useState("ทุก tag"),
    [assignee, setAssignee] = useState("ทุกคน"),
    [statusFilter, setStatusFilter] = useState("ทุกสถานะ"),
    [departmentFilter, setDepartmentFilter] = useState("ทุกแผนก"),
    [dateFrom, setDateFrom] = useState(""),
    [dateTo, setDateTo] = useState(""),
    [deadlineFilter, setDeadlineFilter] = useState("ทั้งหมด");
  const [selectedTask, setSelectedTask] = useState(null),
    [showCreate, setShowCreate] = useState(false),
    [notificationOpen, setNotificationOpen] = useState(false),
    [notifications, setNotifications] = useState([]);
  const [files, setFiles] = useState([]),
    [folders, setFolders] = useState([]),
    [showFileModal, setShowFileModal] = useState(false),
    [authUser, setAuthUser] = useState(null),
    [users, setUsers] = useState([]),
    [showProfile, setShowProfile] = useState(false),
    [authLoading, setAuthLoading] = useState(firebaseEnabled),
    [authError, setAuthError] = useState("");
  const deadlineNotified = useRef(new Set());
  const notificationSnapshotReady = useRef(false);
  const board = boardConfigs[activeBoard];
  useEffect(
    () =>
      subscribeAuth((user) => {
        setAuthUser(user);
        setAuthLoading(false);
        if (user) upsertUserProfile(user);
      }),
    [],
  );
  useEffect(
    () =>
      subscribeUsers(
        (remote) => setUsers(remote),
        (error) => console.warn("users subscription unavailable", error),
      ),
    [],
  );
  useEffect(
    () =>
      subscribeAllTasks(
        (remote) => setTasks(remote.map(normalizeTask)),
        (error) => console.warn("tasks subscription unavailable", error),
      ),
    [],
  );
  useEffect(() => {
    const taskId = new URLSearchParams(window.location.search).get("task");
    if (!taskId) return;
    const task = tasks.find((item) => item.id === taskId);
    if (task) {
      setActiveBoard(task.board || task.department || "artwork");
      setActiveNav("บอร์ดงาน");
      setSelectedTask(task);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [tasks]);
  useEffect(
    () =>
      authUser?.uid
        ? subscribeNotifications(
            authUser.uid,
            (remote) => setNotifications(remote),
            (error) =>
              console.warn("notifications subscription unavailable", error),
          )
        : () => {},
    [authUser?.uid],
  );
  useEffect(() => {
    const unread = notifications.filter((item) => !item.read).length;
    document.title = unread ? `DLG Board (${unread})` : "DLG Board";
  }, [notifications]);
  useEffect(() => {
    let unsubscribe = () => {};
    if (!authUser?.uid) return () => {};
    setupWebPush((payload) => {
      const title =
        payload.notification?.title || payload.data?.title || "DLG Board";
      const body =
        payload.notification?.body ||
        payload.data?.body ||
        "มีการแจ้งเตือนใหม่";
      if (Notification.permission === "granted")
        new Notification(title, { body, icon: "/favicon.svg" });
    })
      .then(({ token, unsubscribe: stop }) => {
        unsubscribe = stop;
        if (token) saveMessagingToken(authUser.uid, token);
      })
      .catch((error) => console.warn("web push setup unavailable", error));
    return () => unsubscribe();
  }, [authUser?.uid]);
  useEffect(() => {
    if (!authUser?.uid) return;
    if (!notificationSnapshotReady.current) {
      notificationSnapshotReady.current = true;
      return;
    }
    notifications
      .filter((item) => !item.read && item.createdAt)
      .slice(0, 1)
      .forEach((item) => {
        if (
          Notification.permission === "granted" &&
          document.visibilityState !== "visible"
        )
          new Notification("DLG Board", {
            body: item.text,
            icon: "/favicon.svg",
          });
      });
  }, [notifications, authUser?.uid]);
  useEffect(() => subscribeFileLinks((remote) => setFiles(remote)), []);
  useEffect(
    () =>
      subscribeFolders(
        (remote) => setFolders(remote.map((item) => item.path).filter(Boolean)),
        (error) => console.warn("folders subscription unavailable", error),
      ),
    [],
  );
  useEffect(() => {
    if (!authUser?.uid || !tasks.length || !users.length) return;
    tasks.forEach((task) => {
      const due = dueAtEndOfDay(task.due);
      if (
        !due ||
        [
          "เสร็จ",
          "รูปภาพเสร็จแล้ว",
          "Finish",
          "Work Done",
          "Completed",
        ].includes(task.status)
      )
        return;
      const days = (due.getTime() - Date.now()) / 86400000;
      const kind = days < 0 ? "overdue" : "deadline";
      if (days > 3) return;
      recipientsForTask(task).forEach((recipient) => {
        const key = `${task.id}:${recipient.uid}:${task.due}:${kind}`;
        if (deadlineNotified.current.has(key)) return;
        deadlineNotified.current.add(key);
        createNotification({
          type: kind,
          text:
            kind === "overdue"
              ? `งาน ${task.title} เลยกำหนดแล้ว`
              : `งาน ${task.title} ใกล้ถึงกำหนดส่ง`,
          taskId: task.id,
          recipientId: recipient.uid,
        });
      });
    });
  }, [tasks, users, authUser?.uid]);
  const allFiltered = useMemo(
    () =>
      tasks.filter((task) => {
        const due = parseDue(currentStepDue(task));
        const deadlineDue = dueAtEndOfDay(currentStepDue(task));
        const searchHit =
          !search ||
          `${task.title} ${task.tag} ${(task.tags || []).join(" ")} ${task.description}`
            .toLowerCase()
            .includes(search.toLowerCase());
        const dateHit =
          (!dateFrom || (due && due >= new Date(`${dateFrom}T00:00:00`))) &&
          (!dateTo || (due && due <= new Date(`${dateTo}T23:59:59`)));
        const deadlineHit =
          deadlineFilter === "ทั้งหมด" ||
          (deadlineFilter === "ใกล้ครบกำหนด" &&
            deadlineDue &&
            deadlineDue >= new Date() &&
            deadlineDue <= new Date(Date.now() + 3 * 86400000)) ||
          (deadlineFilter === "เลยกำหนด" && isOverdue(task));
        return (
          searchHit &&
          dateHit &&
          (tagFilter === "ทุก tag" ||
            (task.tags || [task.tag]).includes(tagFilter)) &&
          (assignee === "ทุกคน" || task.assignees?.includes(assignee)) &&
          (statusFilter === "ทุกสถานะ" || task.status === statusFilter) &&
          (departmentFilter === "ทุกแผนก" || task.board === departmentFilter) &&
          deadlineHit
        );
      }),
    [
      tasks,
      search,
      tagFilter,
      assignee,
      statusFilter,
      departmentFilter,
      dateFrom,
      dateTo,
      deadlineFilter,
    ],
  );
  const visibleUsers = users.filter(
      (user) => !user.isDemo && !user.name?.includes("(DEMO)"),
    ),
    boardTasks = allFiltered.filter((task) => task.board === activeBoard),
    tags = [
      ...new Set(
        tasks.flatMap((task) => task.tags || [task.tag]).filter(Boolean),
      ),
    ],
    assignees = [
      ...new Set(
        [
          ...visibleUsers.map((user) => user.name),
          ...tasks.flatMap((task) => task.assignees || []),
        ].filter(Boolean),
      ),
    ],
    statuses = [
      ...new Set(
        Object.values(boardConfigs).flatMap((config) => config.statuses),
      ),
    ],
    memberOptions = visibleUsers.length
      ? visibleUsers
      : assignees.map((name) => ({ id: name, name, email: "", photoURL: "" }));
  const currentUserProfile = users.find(
      (user) => user.email && user.email === authUser?.email,
    ),
    userLabel =
      authUser?.displayName ||
      currentUserProfile?.name ||
      authUser?.email ||
      "Workspace member",
    userPhoto = authUser?.photoURL || currentUserProfile?.photoURL || "",
    userInitial = userLabel?.[0] || "G",
    recipientsForTask = (task) =>
      (task.assignees || [])
        .map((name) => users.find((user) => user.name === name))
        .filter((user) => user?.uid && user.uid !== authUser?.uid);
  const goTo = (label) => {
    setActiveNav(label);
    setSelectedTask(null);
  };
  async function handleCreate(form) {
    const task = normalizeTask({
      ...form,
      id: `local-${Date.now()}`,
      board: activeBoard,
      department: activeBoard,
      comments: [],
      activity: [
        {
          action: "สร้างงาน",
          actor: userLabel,
          createdAt: new Date().toISOString(),
        },
      ],
      steps: form.steps?.length
        ? form.steps
        : board.statuses.map((status) => ({
            status,
            due: status === form.status ? form.due : "",
          })),
    });
    setTasks((current) => [task, ...current]);
    setShowCreate(false);
    const result = await createTask(task);
    const savedId = result?.id || task.id;
    const savedTask = { ...task, id: savedId };
    if (result?.id)
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? savedTask : item)),
      );
    await Promise.all(
      recipientsForTask(savedTask).map((recipient) =>
        createNotification({
          type: "assignment",
          text: `คุณได้รับมอบหมายงาน ${task.title}`,
          taskId: savedId,
          recipientId: recipient.uid,
        }),
      ),
    );
    await createActivityLog({
      taskId: savedId,
      action: "สร้างงาน",
      actor: userLabel,
    });
  }
  async function handleMove(task, status) {
    const nextDue = task.steps?.find((step) => step.status === status)?.due;
    const activity = {
      action: `ย้ายสถานะเป็น ${status}`,
      actor: userLabel,
      createdAt: new Date().toISOString(),
    };
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? {
              ...item,
              status,
              ...(nextDue !== undefined ? { due: nextDue } : {}),
              activity: [...(item.activity || []), activity],
            }
          : item,
      ),
    );
    await moveTask(task.id, status, recipientsForTask(task), nextDue);
    await createActivityLog({ taskId: task.id, ...activity });
  }
  async function handleUpdate(taskId, patch) {
    const currentTask = tasks.find((item) => item.id === taskId);
    const nextPatch = { ...patch };
    const stepDue = patch.steps?.find(
      (step) => step.status === patch.status,
    )?.due;
    if (patch.steps && stepDue !== undefined) nextPatch.due = stepDue;
    const activity = {
      action: "แก้ไขรายละเอียดงาน",
      actor: userLabel,
      createdAt: new Date().toISOString(),
    };
    setTasks((current) =>
      current.map((item) =>
        item.id === taskId
          ? {
              ...item,
              ...nextPatch,
              activity: [...(item.activity || []), activity],
            }
          : item,
      ),
    );
    await updateTask(taskId, { ...nextPatch, activity: undefined });
    await createActivityLog({ taskId, ...activity });
    const previousAssignees = currentTask?.assignees || [];
    const newAssignees = nextPatch.assignees || previousAssignees;
    const newlyAssigned = newAssignees
      .filter((name) => !previousAssignees.includes(name))
      .map((name) => users.find((user) => user.name === name))
      .filter((user) => user?.uid && user.uid !== authUser?.uid);
    await Promise.all(
      newlyAssigned.map((recipient) =>
        createNotification({
          type: "assignment",
          text: `คุณได้รับมอบหมายงาน ${nextPatch.title || currentTask?.title || taskId}`,
          taskId,
          recipientId: recipient.uid,
        }),
      ),
    );
  }
  async function handleDelete(task) {
    if (!window.confirm(`ลบงาน "${task.title}" ใช่หรือไม่?`)) return;
    setTasks((current) => current.filter((item) => item.id !== task.id));
    setSelectedTask(null);
    await deleteTask(task.id);
    await createNotification({
      type: "delete",
      text: `ลบงาน ${task.title}`,
      taskId: task.id,
    });
  }
  async function handleComment(task, text, files = []) {
    const attachments = [];
    for (const file of files) {
      const uploaded = await uploadCommentFile(file, task.id);
      if (uploaded) attachments.push(uploaded);
    }
    const comment = {
      id: `comment-${Date.now()}`,
      author: userLabel,
      authorId: authUser?.uid || "",
      text,
      attachments,
      createdAt: new Date().toISOString(),
      taskTitle: task.title,
    };
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? { ...item, comments: [...(item.comments || []), comment] }
          : item,
      ),
    );
    try {
      await addTaskComment(task.id, comment, recipientsForTask(task));
    } catch (error) {
      console.error("comment save failed", error);
    }
    try {
      await notifyMentions(task.id, task.title, text, userLabel, users, tasks);
    } catch (error) {
      console.error("mention notification failed", error);
    }
    await createActivityLog({
      taskId: task.id,
      action: "เพิ่มคอมเมนต์",
      actor: userLabel,
    });
    return comment;
  }
  async function handleDeleteComment(task, comment) {
    if (!window.confirm("ลบคอมเมนต์นี้ใช่หรือไม่?")) return;
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? {
              ...item,
              comments: (item.comments || []).filter(
                (entry) => entry.id !== comment.id,
              ),
            }
          : item,
      ),
    );
    await deleteTaskComment(task.id, comment);
    await createActivityLog({
      taskId: task.id,
      action: "ลบคอมเมนต์",
      actor: userLabel,
    });
  }
  async function handleUpload(task, fileList) {
    const urls = [];
    for (const file of fileList)
      urls.push(await uploadTaskImage(file, task.id));
    await handleUpdate(task.id, { images: [...(task.images || []), ...urls] });
  }
  async function handleGoogleLogin() {
    setAuthError("");
    try {
      await signInWithGoogle();
    } catch (error) {
      setAuthError(error?.message || "เข้าสู่ระบบด้วย Google ไม่สำเร็จ");
    }
  }
  async function handleProfileSave(profile) {
    const updated = await updateGoogleProfile(profile);
    if (updated) {
      setAuthUser({ ...updated });
      await upsertUserProfile(updated);
    }
    setShowProfile(false);
  }
  async function handleLogout() {
    await signOutUser();
    setAuthUser(null);
    setShowProfile(false);
  }
  async function handleReadNotification(notification) {
    if (!notification.read) await markNotificationRead(notification.id);
  }
  async function handleReadAllNotifications() {
    await Promise.all(
      notifications
        .filter((item) => !item.read)
        .map((item) => markNotificationRead(item.id)),
    );
  }
  function handleNotificationClick(notification) {
    const task = tasks.find((item) => item.id === notification.taskId);
    if (task) {
      setActiveBoard(task.board || task.department || activeBoard);
      setActiveNav("บอร์ดงาน");
      setSelectedTask(task);
    }
    setNotificationOpen(false);
    handleReadNotification(notification);
  }
  if (!firebaseEnabled) return <FirebaseSetupScreen />;
  if (authLoading)
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <BrandMark />
          <div className="auth-loader" />
        </div>
      </div>
    );
  if (firebaseEnabled && !authUser)
    return <LoginScreen onLogin={handleGoogleLogin} error={authError} />;
  return (
    <div className="app-shell">
      <Sidebar
        activeNav={activeNav}
        activeBoard={activeBoard}
        tasks={tasks}
        setActiveBoard={(key) => {
          setActiveBoard(key);
          setStatusFilter("ทุกสถานะ");
          setActiveNav("บอร์ดงาน");
        }}
        goTo={goTo}
        userLabel={userLabel}
        userInitial={userInitial}
        userPhoto={userPhoto}
        onProfile={() => setShowProfile(true)}
      />
      <main className="main-content">
        <Topbar
          userLabel={userLabel}
          userInitial={userInitial}
          userPhoto={userPhoto}
          notificationOpen={notificationOpen}
          setNotificationOpen={setNotificationOpen}
          notifications={notifications}
          onNotificationClick={handleNotificationClick}
          onReadAllNotifications={handleReadAllNotifications}
        />
      {activeNav === "บอร์ดงาน" && (
        <BoardPage
          activeBoard={activeBoard}
          onSelectBoard={(key) => {
            setActiveBoard(key);
            setStatusFilter("ทุกสถานะ");
          }}
          board={board}
            tasks={boardTasks}
            viewMode={viewMode}
            setViewMode={setViewMode}
            search={search}
            setSearch={setSearch}
            tagFilter={tagFilter}
            setTagFilter={setTagFilter}
            assignee={assignee}
            setAssignee={setAssignee}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            dateFrom={dateFrom}
            setDateFrom={setDateFrom}
            dateTo={dateTo}
            setDateTo={setDateTo}
            deadlineFilter={deadlineFilter}
            setDeadlineFilter={setDeadlineFilter}
            departmentFilter={departmentFilter}
            setDepartmentFilter={setDepartmentFilter}
            tags={tags}
            assignees={assignees}
            statuses={statuses}
            setShowCreate={setShowCreate}
            onSelect={setSelectedTask}
            onMove={handleMove}
            onDelete={handleDelete}
          />
        )}
        {activeNav === "ภาพรวม" && (
          <OverviewPage
            tasks={tasks}
            users={visibleUsers}
            onSelect={setSelectedTask}
          />
        )}
        {activeNav === "งานทั้งหมด" && (
          <AllTasksPage
            tasks={allFiltered}
            search={search}
            setSearch={setSearch}
            setActiveBoard={setActiveBoard}
            setActiveNav={setActiveNav}
            onSelect={setSelectedTask}
          />
        )}
        {activeNav === "ปฏิทิน" && (
          <EnhancedCalendarPage
            tasks={allFiltered}
            onSelect={setSelectedTask}
          />
        )}
        {activeNav === "ไฟล์และลิงก์" && (
          <EnhancedFilesPageDrive
            files={files}
            setFiles={setFiles}
            folders={folders}
            setFolders={setFolders}
            currentUser={userLabel}
          />
        )}
      </main>
      {selectedTask && (
        <EnhancedTaskDrawer
          task={{
            ...(tasks.find((item) => item.id === selectedTask.id) ||
              selectedTask),
            __editing: selectedTask.__editing,
          }}
          board={
            boardConfigs[
              (
                tasks.find((item) => item.id === selectedTask.id) ||
                selectedTask
              ).board
            ] || board
          }
          onClose={() => setSelectedTask(null)}
          users={memberOptions}
          tasks={tasks}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onComment={handleComment}
          onUpload={handleUpload}
          onDeleteComment={handleDeleteComment}
          currentUserId={authUser?.uid}
          currentUserLabel={userLabel}
        />
      )}
      {showCreate && (
        <TaskEditorDrawer
          board={board}
          users={memberOptions}
          tasks={tasks}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
      {showProfile && (
        <ProfileModal
          user={{ ...authUser, displayName: userLabel, photoURL: userPhoto }}
          onClose={() => setShowProfile(false)}
          onSave={handleProfileSave}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}

function Sidebar({
  activeNav,
  activeBoard,
  tasks,
  setActiveBoard,
  goTo,
  userLabel,
  userInitial,
  userPhoto,
  onProfile,
}) {
  return (
    <aside className="sidebar">
      <div className="brand-mark">
        <span>D</span>
        <div>
          <strong>DLG Board</strong>
          <small>เราคือทีม</small>
        </div>
      </div>
      <div className="workspace-switcher">
        <div className="workspace-avatar">O</div>
        <div>
          <small>Workspace</small>
          <strong>Digital light group</strong>
        </div>
      </div>
      <nav className="main-nav">
        <p className="nav-label">WORKSPACE</p>
        {navItems.map(({ label, icon: Icon }) => (
          <button
            key={label}
            className={`nav-item ${activeNav === label ? "active" : ""}`}
            onClick={() => goTo(label)}
          >
            <Icon size={17} />
            <span>{label}</span>
            {label === "งานทั้งหมด" && <em>{tasks.length}</em>}
          </button>
        ))}
      </nav>
      <div className="department-block">
        <div className="section-heading">
          <span>DEPARTMENTS</span>
          <button aria-label="เพิ่มแผนก">
            <Plus size={15} />
          </button>
        </div>
        {Object.entries(boardConfigs).map(([key, config]) => (
          <button
            key={key}
            className={`department-item ${activeBoard === key && activeNav === "บอร์ดงาน" ? "selected" : ""}`}
            onClick={() => setActiveBoard(key)}
          >
            <i style={{ background: config.color }} />
            {config.label}
            <small>{tasks.filter((task) => task.board === key).length}</small>
          </button>
        ))}
      </div>
      <div className="sidebar-bottom">
        <button className="profile" onClick={onProfile}>
          <UserAvatar
            className="profile-avatar"
            src={userPhoto}
            name={userLabel}
          />
          <div>
            <strong>{userLabel}</strong>
            <small>
              {firebaseEnabled ? "Google account" : "Firebase workspace"}
            </small>
          </div>
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  );
}
function Topbar({
  userLabel,
  userInitial,
  userPhoto,
  notificationOpen,
  setNotificationOpen,
  notifications,
  onNotificationClick,
  onReadAllNotifications,
}) {
  return (
    <header className="topbar">
      <div className="breadcrumbs">
        <span>Workspace</span>
        <b>/</b>
        <strong>Organization planner</strong>
      </div>
      <div className="top-actions">
        <button
          className="icon-button notification-button"
          aria-label="การแจ้งเตือน"
          onClick={() => setNotificationOpen(!notificationOpen)}
        >
          <Bell size={18} />
          <i />
        </button>
        <div className="user-chip">
          <UserAvatar
            className="mini-avatar"
            src={userPhoto}
            name={userLabel}
          />
          <span>{userLabel}</span>
        </div>
      </div>
      {notificationOpen && (
        <NotificationPopover
          notifications={notifications}
          onNotificationClick={onNotificationClick}
          onReadAllNotifications={onReadAllNotifications}
          onClose={() => setNotificationOpen(false)}
        />
      )}
    </header>
  );
}
function NotificationPopover({
  notifications,
  onNotificationClick,
  onReadAllNotifications,
  onClose,
}) {
  const popoverRef = useRef(null);
  const unread = notifications.filter((item) => !item.read).length;
  useEffect(() => {
    const close = (event) => {
      if (event.target.closest?.(".notification-button")) return;
      if (!popoverRef.current?.contains(event.target)) onClose();
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onClose]);
  return (
    <div ref={popoverRef} className="notification-popover">
      <div className="popover-head">
        <strong>Notifications</strong>
        <div>
          <span>{unread} ยังไม่อ่าน</span>
          <button
            type="button"
            className="mark-all-read"
            disabled={!unread}
            onClick={onReadAllNotifications}
          >
            อ่านแล้วทั้งหมด
          </button>
        </div>
      </div>
      {notifications.slice(0, 5).map((item, index) => (
        <button
          className={`notification-item ${item.read ? "" : "unread"}`}
          key={item.id || index}
          onClick={() => onNotificationClick(item)}
        >
          <span
            className={`notification-icon ${item.type === "assignment" ? "teal" : "coral"}`}
          >
            {item.type === "assignment" ? (
              <Users size={14} />
            ) : (
              <Bell size={14} />
            )}
          </span>
          <div>
            <strong>
              {item.type === "workflow"
                ? "มีการย้ายสถานะงาน"
                : item.type === "comment"
                  ? "มีคอมเมนต์ใหม่"
                  : item.type === "mention"
                    ? "มีคนแท็กคุณ"
                    : item.type === "task-mention"
                      ? "มีการแท็กงาน"
                      : item.type === "deadline"
                        ? "งานใกล้ครบกำหนด"
                        : item.type === "overdue"
                          ? "งานเลยกำหนด"
                          : "มีงานที่ต้องติดตาม"}
            </strong>
            <p>{item.text}</p>
          </div>
          <small>{relativeTime(item.createdAt)}</small>
        </button>
      ))}
    </div>
  );
}

function BoardPage({
  activeBoard,
  onSelectBoard,
  board,
  tasks,
  viewMode,
  setViewMode,
  search,
  setSearch,
  tagFilter,
  setTagFilter,
  assignee,
  setAssignee,
  statusFilter,
  setStatusFilter,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  deadlineFilter,
  setDeadlineFilter,
  departmentFilter,
  setDepartmentFilter,
  tags,
  assignees,
  statuses,
  setShowCreate,
  onSelect,
  onMove,
  onDelete,
}) {
  return (
    <>
      <div className="mobile-board-switcher">
        <span>แผนก</span>
        <select value={activeBoard} onChange={(event) => onSelectBoard(event.target.value)}>
          {Object.entries(boardConfigs).map(([key, config]) => (
            <option key={key} value={key}>{config.label}</option>
          ))}
        </select>
      </div>
      <PageTitle
        eyebrow={board.kicker}
        title={`${board.label} board`}
        text="ติดตามงานของทีมตั้งแต่เริ่มต้นจนถึงส่งมอบ พร้อม timeline ที่ทุกคนเห็นตรงกัน"
        actions={
          <>
            <button
              className="primary-button"
              onClick={() => setShowCreate(true)}
            >
              <Plus size={17} /> สร้างงาน
            </button>
          </>
        }
      />
      <Toolbar
        viewMode={viewMode}
        setViewMode={setViewMode}
        search={search}
        setSearch={setSearch}
        tagFilter={tagFilter}
        setTagFilter={setTagFilter}
        assignee={assignee}
        setAssignee={setAssignee}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        deadlineFilter={deadlineFilter}
        setDeadlineFilter={setDeadlineFilter}
        departmentFilter={departmentFilter}
        setDepartmentFilter={setDepartmentFilter}
        tags={tags}
        assignees={assignees}
        statuses={board.statuses}
      />
      <div className="board-meta">
        <div>
          <strong>{tasks.length} งาน</strong>
          <span>อัปเดตเมื่อสักครู่นี้</span>
        </div>
        <div className="board-alert">
          <Sparkles size={15} />
          <span>อย่าลืมอัปเดตสถานะงานก่อน 17:00 น.</span>
        </div>
      </div>
      {viewMode === "board" && (
        <EnhancedKanbanBoard
          board={board}
          tasks={tasks}
          onSelect={onSelect}
          onMove={onMove}
          onDelete={onDelete}
          onCreate={() => setShowCreate(true)}
        />
      )}
      {viewMode === "list" && <TaskTable tasks={tasks} onSelect={onSelect} />}
      {viewMode === "calendar" && (
        <EnhancedCalendarPage tasks={tasks} onSelect={onSelect} compact />
      )}
    </>
  );
}
function Toolbar({
  viewMode,
  setViewMode,
  search,
  setSearch,
  tagFilter,
  setTagFilter,
  assignee,
  setAssignee,
  statusFilter,
  setStatusFilter,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  deadlineFilter,
  setDeadlineFilter,
  departmentFilter,
  setDepartmentFilter,
  tags,
  assignees,
  statuses,
}) {
  return (
    <div
      className={`board-toolbar ${viewMode === "calendar" ? "calendar-toolbar" : ""}`}
    >
      <div className="view-tabs">
        <button
          className={`view-tab ${viewMode === "board" ? "active" : ""}`}
          onClick={() => setViewMode("board")}
        >
          <LayoutDashboard size={15} /> Board
        </button>
        <button
          className={`view-tab ${viewMode === "list" ? "active" : ""}`}
          onClick={() => setViewMode("list")}
        >
          <ClipboardList size={15} /> List
        </button>
        <button
          className={`view-tab ${viewMode === "calendar" ? "active" : ""}`}
          onClick={() => setViewMode("calendar")}
        >
          <CalendarDays size={15} /> Calendar
        </button>
      </div>
      <div className="toolbar-filters">
        <div className="search-input">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหาชื่องาน หรือ tag"
          />
        </div>
        <FilterSelect
          icon={Tag}
          value={tagFilter}
          onChange={setTagFilter}
          options={[
            { value: "ทุก tag", label: "ทุก tag" },
            ...tags.map((tag) => ({ value: tag, label: tag })),
          ]}
        />
        <FilterSelect
          icon={Users}
          value={assignee}
          onChange={setAssignee}
          options={[
            { value: "ทุกคน", label: "ทุกคน" },
            ...assignees.map((name) => ({ value: name, label: name })),
          ]}
        />
        <FilterSelect
          icon={ListFilter}
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "ทุกสถานะ", label: "ทุกสถานะ" },
            ...statuses.map((status) => ({ value: status, label: status })),
          ]}
        />
        <FilterSelect
          icon={ListFilter}
          value={deadlineFilter}
          onChange={setDeadlineFilter}
          options={[
            { value: "ทั้งหมด", label: "ทั้งหมด" },
            { value: "ใกล้ครบกำหนด", label: "ใกล้ครบกำหนด" },
            { value: "เลยกำหนด", label: "เลยกำหนด" },
          ]}
        />
        <label className="date-filter">
          <span>จาก</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </label>
        <label className="date-filter">
          <span>ถึง</span>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
function EnhancedKanbanBoard({
  board,
  tasks,
  onSelect,
  onMove,
  onDelete,
  onCreate,
}) {
  const [dragging, setDragging] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const [mobileStatus, setMobileStatus] = useState(board.statuses[0]);
  useEffect(() => setMobileStatus(board.statuses[0]), [board.statuses]);
  const startDrag = (event, task) => {
    setDragging(task);
    setDragOverStatus(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
    requestAnimationFrame(() =>
      event.currentTarget.classList.add("is-dragging"),
    );
  };
  const endDrag = (event) => {
    event.currentTarget.classList.remove("is-dragging");
    setDragging(null);
    setDragOverStatus(null);
  };
  const leaveColumn = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget))
      setDragOverStatus(null);
  };
  const dropTask = (event, status) => {
    event.preventDefault();
    if (dragging && dragging.status !== status) onMove(dragging, status);
    setDragging(null);
    setDragOverStatus(null);
  };
  return (
    <section className="kanban-board">
      <div className="mobile-status-tabs" role="tablist" aria-label="สถานะงาน">
        {board.statuses.map((status) => (
          <button
            type="button"
            role="tab"
            aria-selected={mobileStatus === status}
            className={mobileStatus === status ? "active" : ""}
            key={status}
            onClick={() => setMobileStatus(status)}
          >
            <span>{status}</span>
            <b>{tasks.filter((task) => task.status === status).length}</b>
          </button>
        ))}
      </div>
      {board.statuses.map((status, index) => (
        <div
          className={`kanban-column ${mobileStatus === status ? "mobile-visible" : ""} ${dragOverStatus === status ? "drop-ready" : ""}`}
          key={status}
          onDragEnter={() => dragging && setDragOverStatus(status)}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            if (dragging && dragOverStatus !== status)
              setDragOverStatus(status);
          }}
          onDragLeave={leaveColumn}
          onDrop={(event) => dropTask(event, status)}
        >
          <div className="column-head">
            <div>
              <span className="column-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <strong>{status}</strong>
            </div>
            <span className="task-count">
              {tasks.filter((task) => task.status === status).length}
            </span>
          </div>
          <div
            className="column-rule"
            style={{ background: index === 0 ? board.color : undefined }}
          />
          {tasks
            .filter((task) => task.status === status)
            .map((task) => (
              <div
                className={`task-drag-wrap ${dragging?.id === task.id ? "dragging" : ""}`}
                key={task.id}
                draggable
                onDragStart={(event) => startDrag(event, task)}
                onDragEnd={endDrag}
              >
                <TaskCardV2
                  task={task}
                  onSelect={onSelect}
                  onMove={onMove}
                  onDelete={onDelete}
                />
              </div>
            ))}
          <button className="add-task" onClick={onCreate}>
            <Plus size={15} /> เพิ่มงาน
          </button>
        </div>
      ))}
    </section>
  );
}
function TaskCard({ task, onSelect, onMove }) {
  const owner = task.assignees?.[0] || task.assignee || "ยังไม่มอบหมาย";
  return (
    <article className="task-card" onClick={() => onSelect(task)}>
      <div className="task-card-top">
        <span className="task-tag">{task.tag}</span>
        <button
          className="card-more"
          onClick={(event) => {
            event.stopPropagation();
            const next = window.prompt("ย้ายไปสถานะใด?", task.status);
            if (next) onMove(task, next);
          }}
        >
          <MoreHorizontal size={15} />
        </button>
      </div>
      <h3>{task.title}</h3>
      {task.alertText && <div className="task-alert">{task.alertText}</div>}
      <div className="task-card-footer">
        <div className="assignee">
          <span className="avatar small">{owner[0]}</span>
          <span>
            {owner}
            {task.assignees?.length > 1 ? ` +${task.assignees.length - 1}` : ""}
          </span>
        </div>
        <span
          className={`priority ${task.priority === "สูง" ? "high" : task.priority === "เสร็จ" ? "done" : ""}`}
        >
          {task.priority}
        </span>
      </div>
      <div className="task-card-bottom">
        <span>
          <CalendarDays size={13} />
          {task.due}
        </span>
        <span>
          <MessageCircle size={13} />
          {task.comments?.length || task.commentCount || task.comments || 0}
        </span>
      </div>
    </article>
  );
}
function EmptyState({ title, text }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}
function TaskTable({ tasks, onSelect }) {
  return (
    <div className="table-panel">
      <div className="table-head">
        <span>งาน</span>
        <span>แผนก</span>
        <span>ผู้รับผิดชอบ</span>
        <span>กำหนดส่ง</span>
        <span>สถานะ</span>
      </div>
      {tasks.map((task) => (
        <button
          className="task-row"
          key={task.id}
          onClick={() => onSelect(task)}
        >
          <span>
            <strong>{task.title}</strong>
            <small>
              {task.tag} · {task.priority}
            </small>
          </span>
          <span>{boardConfigs[task.board]?.label}</span>
          <span>{(task.assignees || [task.assignee]).join(", ")}</span>
          <span>{task.due}</span>
          <span className="row-status">{task.status}</span>
        </button>
      ))}
      {!tasks.length && (
        <EmptyState
          title="ยังไม่พบงาน"
          text="ลองเปลี่ยนคำค้นหาหรือ filter ที่เลือก"
        />
      )}
    </div>
  );
}
function AllTasksPage({
  tasks,
  search,
  setSearch,
  setActiveBoard,
  setActiveNav,
  onSelect,
}) {
  return (
    <>
      <PageTitle
        eyebrow="ALL WORK"
        title="งานทั้งหมด"
        text="รวมงานจากทุกแผนกในมุมมองเดียว"
      />
      <div className="wide-search">
        <Search size={17} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ค้นหางาน, tag หรือรายละเอียด"
        />
        <span>{tasks.length} งาน</span>
      </div>
      <TaskTable
        tasks={tasks}
        onSelect={(task) => {
          setActiveBoard(task.board);
          setActiveNav("บอร์ดงาน");
          onSelect(task);
        }}
      />
    </>
  );
}
function OverviewPage({ tasks, users, onSelect }) {
  const completed = tasks.filter((task) =>
    ["รูปภาพเสร็จแล้ว", "Work Done", "Finish", "Completed"].includes(
      task.status,
    ),
  ).length;
  return (
    <>
      <PageTitle
        eyebrow="COMMAND CENTER"
        title="ภาพรวมองค์กร"
        text="ภาพรวม workload และความเคลื่อนไหวของทุกแผนก"
      />
      <div className="metric-grid">
        <Metric label="งานทั้งหมด" value={tasks.length} note="ทุกแผนก" />
        <Metric
          label="เสร็จแล้ว"
          value={`${Math.round((completed / Math.max(tasks.length, 1)) * 100)}%`}
          note="ตาม workflow"
        />
        <Metric
          label="ต้องติดตามวันนี้"
          value={
            tasks.filter((task) => {
              const due = parseDue(task.due);
              const now = new Date();
              return (
                due &&
                due.getFullYear() === now.getFullYear() &&
                due.getMonth() === now.getMonth() &&
                due.getDate() === now.getDate()
              );
            }).length
          }
          note="กำหนดส่งวันนี้"
          accent
        />
        <Metric
          label="สมาชิกที่ใช้งาน"
          value={users.length}
          note="จากข้อมูลสมาชิกจริง"
        />
      </div>
      <div className="overview-grid">
        <div className="overview-panel">
          <div className="panel-heading">
            <div>
              <span>WORKLOAD</span>
              <h2>งานแยกตามแผนก</h2>
            </div>
            <MoreHorizontal size={17} />
          </div>
          {Object.entries(boardConfigs).map(([key, config]) => {
            const count = tasks.filter((task) => task.board === key).length;
            return (
              <div className="progress-row" key={key}>
                <div>
                  <i style={{ background: config.color }} />
                  <strong>{config.label}</strong>
                </div>
                <div className="progress-track">
                  <span
                    style={{
                      width: `${Math.max(count * 10, 8)}%`,
                      background: config.color,
                    }}
                  />
                </div>
                <b>{count}</b>
              </div>
            );
          })}
        </div>
        <div className="overview-panel">
          <div className="panel-heading">
            <div>
              <span>UP NEXT</span>
              <h2>งานที่ใกล้ครบกำหนด</h2>
            </div>
            <CalendarDays size={17} />
          </div>
          {tasks
            .filter((task) => parseDue(task.due))
            .sort((a, b) => parseDue(a.due) - parseDue(b.due))
            .slice(0, 5)
            .map((task) => (
              <button
                className="up-next"
                key={task.id}
                onClick={() => onSelect(task)}
              >
                <span>
                  <strong>{task.title}</strong>
                  <small>
                    {boardConfigs[task.board]?.label} · {task.assignees?.[0]}
                  </small>
                </span>
                <b>{task.due}</b>
              </button>
            ))}
        </div>
      </div>
      <div className="activity-strip">
        <Sparkles size={16} />
        <span>
          <strong>Activity</strong> อัปเดต workflow และ comment
          ล่าสุดของทั้งองค์กร
        </span>
      </div>
    </>
  );
}
function Metric({ label, value, note, accent }) {
  return (
    <div className={`metric-card ${accent ? "accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function PageTitle({ eyebrow, title, text, actions }) {
  return (
    <section className="page-head simple">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {actions && <div className="head-actions">{actions}</div>}
    </section>
  );
}
function taskDate(value) {
  if (!value) return null;
  const thaiMonths = {
    "ม.ค.": 0,
    "ก.พ.": 1,
    "มี.ค.": 2,
    "เม.ย.": 3,
    "พ.ค.": 4,
    "มิ.ย.": 5,
    "ก.ค.": 6,
    "ส.ค.": 7,
    "ก.ย.": 8,
    "ต.ค.": 9,
    "พ.ย.": 10,
    "ธ.ค.": 11,
  };
  const iso = new Date(value);
  if (!Number.isNaN(iso.getTime())) return iso;
  const match = String(value).match(/(\d{1,2})\s+([^\s]+)\s+(\d{4})/);
  return match && thaiMonths[match[2]] !== undefined
    ? new Date(Number(match[3]), thaiMonths[match[2]], Number(match[1]))
    : null;
}
function EnhancedCalendarPage({ tasks, onSelect, compact = false }) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const start = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: start + daysInMonth }, (_, index) =>
    index < start ? null : index - start + 1,
  );
  const label = month.toLocaleDateString("th-TH", {
    month: "long",
    year: "numeric",
  });
  return (
    <div className={`calendar-panel ${compact ? "compact" : ""}`}>
      <div className="calendar-header">
        <div>
          <span>
            {month
              .toLocaleDateString("en-US", { month: "long", year: "numeric" })
              .toUpperCase()}
          </span>
          <h2>ปฏิทินงาน</h2>
        </div>
        <div className="calendar-actions">
          <button
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            ‹
          </button>
          <strong>{label}</strong>
          <button
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          >
            ›
          </button>
          <button
            className="secondary-button calendar-today"
            onClick={() =>
              setMonth(
                new Date(new Date().getFullYear(), new Date().getMonth(), 1),
              )
            }
          >
            วันนี้
          </button>
        </div>
      </div>
      <div className="calendar-week">
        <span>จ</span>
        <span>อ</span>
        <span>พ</span>
        <span>พฤ</span>
        <span>ศ</span>
        <span>ส</span>
        <span>อา</span>
      </div>
      <div className="calendar-grid">
        {cells.map((day, index) => {
          const dayTasks = day
            ? tasks.filter((task) => {
                const due = taskDate(task.due);
                return (
                  due &&
                  due.getFullYear() === month.getFullYear() &&
                  due.getMonth() === month.getMonth() &&
                  due.getDate() === day
                );
              })
            : [];
          return (
            <div
              className={`calendar-day ${day === new Date().getDate() && month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth() ? "today" : ""}`}
              key={`${day}-${index}`}
            >
              {day && <b>{day}</b>}
              {dayTasks.slice(0, 3).map((task) => (
                <button
                  className="calendar-event"
                  key={task.id}
                  style={{ borderLeftColor: boardConfigs[task.board]?.color }}
                  onClick={() => onSelect(task)}
                >
                  <span className="calendar-event-dept">
                    {boardConfigs[task.board]?.label ||
                      task.department ||
                      "ไม่ระบุแผนก"}
                  </span>
                  <strong>{task.title}</strong>
                  <small>{task.status || "ไม่ระบุสถานะ"}</small>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
function FolderModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  return (
    <div className="modal-backdrop">
      <div className="create-modal">
        <div className="modal-head">
          <div>
            <span>FOLDER</span>
            <h2>สร้างโฟลเดอร์</h2>
          </div>
          <button onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <label>
          ชื่อโฟลเดอร์
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) =>
              event.key === "Enter" && name.trim() && onCreate(name.trim())
            }
            placeholder="เช่น Campaign 2026"
          />
        </label>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            className="primary-button"
            disabled={!name.trim()}
            onClick={() => onCreate(name.trim())}
          >
            <FolderPlus size={14} />
            สร้างโฟลเดอร์
          </button>
        </div>
      </div>
    </div>
  );
}
function EnhancedFileLinkModal({ folders, defaultFolder, onClose, onCreate }) {
  const [form, setForm] = useState({
    name: "",
    url: "",
    type: "Link",
    description: "",
    tags: "",
    folder: defaultFolder || "",
  });
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <div className="modal-backdrop">
      <div className="create-modal">
        <div className="modal-head">
          <div>
            <span>FILE LINK</span>
            <h2>แนบไฟล์หรือลิงก์</h2>
          </div>
          <button onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <label>
          ชื่อไฟล์
          <input
            autoFocus
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder="ชื่อที่ใช้แสดง"
          />
        </label>
        <label>
          URL
          <input
            type="url"
            value={form.url}
            onChange={(event) => update("url", event.target.value)}
            placeholder="https://..."
          />
        </label>
        <div className="form-row">
          <label>
            ประเภท
            <select
              value={form.type}
              onChange={(event) => update("type", event.target.value)}
            >
              <option>Link</option>
              <option>Google Drive</option>
              <option>Dropbox</option>
              <option>OneDrive</option>
              <option>Figma</option>
              <option>Notion</option>
            </select>
          </label>
          <label>
            โฟลเดอร์
            <select
              value={form.folder}
              onChange={(event) => update("folder", event.target.value)}
            >
              <option value="">ไม่อยู่ในโฟลเดอร์</option>
              {folders.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          รายละเอียด
          <textarea
            value={form.description}
            onChange={(event) => update("description", event.target.value)}
            placeholder="รายละเอียดเพิ่มเติม"
          />
        </label>
        <label>
          แท็ก
          <input
            value={form.tags}
            onChange={(event) => update("tags", event.target.value)}
            placeholder="เช่น campaign, final"
          />
        </label>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            className="primary-button"
            disabled={!form.name.trim() || !form.url.trim()}
            onClick={() =>
              onCreate({
                ...form,
                name: form.name.trim(),
                url: form.url.trim(),
              })
            }
          >
            <Link2 size={14} />
            บันทึกลิงก์
          </button>
        </div>
      </div>
    </div>
  );
}
function EnhancedFilesPageDrive({
  files,
  setFiles,
  folders,
  setFolders,
  currentUser,
}) {
  const [folder, setFolder] = useState("ทั้งหมด");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("list");
  const [modal, setModal] = useState(null);
  const children = folders.filter(
    (item) =>
      folder !== "ทั้งหมด" &&
      item.startsWith(`${folder}/`) &&
      !item.slice(folder.length + 1).includes("/"),
  );
  const visible = files.filter((file) => {
    const inFolder =
      folder === "ทั้งหมด" ||
      file.folderPath === folder ||
      file.folderPath?.startsWith(`${folder}/`);
    const query = search.trim().toLowerCase();
    return (
      inFolder &&
      (!query ||
        `${file.name} ${file.type} ${file.description || ""} ${file.tags || ""}`
          .toLowerCase()
          .includes(query))
    );
  });
  const addFolder = async (name) => {
    const next = folder === "ทั้งหมด" ? name : `${folder}/${name}`;
    if (!folders.includes(next)) {
      setFolders((current) => [...current, next]);
      await createFolder({
        path: next,
        name,
        parentPath: folder === "ทั้งหมด" ? "" : folder,
        owner: currentUser,
      });
    }
    setFolder(next);
    setModal(null);
  };
  const removeFolder = async (target) => {
    if (!window.confirm(`ลบโฟลเดอร์ ${target} ใช่หรือไม่?`)) return;
    setFolders((current) =>
      current.filter(
        (item) => item !== target && !item.startsWith(`${target}/`),
      ),
    );
    const movedFiles = files.filter(
      (file) =>
        file.folderPath === target || file.folderPath?.startsWith(`${target}/`),
    );
    setFiles((current) =>
      current.map((file) =>
        movedFiles.some((item) => item.id === file.id)
          ? { ...file, folderPath: "" }
          : file,
      ),
    );
    await Promise.all(
      movedFiles.map((file) => updateFileLink(file.id, { folderPath: "" })),
    );
    await deleteFolder(target);
    if (folder === target || folder.startsWith(`${target}/`))
      setFolder("ทั้งหมด");
  };
  const openFolder = (target) => setFolder(target);
  const removeFile = async (file) => {
    if (!window.confirm(`ลบลิงก์ ${file.name} ใช่หรือไม่?`)) return;
    setFiles((current) => current.filter((item) => item.id !== file.id));
    await deleteFileLink(file.id);
  };
  return (
    <div className="drive-page">
      <div className="drive-toolbar">
        <div className="drive-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหาในไฟล์และลิงก์"
          />
          <span>⌘ K</span>
        </div>
        <button
          className="drive-icon-button"
          title="รายการ"
          onClick={() => setView("list")}
        >
          <List size={17} />
        </button>
        <button
          className="drive-icon-button"
          title="ตาราง"
          onClick={() => setView("grid")}
        >
          <FolderKanban size={17} />
        </button>
      </div>
      <div className="drive-layout">
        <aside className="drive-sidebar">
          <button
            className={`drive-nav-row ${folder === "ทั้งหมด" ? "active" : ""}`}
            onClick={() => setFolder("ทั้งหมด")}
          >
            <FileText size={17} />
            ไฟล์ทั้งหมด<span>{files.length}</span>
          </button>
          <div className="drive-section-label">โฟลเดอร์</div>
          {folders
            .filter((item) => !item.includes("/"))
            .map((item) => (
              <DriveFolderRow
                key={item}
                item={item}
                folder={folder}
                files={files}
                onOpen={openFolder}
                onDelete={removeFolder}
              />
            ))}
          <button
            className="drive-add-folder"
            onClick={() => setModal("folder")}
          >
            <FolderPlus size={15} />
            สร้างโฟลเดอร์
          </button>
        </aside>
        <section className="drive-content">
          <div className="drive-breadcrumb">
            <button onClick={() => setFolder("ทั้งหมด")}>
              <FileText size={15} />
              ทั้งหมด
            </button>
            {folder !== "ทั้งหมด" &&
              folder.split("/").map((part, index, parts) => {
                const path = parts.slice(0, index + 1).join("/");
                return (
                  <React.Fragment key={path}>
                    <b>/</b>
                    <button onClick={() => setFolder(path)}>{part}</button>
                  </React.Fragment>
                );
              })}
          </div>
          <div className="drive-content-head">
            <div>
              <h2>
                {folder === "ทั้งหมด" ? "ไฟล์ทั้งหมด" : folder.split("/").pop()}
              </h2>
              <span>{visible.length} รายการ</span>
            </div>
            <div className="drive-head-actions">
              <button
                className="secondary-button"
                onClick={() => setModal("folder")}
              >
                <FolderPlus size={15} />
                โฟลเดอร์ย่อย
              </button>
              <button
                className="primary-button"
                onClick={() => setModal("link")}
              >
                <Link2 size={15} />
                แนบไฟล์
              </button>
            </div>
          </div>
          {folder !== "ทั้งหมด" && children.length > 0 && (
            <div className="drive-folder-grid">
              {children.map((item) => (
                <DriveFolderCard
                  key={item}
                  item={item}
                  files={files}
                  onOpen={openFolder}
                  onDelete={removeFolder}
                />
              ))}
            </div>
          )}
          {view === "grid" ? (
            <div className="drive-file-grid">
              {visible.map((file) => (
                <DriveFileCard
                  key={file.id}
                  file={file}
                  onDelete={removeFile}
                />
              ))}
            </div>
          ) : (
            <div className="drive-file-list">
              <div className="drive-list-head">
                <span>ชื่อ</span>
                <span>ประเภท</span>
                <span>เจ้าของ</span>
                <span>แก้ไขล่าสุด</span>
                <span />
              </div>
              {visible.map((file) => (
                <DriveFileRow key={file.id} file={file} onDelete={removeFile} />
              ))}
            </div>
          )}
          {!visible.length && !children.length && (
            <EmptyState
              title="ยังไม่มีไฟล์หรือลิงก์"
              text="กดปุ่ม ใหม่ เพื่อสร้างโฟลเดอร์หรือแนบลิงก์"
            />
          )}
        </section>
      </div>
      {modal === "folder" && (
        <FolderModal onClose={() => setModal(null)} onCreate={addFolder} />
      )}
      {modal === "link" && (
        <EnhancedFileLinkModal
          folders={folders}
          defaultFolder={folder === "ทั้งหมด" ? folders[0] : folder}
          onClose={() => setModal(null)}
          onCreate={async (file) => {
            setFiles((current) => [
              {
                ...file,
                folderPath: file.folder,
                owner: currentUser,
                id: `local-file-${Date.now()}`,
              },
              ...current,
            ]);
            await createFileLink({
              ...file,
              folderPath: file.folder,
              owner: currentUser,
            });
            setModal(null);
          }}
        />
      )}
    </div>
  );
}
function DriveFolderRow({ item, folder, files, onOpen, onDelete }) {
  return (
    <div className="drive-folder-row-wrap">
      <button
        className={`drive-nav-row ${folder === item ? "active" : ""}`}
        onClick={() => onOpen(item)}
      >
        <FolderKanban size={17} />
        {item}
        <span>{files.filter((file) => file.folderPath === item).length}</span>
      </button>
      <button className="drive-delete" onClick={() => onDelete(item)}>
        <X size={13} />
      </button>
    </div>
  );
}
function DriveFolderCard({ item, files, onOpen, onDelete }) {
  return (
    <div className="drive-folder-card" onDoubleClick={() => onOpen(item)}>
      <FolderKanban size={20} />
      <strong>{item.split("/").pop()}</strong>
      <small>
        {files.filter((file) => file.folderPath === item).length} รายการ
      </small>
      <button onClick={() => onDelete(item)}>
        <X size={13} />
      </button>
    </div>
  );
}
function DriveFileRow({ file, onDelete }) {
  return (
    <a
      className="drive-file-row"
      href={file.url}
      target="_blank"
      rel="noreferrer"
    >
      <span>
        <Link2 size={17} />
        <strong>{file.name}</strong>
      </span>
      <span>{file.type}</span>
      <span>{file.owner || "ฉัน"}</span>
      <span>{file.updated || "วันนี้"}</span>
      <button
        className="drive-file-delete"
        type="button"
        title="ลบลิงก์"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDelete(file);
        }}
      >
        <X size={14} />
      </button>
    </a>
  );
}
function DriveFileCard({ file, onDelete }) {
  return (
    <a
      className="drive-file-card"
      href={file.url}
      target="_blank"
      rel="noreferrer"
    >
      <div>
        <Link2 size={24} />
      </div>
      <strong>{file.name}</strong>
      <small>{file.type}</small>
      <button
        className="drive-file-delete"
        type="button"
        title="ลบลิงก์"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDelete(file);
        }}
      >
        <X size={14} />
      </button>
    </a>
  );
}

function TaskCardV2({ task, onSelect, onMove, onDelete }) {
  const [open, setOpen] = useState(false);
  const owner = task.assignees?.[0] || task.assignee || "ยังไม่มอบหมาย";
  const due = currentStepDue(task);
  const deadline = deadlineState(task);
  return (
    <article className="task-card" onClick={() => onSelect(task)}>
      <div className="task-card-top">
        <span className="task-tag">{task.tag}</span>
        <div className="task-menu-wrap">
          <button
            className="card-more"
            aria-label="เมนู Task"
            onClick={(event) => {
              event.stopPropagation();
              setOpen((value) => !value);
            }}
          >
            <MoreHorizontal size={15} />
          </button>
          {open && (
            <div
              className="task-menu"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                onClick={() => {
                  setOpen(false);
                  onSelect(task);
                }}
              >
                <FileText size={14} />
                ดู
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  onSelect({ ...task, __editing: true });
                }}
              >
                <Settings2 size={14} />
                แก้ไข
              </button>
              <button
                className="danger-menu-item"
                onClick={() => {
                  setOpen(false);
                  onDelete(task);
                }}
              >
                <X size={14} />
                ลบ
              </button>
            </div>
          )}
        </div>
      </div>
      <h3>{task.title}</h3>
      {deadline && (
        <span className={`task-deadline-tag ${deadline}`}>
          <CalendarDays size={11} />
          {deadline === "overdue"
            ? "เลยกำหนดของสถานะนี้"
            : "ใกล้ครบกำหนดของสถานะนี้"}
        </span>
      )}
      {task.alertText && <div className="task-alert">{task.alertText}</div>}
      <div className="task-card-footer">
        <div className="assignee">
          {owner !== "ยังไม่มอบหมาย" && task.assignees?.[0] && (
            <span className="avatar small">{owner[0]}</span>
          )}
          <span>
            {owner}
            {task.assignees?.length > 1 ? ` +${task.assignees.length - 1}` : ""}
          </span>
        </div>
        <span
          className={`priority ${task.priority === "สูง" ? "high" : task.priority === "เสร็จ" ? "done" : ""}`}
        >
          {task.priority}
        </span>
      </div>
      <div className="task-card-bottom">
        <span>
          <CalendarDays size={13} />
          {due || "ยังไม่กำหนด"}
        </span>
        <span>
          <MessageCircle size={13} />
          {task.comments?.length || task.commentCount || task.comments || 0}
        </span>
      </div>
    </article>
  );
}

function EnhancedTaskDrawer({
  task,
  board,
  onClose,
  users,
  tasks,
  onUpdate,
  onDelete,
  onComment,
  onUpload,
  onDeleteComment,
  currentUserId,
  currentUserLabel,
}) {
  const [editing, setEditing] = useState(Boolean(task.__editing));
  const [draft, setDraft] = useState(task);
  const [saveState, setSaveState] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setDraft(task);
    setEditing(Boolean(task.__editing));
  }, [task.id, task.__editing]);
  const update = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setSaving(true);
    setSaveState("");
    try {
      await onUpdate(task.id, {
        title: draft.title,
        description: draft.description,
        assignees: draft.assignees,
        tags: draft.tags,
        tag: draft.tags?.[0] || draft.tag || "",
        status: draft.status,
        due: draft.due,
        priority: draft.priority,
        alertText: draft.alertText,
        steps: draft.steps,
      });
      setEditing(false);
      setSaveState("บันทึกข้อมูลเรียบร้อยแล้ว");
      window.setTimeout(() => setSaveState(""), 2600);
    } catch (error) {
      console.error("task save failed", error);
      setSaveState("บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  };
  const copyLink = async () => {
    await navigator.clipboard?.writeText(
      `${window.location.origin}/?task=${encodeURIComponent(task.id)}`,
    );
  };
  const setStepDue = (status, due) =>
    update(
      "steps",
      (
        draft.steps || board.statuses.map((item) => ({ status: item, due: "" }))
      ).map((step) => (step.status === status ? { ...step, due } : step)),
    );
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      {saveState && (
        <div className={`save-toast ${saveState.includes("ไม่สำเร็จ") ? "error" : ""}`} role="status">
          {saveState}
        </div>
      )}
      <aside
        className="task-drawer"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer-top">
          <span className="drawer-label">TASK DETAIL</span>
          <button onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="drawer-id">
          {task.id} <span>• {board.label}</span>
        </div>
        {editing ? (
          <input
            className="drawer-title-input"
            value={draft.title || ""}
            onChange={(event) => update("title", event.target.value)}
          />
        ) : (
          <h2>{task.title}</h2>
        )}
        {editing && (
          <BetterRichTextEditor
            value={draft.description || ""}
            onChange={(value) => update("description", value)}
          />
        )}
        {task.alertText && !editing && (
          <div className="task-alert">{task.alertText}</div>
        )}
        {!editing && (
          <TaskViewDetails task={task} board={board} users={users} />
        )}
        <div className="drawer-actions">
          {editing ? (
            <>
              <button className="primary-button" onClick={save} disabled={saving}>
                <Check size={14} />
                บันทึก
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  setDraft(task);
                  setEditing(false);
                }}
              >
                ยกเลิก
              </button>
            </>
          ) : (
            <>
              <button
                className="primary-button"
                onClick={() => setEditing(true)}
              >
                <Settings2 size={14} />
                แก้ไข
              </button>
              <button className="secondary-button" onClick={copyLink}>
                <Link2 size={14} />
                คัดลอกลิงก์
              </button>
              <button className="danger-button" onClick={() => onDelete(task)}>
                <X size={14} />
                ลบ
              </button>
            </>
          )}
        </div>
        <div className="drawer-section">
          <div className="drawer-section-head">
            <strong>ผู้รับผิดชอบ</strong>
            <span>{(draft.assignees || []).length} คน</span>
          </div>
          {editing ? (
            <AssigneePicker
              value={(draft.assignees || []).join(", ")}
              onChange={(value) =>
                update(
                  "assignees",
                  value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                )
              }
              users={users}
            />
          ) : (
            <div className="assignee-row">
              {(task.assignees || []).length ? (
                task.assignees.map((name) => {
                  const user = users.find((item) => item.name === name);
                  return (
                    <div className="assignee-row" key={name}>
                      <UserAvatar
                        className="avatar"
                        src={user?.photoURL}
                        name={name}
                      />
                      <span>
                        <strong>{name}</strong>
                        <small>{user?.email || ""}</small>
                      </span>
                    </div>
                  );
                })
              ) : (
                <span>ยังไม่มอบหมาย</span>
              )}
            </div>
          )}
        </div>
        <div className="drawer-grid">
          <label>
            สถานะ
            {editing ? (
              <select
                value={draft.status}
                onChange={(event) => update("status", event.target.value)}
              >
                {board.statuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            ) : (
              <strong>{task.status}</strong>
            )}
          </label>
          <label>
            กำหนดส่ง
            {editing ? (
              <input
                type="date"
                value={draft.due || ""}
                onChange={(event) => update("due", event.target.value)}
              />
            ) : (
              <strong>{task.due || "ยังไม่กำหนด"}</strong>
            )}
          </label>
          <label>
            Priority
            {editing ? (
              <select
                value={draft.priority || "กลาง"}
                onChange={(event) => update("priority", event.target.value)}
              >
                <option>ต่ำ</option>
                <option>กลาง</option>
                <option>สูง</option>
                <option>เสร็จ</option>
              </select>
            ) : (
              <strong>{task.priority || "กลาง"}</strong>
            )}
          </label>
          <label>
            Tag
            {editing ? (
              <input
                value={(draft.tags || []).join(", ")}
                onChange={(event) =>
                  update(
                    "tags",
                    event.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  )
                }
              />
            ) : (
              <strong>
                {(task.tags || [task.tag]).filter(Boolean).join(", ") || "-"}
              </strong>
            )}
          </label>
        </div>
        {editing && (
          <div className="drawer-section drawer-alert-editor">
            <label className="full-field">
              <small>ข้อความแจ้งเตือนบนบอร์ด</small>
              <input
                className="full-input"
                value={draft.alertText || ""}
                onChange={(event) => update("alertText", event.target.value)}
                placeholder="แสดงข้อความสั้น ๆ บนการ์ดงาน"
              />
            </label>
          </div>
        )}
        {editing && (
          <div className="drawer-section">
            <div className="drawer-section-head">
              <strong>กำหนดส่งแยกตามสถานะ</strong>
            </div>
            {board.statuses.map((status) => (
              <label key={status} className="step-due-row">
                {status}
                <input
                  type="date"
                  value={
                    draft.steps?.find((step) => step.status === status)?.due ||
                    ""
                  }
                  onChange={(event) => setStepDue(status, event.target.value)}
                />
              </label>
            ))}
          </div>
        )}
        {editing && (task.images || []).length > 0 && (
          <div className="drawer-section">
            <div className="drawer-section-head">
              <strong>รูปภาพ</strong>
            </div>
            <div className="image-grid">
              {task.images.map((image) => (
                <img key={image} src={image} alt="" />
              ))}
            </div>
          </div>
        )}
        <div className="drawer-section task-comments-section">
              <div className="drawer-section-head">
                <strong>
                  คอมเมนต์ <span>{task.comments?.length || 0}</span>
                </strong>
              </div>
              {(task.comments || []).map((item) => (
                <div className="comment" key={item.id}>
                  <span className="avatar small">
                    {item.author?.[0] || "U"}
                  </span>
                  <p>
                    <strong>{item.author}</strong>{" "}
                    <small>{relativeTime(item.createdAt)}</small>
                    <br />
                    {renderCommentText(item.text)}
                    <CommentAttachments attachments={item.attachments} />
                  </p>
                  {(item.authorId
                    ? item.authorId === currentUserId
                    : item.author === currentUserLabel) && (
                    <button
                      type="button"
                      className="comment-delete"
                      onClick={() => onDeleteComment(task, item)}
                    >
                      <X size={11} />
                      ลบ
                    </button>
                  )}
                </div>
              ))}
              <CommentComposer
                users={users}
                tasks={tasks}
                onSubmit={(text, files) => onComment(task, text, files)}
              />
        </div>
        <ActivityLogSection task={task} />
      </aside>
    </div>
  );
}

function CommentComposer({ users, tasks, onSubmit }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState(null);
  const inputRef = useRef(null);
  const updateSuggestions = (value) => {
    const match = value.match(/(?:^|\s)([@#])([^\s]*)$/u);
    if (!match) return setSuggestion(null);
    const query = match[2].toLowerCase();
    const items =
      match[1] === "@"
        ? users
            .filter(
              (user) =>
                user.name?.toLowerCase().includes(query) ||
                user.email?.toLowerCase().includes(query),
            )
            .slice(0, 6)
        : tasks
            .filter(
              (task) =>
                task.title?.toLowerCase().includes(query) ||
                task.id?.toLowerCase().includes(query),
            )
            .slice(0, 6);
    setSuggestion({
      symbol: match[1],
      query,
      items,
      start: value.length - match[0].length + 1,
    });
  };
  const choose = (item) => {
    if (!suggestion) return;
    const token =
      suggestion.symbol === "@" ? `@[${item.name}] ` : `#[${item.title}] `;
    const next = `${text.slice(0, suggestion.start)}${token}`;
    setText(next);
    setSuggestion(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.length, next.length);
    });
  };
  const submit = async () => {
    if ((!text.trim() && !files.length) || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(text.trim() || "แนบไฟล์", files);
      setText("");
      setFiles([]);
      setSuggestion(null);
    } catch (uploadError) {
      console.error("comment upload failed", uploadError);
      setError(
        uploadError?.code === "storage/unauthorized"
          ? "ไม่มีสิทธิ์อัปโหลดไฟล์ กรุณาตรวจ Firebase Storage Rules"
          : "อัปโหลดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
      );
    } finally {
      setBusy(false);
    }
  };
  const addFiles = (event) => {
    const picked = Array.from(event.target.files || []);
    const tooLarge = picked.find((file) => file.size > 50 * 1024 * 1024);
    if (tooLarge) setError(`ไฟล์ ${tooLarge.name} ใหญ่เกิน 50 MB`);
    else {
      setError("");
      setFiles((current) => [...current, ...picked]);
    }
    event.target.value = "";
  };
  return (
    <div className="comment-composer">
      <div className="comment-input">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            updateSuggestions(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="เขียนคอมเมนต์ พิมพ์ @ คน หรือ # งาน"
          rows={2}
        />
        <label
          className="comment-attach"
          title="แนบไฟล์ (สูงสุด 50 MB ต่อไฟล์)"
        >
          <Paperclip size={16} />
          <input type="file" multiple onChange={addFiles} />
        </label>
        <button disabled={busy} onClick={submit} aria-label="ส่งคอมเมนต์">
          <MessageCircle size={15} />
        </button>
      </div>
      {busy && (
        <small className="comment-uploading">
          กำลังอัปโหลดไฟล์และบันทึกคอมเมนต์...
        </small>
      )}
      {error && <small className="comment-upload-error">{error}</small>}
      {suggestion && (
        <div className="mention-suggestions">
          {suggestion.items.length ? (
            suggestion.items.map((item) => (
              <button
                type="button"
                key={item.uid || item.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item)}
              >
                {suggestion.symbol === "@" ? (
                  <>
                    <UserAvatar
                      className="avatar small"
                      src={item.photoURL}
                      name={item.name}
                    />
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.email}</small>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="mention-suggestion-icon">#</span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.department || item.board || ""}</small>
                    </span>
                  </>
                )}
              </button>
            ))
          ) : (
            <small>ไม่พบข้อมูลที่ค้นหา</small>
          )}
        </div>
      )}
      {files.length > 0 && (
        <div className="comment-file-list">
          {files.map((file, index) => (
            <span key={`${file.name}-${index}`}>
              <Paperclip size={11} />
              {file.name}
              <button
                type="button"
                onClick={() =>
                  setFiles((current) =>
                    current.filter((_, fileIndex) => fileIndex !== index),
                  )
                }
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function EnhancedCreateTaskModal({ board, users, onClose, onCreate }) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    assignees: [],
    tags: [],
    status: board.statuses[0],
    due: "",
    priority: "กลาง",
    alertText: "",
    steps: board.statuses.map((status) => ({ status, due: "" })),
  });
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const setStepDue = (status, due) =>
    update(
      "steps",
      (
        form.steps || board.statuses.map((item) => ({ status: item, due: "" }))
      ).map((step) => (step.status === status ? { ...step, due } : step)),
    );
  return (
    <div className="modal-backdrop">
      <div className="create-modal">
        <div className="modal-head">
          <div>
            <span>NEW TASK</span>
            <h2>สร้างงาน</h2>
          </div>
          <button onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <label>
          ชื่องาน
          <input
            autoFocus
            value={form.title}
            onChange={(event) => update("title", event.target.value)}
          />
        </label>
        <label>
          รายละเอียด
          <BetterRichTextEditor
            value={form.description}
            onChange={(value) => update("description", value)}
          />
        </label>
        <div className="form-row">
          <label>
            สถานะ
            <select
              value={form.status}
              onChange={(event) => update("status", event.target.value)}
            >
              {board.statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <label>
            กำหนดส่ง
            <input
              type="date"
              value={form.due}
              onChange={(event) => update("due", event.target.value)}
            />
          </label>
        </div>
        <label>
          ผู้รับผิดชอบ
          <AssigneePicker
            value={form.assignees.join(", ")}
            onChange={(value) =>
              update(
                "assignees",
                value
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean),
              )
            }
            users={users}
          />
        </label>
        <div className="form-row">
          <label>
            Tag
            <input
              value={form.tags.join(", ")}
              onChange={(event) =>
                update(
                  "tags",
                  event.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                )
              }
            />
          </label>
          <label>
            ข้อความแจ้งเตือนบนบอร์ด
            <input
              value={form.alertText}
              onChange={(event) => update("alertText", event.target.value)}
            />
          </label>
        </div>
        <div className="drawer-section create-step-due">
          <div className="drawer-section-head">
            <strong>กำหนดส่งแยกตามสถานะ</strong>
          </div>
          {board.statuses.map((status) => (
            <label key={status} className="step-due-row">
              {status}
              <input
                type="date"
                value={
                  form.steps?.find((step) => step.status === status)?.due || ""
                }
                onChange={(event) => setStepDue(status, event.target.value)}
              />
            </label>
          ))}
        </div>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            className="primary-button"
            disabled={!form.title.trim()}
            onClick={() =>
              onCreate({
                ...form,
                title: form.title.trim(),
                tag: form.tags[0] || "",
              })
            }
          >
            <Plus size={14} />
            สร้างงาน
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileModal({ user, onClose, onSave, onLogout }) {
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [photoURL, setPhotoURL] = useState(user.photoURL || "");
  return (
    <div className="modal-backdrop">
      <div className="create-modal">
        <div className="modal-head">
          <div>
            <span>ACCOUNT</span>
            <h2>จัดการโปรไฟล์</h2>
          </div>
          <button onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="profile-preview">
          <UserAvatar
            className="profile-preview-avatar"
            src={photoURL}
            name={displayName}
          />
          <div>
            <strong>{displayName}</strong>
            <small>{user.email}</small>
          </div>
        </div>
        <label>
          ชื่อที่แสดง
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        <label>
          URL รูปโปรไฟล์
          <input
            value={photoURL}
            onChange={(event) => setPhotoURL(event.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onLogout}>
            <LogOut size={14} />
            ออกจากระบบ
          </button>
          <button className="secondary-button" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            className="primary-button"
            onClick={() => onSave({ displayName, photoURL })}
          >
            <Check size={14} />
            บันทึกโปรไฟล์
          </button>
        </div>
      </div>
    </div>
  );
}

function RichTextEditorV3({ value, onChange, onImageUpload }) {
  const editorRef = useRef(null);
  const imageRef = useRef(null);
  useEffect(() => {
    if (
      editorRef.current &&
      editorRef.current.innerHTML !== (value || "") &&
      document.activeElement !== editorRef.current
    )
      editorRef.current.innerHTML = value || "";
  }, [value]);
  const focusEditor = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (selection && !selection.rangeCount) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };
  const run = (command, arg = null) => {
    focusEditor();
    document.execCommand(command, false, arg);
    onChange(editorRef.current?.innerHTML || "");
  };
  const link = () => {
    const url = window.prompt("วาง URL ของลิงก์");
    if (url) run("createLink", url);
  };
  const addImage = async (file) => {
    if (!file) return;
    focusEditor();
    const url = onImageUpload
      ? await onImageUpload(file)
      : await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
    run("insertImage", url);
  };
  return (
    <div className="rich-editor rich-editor-v2">
      <div className="editor-toolbar">
        <select
          aria-label="รูปแบบข้อความ"
          defaultValue="p"
          onChange={(event) => run("formatBlock", event.target.value)}
        >
          <option value="p">Paragraph</option>
          <option value="h2">Heading</option>
          <option value="h3">Subheading</option>
          <option value="blockquote">Quote</option>
        </select>
        <button
          type="button"
          title="ตัวหนา"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run("bold")}
        >
          <Bold size={14} />
          <span>B</span>
        </button>
        <button
          type="button"
          title="ตัวเอียง"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run("italic")}
        >
          <Italic size={14} />
          <span>I</span>
        </button>
        <button
          type="button"
          title="ขีดเส้นใต้"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run("underline")}
        >
          <span>U</span>
        </button>
        <label className="editor-color" title="สีตัวอักษร">
          <span>A</span>
          <input
            type="color"
            defaultValue="#24211e"
            onChange={(event) => run("foreColor", event.target.value)}
          />
        </label>
        <button
          type="button"
          title="Bullet list"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run("insertUnorderedList")}
        >
          <List size={15} />
        </button>
        <button
          type="button"
          title="Numbered list"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run("insertOrderedList")}
        >
          <span>1.</span>
        </button>
        <button
          type="button"
          title="แทรกลิงก์"
          onMouseDown={(event) => event.preventDefault()}
          onClick={link}
        >
          <Link2 size={14} />
        </button>
        <button
          type="button"
          title="แทรกรูปภาพ"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => imageRef.current?.click()}
        >
          <Upload size={14} />
        </button>
        <input
          ref={imageRef}
          hidden
          type="file"
          accept="image/*"
          onChange={(event) => {
            addImage(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          title="ล้างรูปแบบ"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run("removeFormat")}
        >
          <span>Tx</span>
        </button>
        <span className="editor-hint">Rich text</span>
      </div>
      <div
        ref={editorRef}
        className="editor-content editor-content-v2"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        tabIndex={0}
        spellCheck
        onClick={focusEditor}
        onKeyDown={(event) => {
          if (event.key === "Enter")
            requestAnimationFrame(() =>
              onChange(editorRef.current?.innerHTML || ""),
            );
        }}
        data-placeholder="เขียนรายละเอียดงานด้วย rich text..."
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
        onBlur={(event) => onChange(event.currentTarget.innerHTML)}
      />
    </div>
  );
}
function AssigneePicker({ value, onChange, users }) {
  const selected = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pickerRef = useRef(null);
  const filtered = users.filter(
    (user) =>
      user.name.toLowerCase().includes(query.toLowerCase()) ||
      user.email?.toLowerCase().includes(query.toLowerCase()),
  );
  const toggle = (name) =>
    onChange(
      selected.includes(name)
        ? selected.filter((item) => item !== name).join(", ")
        : [...selected, name].join(", "),
    );
  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!pickerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);
  return (
    <div ref={pickerRef} className="assignee-picker">
      <div className="assignee-chips">
        {selected.map((name) => (
          <span className="assignee-chip" key={name}>
            {name}
            <button type="button" onClick={() => toggle(name)}>
              <X size={11} />
            </button>
          </span>
        ))}
        <button
          type="button"
          className="assignee-add"
          onClick={() => setOpen((current) => !current)}
        >
          <Plus size={13} />
          เพิ่มผู้รับผิดชอบ
        </button>
      </div>
      {open && (
        <div className="assignee-menu">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาสมาชิก"
          />
          {filtered.length ? (
            filtered.map((user) => (
              <button
                type="button"
                key={user.id}
                className={selected.includes(user.name) ? "selected" : ""}
                onClick={() => toggle(user.name)}
              >
                <UserAvatar
                  className="assignee-avatar"
                  src={user.photoURL}
                  name={user.name}
                />
                <span>
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                </span>
                {selected.includes(user.name) && <Check size={14} />}
              </button>
            ))
          ) : (
            <small className="assignee-empty">ยังไม่มีสมาชิกในระบบ</small>
          )}
        </div>
      )}
    </div>
  );
}

function TaskEditorDrawer({ board, users, tasks, onClose, onCreate }) {
  const draftTask = {
    id: "new-task",
    title: "",
    description: "",
    assignees: [],
    tags: [],
    tag: "",
    status: board.statuses[0],
    due: "",
    priority: "กลาง",
    alertText: "",
    steps: board.statuses.map((status) => ({ status, due: "" })),
    __editing: true,
  };
  const createFromDraft = async (_taskId, patch) => {
    await onCreate({
      ...draftTask,
      ...patch,
      title: (patch.title || "").trim(),
      tag: patch.tags?.[0] || patch.tag || "",
    });
    onClose();
  };
  return (
    <EnhancedTaskDrawer
      task={draftTask}
      board={board}
      users={users}
      tasks={tasks}
      onClose={onClose}
      onUpdate={createFromDraft}
      onDelete={() => {}}
      onComment={() => {}}
      onUpload={() => {}}
    />
  );
}

function TaskViewDetails({ task, board, users }) {
  const steps = board.statuses.map(
    (status) =>
      task.steps?.find((step) => step.status === status) || { status, due: "" },
  );
  const currentIndex = Math.max(0, board.statuses.indexOf(task.status));
  const ownerNames = task.assignees || [];
  return (
    <div className="task-view-details">
      <div className="task-view-summary">
        <div>
          <span>DEPARTMENT</span>
          <strong>{board.label}</strong>
        </div>
        <div>
          <span>STATUS</span>
          <strong>{task.status || "ยังไม่ระบุ"}</strong>
        </div>
        <div>
          <span>PRIORITY</span>
          <strong>{task.priority || "กลาง"}</strong>
        </div>
        <div>
          <span>TAGS</span>
          <strong>
            {(task.tags || [task.tag]).filter(Boolean).join(", ") || "-"}
          </strong>
        </div>
      </div>
      {task.alertText && (
        <div className="task-view-alert">
          <Sparkles size={14} />
          <span>{task.alertText}</span>
        </div>
      )}
      {task.description && descriptionPreview(task.description) && (
        <div className="task-view-section task-view-description">
          <div className="task-view-section-head">
            <strong>รายละเอียด</strong>
          </div>
          <div
            className="task-view-richtext"
            dangerouslySetInnerHTML={{ __html: task.description }}
          />
        </div>
      )}
      <div className="task-view-section">
        <div className="task-view-section-head">
          <strong>Workflow และกำหนดส่ง</strong>
          <span>
            {currentIndex + 1}/{steps.length}
          </span>
        </div>
        <div className="task-view-steps">
          {steps.map((step, index) => (
            <div
              className={`task-view-step ${index < currentIndex ? "complete" : ""} ${index === currentIndex ? "current" : ""}`}
              key={step.status}
            >
              <span className="task-view-step-dot">
                {index < currentIndex ? <Check size={11} /> : index + 1}
              </span>
              <div>
                <strong>{step.status}</strong>
                <small>
                  {step.due ? `กำหนดส่ง ${step.due}` : "ยังไม่กำหนดวันส่ง"}
                </small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterSelect({ icon: Icon, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected =
    options.find((option) => option.value === value) || options[0];
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div
      ref={rootRef}
      className={`select-filter custom-select ${open ? "open" : ""}`}
    >
      <Icon size={15} />
      <button
        type="button"
        className="filter-select-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{selected?.label || value}</span>
        <i />
      </button>
      {open && (
        <div className="filter-option-menu" role="listbox">
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? "selected" : ""}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityLogSection({ task }) {
  const [logs, setLogs] = useState(task.activity || []);
  useEffect(() => {
    setLogs(task.activity || []);
    return subscribeTaskActivity(
      task.id,
      (remote) => setLogs(remote),
      (error) => console.warn("activity subscription unavailable", error),
    );
  }, [task.id]);
  const visibleLogs = [...logs]
    .sort((a, b) => parseDue(b.createdAt) - parseDue(a.createdAt))
    .slice(0, 30);
  return (
    <div className="drawer-section activity-log-section">
      <div className="drawer-section-head">
        <strong>Activity log</strong>
        <span>{visibleLogs.length} รายการ</span>
      </div>
      {visibleLogs.length ? (
        <div className="activity-log">
          {visibleLogs.map((item, index) => (
            <div
              className="activity-row"
              key={item.id || `${item.action}-${item.createdAt}-${index}`}
            >
              <span>{item.actor?.[0] || "U"}</span>
              <p>
                <strong>{item.actor || "ผู้ใช้งาน"}</strong>{" "}
                {item.action || "อัปเดตงาน"}
                <small>
                  {relativeTime(item.createdAt) || "เมื่อสักครู่นี้"}
                </small>
              </p>
            </div>
          ))}
        </div>
      ) : (
        <small className="activity-empty">ยังไม่มีประวัติการเปลี่ยนแปลง</small>
      )}
    </div>
  );
}

function CommentAttachments({ attachments = [] }) {
  return (
    attachments.length > 0 && (
      <div className="comment-attachments">
        {attachments.map((file) =>
          file.type?.startsWith("image/") ? (
            <a
              className="comment-image-attachment"
              key={file.url}
              href={file.url}
              target="_blank"
              rel="noreferrer"
            >
              <img src={file.url} alt={file.name || "รูปภาพแนบ"} />
              <span>{file.name}</span>
            </a>
          ) : (
            <a key={file.url} href={file.url} target="_blank" rel="noreferrer">
              <Paperclip size={11} />
              {file.name}
            </a>
          ),
        )}
      </div>
    )
  );
}

function BetterRichTextEditor({ value, onChange, onImageUpload }) {
  const editorRef = useRef(null);
  const imageRef = useRef(null);
  const selectionRef = useRef(null);
  const changeRef = useRef(onChange);
  const [format, setFormat] = useState("p");
  const [color, setColor] = useState("#315676");
  useEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    if (
      editorRef.current &&
      editorRef.current.innerHTML !== (value || "") &&
      document.activeElement !== editorRef.current
    )
      editorRef.current.innerHTML = value || "";
  }, [value]);
  const rememberSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (
      editor &&
      selection?.rangeCount &&
      editor.contains(selection.anchorNode)
    )
      selectionRef.current = selection.getRangeAt(0).cloneRange();
  };
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return undefined;
    const rememberToolbarSelection = (event) => {
      if (event.target.closest?.(".editor-toolbar-modern")) rememberSelection();
    };
    const handleListEnter = (event) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      const selection = window.getSelection();
      if (!selection?.rangeCount) return;
      const node =
        selection.anchorNode?.nodeType === Node.ELEMENT_NODE
          ? selection.anchorNode
          : selection.anchorNode?.parentElement;
      const item = node?.closest?.("li");
      if (!item || !editor.contains(item)) return;
      if (!item.textContent?.trim()) return;
      event.preventDefault();
      const next = document.createElement("li");
      next.innerHTML = "<br>";
      item.after(next);
      const range = document.createRange();
      range.selectNodeContents(next);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      selectionRef.current = range.cloneRange();
      changeRef.current(editor.innerHTML);
    };
    editor.addEventListener("keydown", handleListEnter);
    editor.addEventListener("keyup", rememberSelection);
    editor.addEventListener("mouseup", rememberSelection);
    document.addEventListener("mousedown", rememberToolbarSelection, true);
    return () => {
      editor.removeEventListener("keydown", handleListEnter);
      editor.removeEventListener("keyup", rememberSelection);
      editor.removeEventListener("mouseup", rememberSelection);
      document.removeEventListener("mousedown", rememberToolbarSelection, true);
    };
  }, []);
  const focusEditor = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    if (
      selectionRef.current &&
      editor.contains(selectionRef.current.commonAncestorContainer)
    ) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(selectionRef.current);
    }
  };
  const emitChange = () =>
    changeRef.current(editorRef.current?.innerHTML || "");
  const run = (command, arg = null) => {
    focusEditor();
    document.execCommand(command, false, arg);
    emitChange();
  };
  const block = (event) => {
    setFormat(event.target.value);
    run("formatBlock", event.target.value);
  };
  const link = () => {
    const url = window.prompt("วาง URL ของลิงก์");
    if (url) run("createLink", url);
  };
  const addImage = async (file) => {
    if (!file) return;
    focusEditor();
    const url = onImageUpload
      ? await onImageUpload(file)
      : await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
    run("insertImage", url);
  };
  const tool = (label, title, action, icon) => (
    <button
      type="button"
      className="editor-tool"
      title={title}
      aria-label={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={action}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
  return (
    <div className="rich-editor rich-editor-modern">
      <div className="editor-toolbar-modern">
        <div className="editor-tool-group">
          <select
            value={format}
            aria-label="รูปแบบข้อความ"
            title="รูปแบบข้อความ"
            onChange={block}
          >
            <option value="p">ข้อความปกติ</option>
            <option value="h2">หัวข้อใหญ่</option>
            <option value="h3">หัวข้อย่อย</option>
            <option value="blockquote">คำพูดอ้างอิง</option>
          </select>
        </div>
        <div className="editor-tool-group">
          {tool("ย้อนกลับ", "ย้อนกลับ", () => run("undo"), <Undo2 size={15} />)}
          {tool("ทำซ้ำ", "ทำซ้ำ", () => run("redo"), <Redo2 size={15} />)}
        </div>
        <div className="editor-tool-group">
          {tool("ตัวหนา", "ตัวหนา", () => run("bold"), <Bold size={15} />)}
          {tool(
            "ตัวเอียง",
            "ตัวเอียง",
            () => run("italic"),
            <Italic size={15} />,
          )}
          {tool(
            "ขีดเส้นใต้",
            "ขีดเส้นใต้",
            () => run("underline"),
            <span className="editor-letter-tool">U</span>,
          )}
        </div>
        <div className="editor-tool-group">
          {tool(
            "หัวข้อย่อย",
            "รายการแบบจุด",
            () => run("insertUnorderedList"),
            <List size={15} />,
          )}
          {tool(
            "ลำดับเลข",
            "รายการแบบตัวเลข",
            () => run("insertOrderedList"),
            <ListOrdered size={15} />,
          )}
          {tool(
            "จัดชิดซ้าย",
            "จัดชิดซ้าย",
            () => run("justifyLeft"),
            <AlignLeft size={15} />,
          )}
        </div>
        <div className="editor-tool-group">
          <label className="editor-color-modern" title="สีตัวอักษร">
            <span style={{ color }}>A</span>
            <input
              type="color"
              value={color}
              aria-label="สีตัวอักษร"
              onChange={(event) => {
                setColor(event.target.value);
                run("foreColor", event.target.value);
              }}
            />
          </label>
          {tool("ลิงก์", "แทรกลิงก์", link, <Link2 size={15} />)}
          {tool(
            "รูปภาพ",
            "แทรกรูปภาพ",
            () => imageRef.current?.click(),
            <Upload size={15} />,
          )}
          <input
            ref={imageRef}
            hidden
            type="file"
            accept="image/*"
            onChange={(event) => {
              addImage(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
      </div>
      <div
        ref={editorRef}
        className="editor-content editor-content-modern"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        tabIndex={0}
        spellCheck
        onInput={(event) => {
          selectionRef.current = window.getSelection()?.rangeCount
            ? window.getSelection().getRangeAt(0).cloneRange()
            : selectionRef.current;
          changeRef.current(event.currentTarget.innerHTML);
        }}
        onBlur={(event) => changeRef.current(event.currentTarget.innerHTML)}
        data-placeholder="เริ่มเขียนรายละเอียดงาน..."
      />
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
