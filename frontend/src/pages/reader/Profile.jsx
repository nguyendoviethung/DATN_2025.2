import { useState, useEffect, useRef } from "react";
import { Spin } from "antd";
import { EditOutlined, CameraOutlined, SaveOutlined, CloseOutlined, UserOutlined } from "@ant-design/icons";
import readerProfileService from "../../services/readerProfileService";
import { useToast }         from "../../components/Toast";
import "../../style/ReaderProfile.scss";

const fmtDate = d => d ? new Date(d).toLocaleDateString("vi-VN", { day:"2-digit", month:"2-digit", year:"numeric" }) : "—";

function resizeImage(file, maxSize = 400) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = e => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale  = Math.min(1, maxSize / Math.max(img.width, img.height));
        canvas.width  = img.width  * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

export default function Profile() {
  const toast   = useToast();
  const fileRef = useRef(null);

  const [user,       setUser]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [editing,    setEditing]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [form,       setForm]       = useState({ full_name: "", phone: "", address: "" });
  const [avatarPrev, setAvatarPrev] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);

  const fetchUser = () => {
    setLoading(true);
    readerProfileService.getMe()
      .then(res => {
        setUser(res.user);
        setForm({ full_name: res.user.full_name || "", phone: res.user.phone || "", address: res.user.address || "" });
      })
      .catch(() => toast.error("Failed to load profile"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUser(); }, []);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("File must be under 10MB"); return; }
    try {
      const base64 = await resizeImage(file, 400);
      setAvatarPrev(base64);
      setAvatarFile(base64);
    } catch { toast.error("Failed to process image"); }
    e.target.value = "";
  };

  const handleAvatarSave = async () => {
    if (!avatarFile) return;
    setSaving(true);
    try {
      const res = await readerProfileService.updateAvatar({ avatar_url: avatarFile });
      setUser(u => ({ ...u, avatar_url: res.avatar_url }));
      setAvatarPrev(null);
      setAvatarFile(null);
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      localStorage.setItem("user", JSON.stringify({ ...stored, avatar_url: res.avatar_url }));
      toast.success("Avatar updated!");
    } catch { toast.error("Failed to update avatar"); }
    finally  { setSaving(false); }
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) { toast.warning("Name is required"); return; }
    setSaving(true);
    try {
      const res = await readerProfileService.updateProfile(form);
      setUser(u => ({ ...u, ...res.user }));
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      localStorage.setItem("user", JSON.stringify({ ...stored, full_name: res.user.full_name }));
      setEditing(false);
      toast.success("Profile updated!");
    } catch { toast.error("Failed to update profile"); }
    finally  { setSaving(false); }
  };

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: "6rem" }}>
      <Spin size="large" />
    </div>
  );
  if (!user) return null;

  const displayAvatar = avatarPrev || user.avatar_url ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.full_name}`;

  return (
    <div className="reader-profile">
      <h1 className="rp-title"><UserOutlined /> My Profile</h1>

      {/* ── Avatar Card ── */}
      <div className="rp-avatar-card">
        <div className="rp-avatar-wrap">
          <img
            src={displayAvatar}
            alt={user.full_name}
            className="rp-avatar"
            onError={e => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.full_name}`; }}
          />
          <button className="rp-avatar-edit-btn" onClick={() => fileRef.current?.click()} title="Change avatar">
            <CameraOutlined />
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
        </div>

        <div className="rp-avatar-info">
          <h2>{user.full_name}</h2>
          <p>{user.email}</p>
          <span className="rp-student-id">Student ID: {user.student_id || "—"}</span>
        </div>

        {avatarPrev && (
          <div className="rp-avatar-actions">
            <p className="rp-avatar-hint">New avatar preview. Save to apply.</p>
            <div style={{ display: "flex", gap: "0.8rem" }}>
              <button className="rp-btn rp-btn--ghost" onClick={() => { setAvatarPrev(null); setAvatarFile(null); }}>
                <CloseOutlined /> Cancel
              </button>
              <button className="rp-btn rp-btn--primary" onClick={handleAvatarSave} disabled={saving}>
                {saving ? <Spin size="small" /> : <><SaveOutlined /> Save Avatar</>}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Personal Info ── */}
      <div className="rp-info-card">
        <div className="rp-info-header">
          <h3>Personal Information</h3>
          {!editing && (
            <button className="rp-btn rp-btn--ghost rp-btn--sm" onClick={() => setEditing(true)}>
              <EditOutlined /> Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="rp-edit-form">
            <div className="rp-field">
              <label>Full Name <span style={{ color: "#ff4d4f" }}>*</span></label>
              <input
                value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                placeholder="Enter your full name"
              />
            </div>
            <div className="rp-field">
              <label>Phone Number</label>
              <input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="e.g. 0912 345 678"
              />
            </div>
            <div className="rp-field rp-field--full">
              <label>Address</label>
              <textarea
                rows={3}
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="Your address..."
              />
            </div>
            <div className="rp-edit-actions">
              <button
                className="rp-btn rp-btn--ghost"
                onClick={() => {
                  setEditing(false);
                  setForm({ full_name: user.full_name || "", phone: user.phone || "", address: user.address || "" });
                }}
              >
                <CloseOutlined /> Cancel
              </button>
              <button className="rp-btn rp-btn--primary" onClick={handleSave} disabled={saving}>
                {saving ? <Spin size="small" /> : <><SaveOutlined /> Save Changes</>}
              </button>
            </div>
          </div>
        ) : (
          <div className="rp-info-grid">
            {[
              { label: "Full Name",    value: user.full_name },
              { label: "Email",        value: user.email },
              { label: "Phone",        value: user.phone || "—" },
              { label: "Student ID",   value: user.student_id || "—" },
              { label: "Address",      value: user.address || "—" },
              { label: "Member Since", value: fmtDate(user.created_at) },
              { label: "Status",       value: <span className={`rp-status rp-status--${user.status}`}>{user.status}</span> },
            ].map((item, i) => (
              <div key={i} className="rp-info-row">
                <span className="rp-info-label">{item.label}</span>
                <span className="rp-info-value">{item.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}