import React, { useState } from "react";
import { Search, List, FolderKanban, FileText, FolderPlus, Link2, X } from "lucide-react";
import { createFileLink, createFolder, deleteFileLink, deleteFolder, updateFileLink } from "../services";
import { EmptyState } from "./board";
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


export { EnhancedFilesPageDrive };
