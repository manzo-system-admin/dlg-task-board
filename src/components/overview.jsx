import React from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Layers3,
  UsersRound,
} from "lucide-react";
import { boardConfigs } from "../data";
import { PageTitle } from "./shared";
import { currentStepDue, deadlineState, parseDue } from "../utils/task";

const completedStatuses = [
  "เสร็จ",
  "รูปภาพเสร็จแล้ว",
  "Finish",
  "Work Done",
  "Completed",
  "Done",
];

function isCompleted(task) {
  return completedStatuses.includes(task.status);
}

function dayStart(value = new Date()) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function daysFromToday(value) {
  const due = parseDue(value);
  if (!due) return null;
  return Math.round((dayStart(due) - dayStart()) / 86400000);
}

function formatDate(value) {
  const date = parseDue(value);
  if (!date) return "ยังไม่กำหนด";
  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function activityDate(value) {
  const date = parseDue(value);
  if (!date) return "เมื่อสักครู่นี้";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "เมื่อสักครู่นี้";
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} ชั่วโมงที่แล้ว`;
  return `${Math.floor(minutes / 1440)} วันที่แล้ว`;
}

function OverviewMetric({ icon: Icon, label, value, note, tone = "navy" }) {
  return (
    <div className={`overview-metric ${tone}`}>
      <div className="overview-metric-top">
        <span>{label}</span>
        <Icon size={16} />
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function PanelHeading({ eyebrow, title, icon: Icon }) {
  return (
    <div className="overview-panel-heading">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {Icon ? <Icon size={17} /> : null}
    </div>
  );
}

export function OverviewPage({ tasks, users, onSelect }) {
  const summary = tasks.reduce(
    (result, task) => {
      const due = currentStepDue(task);
      const offset = daysFromToday(due);
      result.total += 1;
      if (isCompleted(task)) result.completed += 1;
      else result.open += 1;
      if (!isCompleted(task) && deadlineState(task) === "overdue") result.overdue += 1;
      if (!isCompleted(task) && offset === 0) result.today += 1;
      if (!isCompleted(task) && offset !== null && offset >= 0 && offset <= 7) result.nextSeven += 1;
      if (!task.assignees?.length) result.unassigned += 1;
      if (!isCompleted(task) && task.priority === "สูง") result.highPriority += 1;
      return result;
    },
    { total: 0, completed: 0, open: 0, overdue: 0, today: 0, nextSeven: 0, unassigned: 0, highPriority: 0 },
  );

  const departmentRows = Object.entries(boardConfigs).map(([key, config]) => {
    const departmentTasks = tasks.filter((task) => task.board === key);
    const completed = departmentTasks.filter(isCompleted).length;
    const overdue = departmentTasks.filter(
      (task) => !isCompleted(task) && deadlineState(task) === "overdue",
    ).length;
    const active = departmentTasks.length - completed;
    return {
      key,
      config,
      tasks: departmentTasks,
      completed,
      overdue,
      active,
      progress: departmentTasks.length
        ? Math.round((completed / departmentTasks.length) * 100)
        : 0,
    };
  });

  const statusRows = departmentRows.flatMap(({ key, config, tasks: departmentTasks }) =>
    config.statuses
      .map((status) => ({
        key: `${key}-${status}`,
        label: status,
        board: config.label,
        color: config.color,
        count: departmentTasks.filter((task) => task.status === status).length,
      }))
      .filter((row) => row.count > 0),
  );

  const attentionTasks = tasks
    .filter((task) => !isCompleted(task) && (deadlineState(task) || task.priority === "สูง"))
    .sort((a, b) => {
      const aState = deadlineState(a) === "overdue" ? 0 : a.priority === "สูง" ? 1 : 2;
      const bState = deadlineState(b) === "overdue" ? 0 : b.priority === "สูง" ? 1 : 2;
      return aState - bState || (parseDue(currentStepDue(a)) || Infinity) - (parseDue(currentStepDue(b)) || Infinity);
    })
    .slice(0, 6);

  const recentActivity = tasks
    .flatMap((task) =>
      (task.activity || []).map((item) => ({
        ...item,
        task,
      })),
    )
    .sort((a, b) => (parseDue(b.createdAt) || 0) - (parseDue(a.createdAt) || 0))
    .slice(0, 6);

  const unassignedTasks = tasks.filter((task) => !task.assignees?.length).slice(0, 5);
  const progress = summary.total ? Math.round((summary.completed / summary.total) * 100) : 0;

  return (
    <>
      <PageTitle
        eyebrow="COMMAND CENTER"
        title="ภาพรวมองค์กร"
        text="มองเห็นสถานะ งานค้าง และจุดที่ต้องจัดการของทุกแผนกในหน้าเดียว"
      />

      <div className="overview-live-note">
        <span className="live-dot" /> อัปเดตแบบ realtime จากงานทั้งหมดใน workspace
        <span className="overview-live-note-count">{summary.total} งาน</span>
      </div>

      <div className="overview-metrics-grid">
        <OverviewMetric icon={Layers3} label="งานทั้งหมด" value={summary.total} note={`${summary.open} งานที่ยังเปิดอยู่`} />
        <OverviewMetric icon={CheckCircle2} label="ความคืบหน้า" value={`${progress}%`} note={`${summary.completed} งานเสร็จแล้ว`} tone="teal" />
        <OverviewMetric icon={AlertTriangle} label="ต้องจัดการ" value={summary.overdue} note="งานเกินกำหนด" tone="coral" />
        <OverviewMetric icon={CalendarDays} label="7 วันข้างหน้า" value={summary.nextSeven} note={`${summary.today} งานครบกำหนดวันนี้`} tone="yellow" />
        <OverviewMetric icon={UsersRound} label="ยังไม่มอบหมาย" value={summary.unassigned} note={`${summary.highPriority} งาน priority สูง`} tone="purple" />
      </div>

      <div className="overview-command-grid">
        <section className="overview-panel overview-status-panel">
          <PanelHeading eyebrow="STATUS OVERVIEW" title="งานอยู่ตรงไหนของ workflow" icon={Activity} />
          <div className="overview-status-list">
            {statusRows.length ? statusRows.map((row) => (
              <button key={row.key} className="overview-status-row" onClick={() => onSelect(tasks.find((task) => task.board === row.key.split("-")[0] && task.status === row.label))}>
                <span className="overview-status-name"><i style={{ background: row.color }} />{row.board}<b>{row.label}</b></span>
                <span className="overview-status-bar"><i style={{ width: `${Math.min(row.count * 18, 100)}%`, background: row.color }} /></span>
                <strong>{row.count}</strong>
              </button>
            )) : <div className="overview-empty">ยังไม่มีข้อมูลสถานะ</div>}
          </div>
        </section>

        <section className="overview-panel overview-attention-panel">
          <PanelHeading eyebrow="NEEDS ATTENTION" title="งานที่ควรจัดการก่อน" icon={AlertTriangle} />
          <div className="overview-attention-list">
            {attentionTasks.length ? attentionTasks.map((task) => {
              const state = deadlineState(task);
              return (
                <button key={task.id} className="overview-attention-row" onClick={() => onSelect(task)}>
                  <span className={`attention-icon ${state || "priority"}`}>{state === "overdue" ? "!" : "•"}</span>
                  <span className="attention-copy"><strong>{task.title}</strong><small>{boardConfigs[task.board]?.label} · {task.status}</small></span>
                  <span className="attention-meta">{state === "overdue" ? "เกินกำหนด" : task.priority === "สูง" ? "Priority สูง" : formatDate(currentStepDue(task))}<ArrowUpRight size={14} /></span>
                </button>
              );
            }) : <div className="overview-empty">ไม่มีงานที่ต้องเร่งจัดการ</div>}
          </div>
        </section>
      </div>

      <section className="overview-panel overview-department-panel">
        <PanelHeading eyebrow="DEPARTMENT HEALTH" title="ภาพรวม workload รายแผนก" icon={UsersRound} />
        <div className="department-health-table">
          <div className="department-health-head"><span>แผนก</span><span>งานทั้งหมด</span><span>กำลังทำ</span><span>เสร็จแล้ว</span><span>เกินกำหนด</span><span>ความคืบหน้า</span></div>
          {departmentRows.map((row) => (
            <button key={row.key} className="department-health-row" onClick={() => row.tasks[0] && onSelect(row.tasks[0])}>
              <span className="department-cell"><i style={{ background: row.config.color }} /><strong>{row.config.label}</strong></span>
              <b>{row.tasks.length}</b><b>{row.active}</b><b className="done-number">{row.completed}</b><b className={row.overdue ? "overdue-number" : ""}>{row.overdue}</b>
              <span className="department-progress"><i><b style={{ width: `${row.progress}%`, background: row.config.color }} /></i><strong>{row.progress}%</strong></span>
            </button>
          ))}
        </div>
      </section>

      <div className="overview-lower-grid">
        <section className="overview-panel">
          <PanelHeading eyebrow="RECENT ACTIVITY" title="ความเคลื่อนไหวล่าสุด" icon={Clock3} />
          <div className="overview-activity-list">
            {recentActivity.length ? recentActivity.map((item, index) => (
              <button key={item.id || `${item.task.id}-${index}`} className="overview-activity-row" onClick={() => onSelect(item.task)}>
                <span className="activity-avatar">{(item.author || item.user || "D")[0]}</span>
                <span><strong>{item.action || "มีการอัปเดตงาน"}</strong><small>{item.task.title} · {activityDate(item.createdAt)}</small></span>
              </button>
            )) : <div className="overview-empty">ยังไม่มี activity ล่าสุด</div>}
          </div>
        </section>
        <section className="overview-panel">
          <PanelHeading eyebrow="UNASSIGNED WORK" title="งานที่ยังไม่มีผู้รับผิดชอบ" icon={UsersRound} />
          <div className="overview-activity-list">
            {unassignedTasks.length ? unassignedTasks.map((task) => (
              <button key={task.id} className="overview-activity-row" onClick={() => onSelect(task)}>
                <span className="activity-avatar empty">?</span>
                <span><strong>{task.title}</strong><small>{boardConfigs[task.board]?.label} · {task.status} · {formatDate(currentStepDue(task))}</small></span>
              </button>
            )) : <div className="overview-empty">ทุกงานมีผู้รับผิดชอบแล้ว</div>}
          </div>
        </section>
      </div>
    </>
  );
}
