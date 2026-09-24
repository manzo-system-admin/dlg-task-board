import React, { useRef, useState, useEffect } from "react";
import { ListFilter } from "lucide-react";

export function PageTitle({ eyebrow, title, text, actions }) {
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

export function FilterSelect({ icon: Icon = ListFilter, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const selected = options.find((option) => option.value === value) || options[0];
  return (
    <div ref={ref} className={`select-filter custom-select ${open ? "open" : ""}`}>
      <Icon size={15} />
      <button type="button" className="filter-select-trigger" onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open}>
        <span>{selected?.label || value}</span>
        <i />
      </button>
      {open && <div className="filter-option-menu" role="listbox">{options.map((option) => <button type="button" role="option" aria-selected={option.value === value} className={option.value === value ? "selected" : ""} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}>{option.label}</button>)}</div>}
    </div>
  );
}
