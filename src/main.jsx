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
import { BoardPage, TaskTable } from "./components/board";
import { PageTitle } from "./components/shared";
import { EnhancedFilesPageDrive } from "./components/files";
import { EnhancedTaskDrawer, TaskEditorDrawer, ProfileModal } from "./components/task-detail";
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
  getMentionNotifications,
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
    setupWebPush()
      .then(({ token, unsubscribe: stop }) => {
        unsubscribe = stop;
        if (token) saveMessagingToken(authUser.uid, token);
      })
      .catch((error) => console.warn("web push setup unavailable", error));
    return () => unsubscribe();
  }, [authUser?.uid]);
  useEffect(() => subscribeFileLinks((remote) => setFiles(remote)), []);
  useEffect(
    () =>
      subscribeFolders(
        (remote) => setFolders(remote.map((item) => item.path).filter(Boolean)),
        (error) => console.warn("folders subscription unavailable", error),
      ),
    [],
  );
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
    recipientsForTask = (task) => {
      const recipients = (task.assignees || [])
        .map((name) => users.find((user) => user.name === name))
        .filter((user) => user?.uid && user.uid !== authUser?.uid);
      return [...new Map(recipients.map((user) => [user.uid, user])).values()];
    };
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
      const mentions = getMentionNotifications(task.id, task.title, text, userLabel, users, tasks);
      const mentionedIds = new Set(mentions.map((item) => item.recipientId));
      await addTaskComment(task.id, comment, recipientsForTask(task).filter((recipient) => !mentionedIds.has(recipient.uid)));
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
          CalendarPage={EnhancedCalendarPage}
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
createRoot(document.getElementById("root")).render(<App />);
