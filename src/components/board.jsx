import React, { useEffect, useState } from "react";
import { CalendarDays, ClipboardList, FileText, LayoutDashboard, ListFilter, MessageCircle, MoreHorizontal, Plus, Search, Settings2, Sparkles, Tag, Users, X } from "lucide-react";
import { boardConfigs } from "../data";
import { PageTitle, FilterSelect } from "./shared";
import { currentStepDue, deadlineState, isOverdue } from "../utils/task";
function BoardPage({
  activeBoard,
  onSelectBoard,
  CalendarPage,
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
        <CalendarPage tasks={tasks} onSelect={onSelect} compact />
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


export { BoardPage, TaskTable, TaskCardV2, EmptyState };
