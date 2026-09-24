export function currentStepDue(task) {
  return task.steps?.find((step) => step.status === task.status)?.due || task.due || "";
}

export function parseDue(value) {
  if (!value || value === "ยังไม่กำหนด") return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "object" && value.seconds) {
    return new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000));
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function dueAtEndOfDay(value) {
  const parsed = parseDue(value);
  if (!parsed) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 23, 59, 59, 999);
  }
  return parsed;
}

export function deadlineState(task) {
  const due = dueAtEndOfDay(currentStepDue(task));
  if (!due || ["เสร็จ", "รูปภาพเสร็จแล้ว", "Finish", "Work Done", "Completed", "Done"].includes(task.status)) return "";
  const days = (due.getTime() - Date.now()) / 86400000;
  if (days < 0) return "overdue";
  if (days <= 3) return "soon";
  return "";
}

export function isOverdue(task) {
  const due = dueAtEndOfDay(currentStepDue(task));
  return Boolean(due && due < new Date() && !["เสร็จ", "รูปภาพเสร็จแล้ว", "Finish", "Work Done", "Completed", "Done"].includes(task.status));
}
