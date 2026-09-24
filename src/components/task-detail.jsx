import React, { useEffect, useRef, useState } from "react";
import { AlignLeft, Bold, Check, Italic, Link2, List, ListOrdered, LogOut, MessageCircle, Paperclip, Plus, Redo2, Settings2, Sparkles, Undo2, Upload, X } from "lucide-react";
import { subscribeTaskActivity } from "../services";
import { parseDue } from "../utils/task";

function descriptionPreview(value) { if (!value) return ""; const container = document.createElement("div"); container.innerHTML = String(value); return (container.textContent || container.innerText || "").replace(/\s+/g, " ").trim(); }
function renderCommentText(value) { return String(value || "").split(/(@\[[^\]]+\]|#\[[^\]]+\]|\[\[[^\]]+\]\])/g).map((part, index) => /^@\[/.test(part) ? <span className="mention-token person" key={`${part}-${index}`}>{part}</span> : (/^#\[|^\[\[/.test(part) ? <span className="mention-token task" key={`${part}-${index}`}>{part}</span> : <span key={`${part}-${index}`}>{part}</span>)); }
function relativeTime(value) { const date = parseDue(value); if (!date) return ""; const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000)); if (minutes < 1) return "เมื่อสักครู่นี้"; if (minutes < 60) return `${minutes} นาทีที่แล้ว`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`; return `${Math.floor(hours / 24)} วันที่แล้ว`; }
function UserAvatar({ src, name, className }) { const [failed, setFailed] = useState(false); const normalized = src && src.includes("googleusercontent.com") && !src.includes("=") ? `${src}=s96-c` : src; return <div className={className}>{normalized && !failed ? <img src={normalized} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : name?.[0] || "G"}</div>; }
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


export { EnhancedTaskDrawer, EnhancedCreateTaskModal, TaskEditorDrawer, ProfileModal };
