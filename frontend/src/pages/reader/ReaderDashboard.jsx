import { useState, useEffect } from "react";
import { Spin } from "antd";
import {
  BookOutlined, ClockCircleOutlined, CheckCircleOutlined,
  WarningOutlined, ReadOutlined,
} from "@ant-design/icons";
import readerProfileService from "../../services/readerProfileService";
import { useToast } from "../../components/Toast";
import { useNavigate } from "react-router-dom";
import "../../style/ReaderDashboard.scss";

const fmtDate = d => d ? new Date(d).toLocaleDateString("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric"}) : "—";

const STATUS_META = {
  borrowing: { bg:"#e6f4ff", color:"#0958d9", dot:"#2c8df4", label:"Borrowing" },
  overdue:   { bg:"#fff1f0", color:"#cf1322", dot:"#ff4d4f", label:"Overdue"   },
  returned:  { bg:"#f6ffed", color:"#389e0d", dot:"#52c41a", label:"Returned"  },
};

export default function ReaderDashboard() {
  const toast    = useToast();
  const navigate = useNavigate();

  const [user,          setUser]         = useState(null);
  const [activeBorrows, setActiveBorrows]= useState([]);
  const [topBooks,      setTopBooks]     = useState([]);
  const [loading,       setLoading]      = useState(true);

  useEffect(() => {
    Promise.all([
      readerProfileService.getMe(),
      readerProfileService.getDashboard(),
    ])
      .then(([meRes, dashRes]) => {
        setUser(meRes.user);
        setActiveBorrows(dashRes.activeBorrows || []);
        setTopBooks(dashRes.topBooks || []);
      })
      .catch(() => toast.error("Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display:"flex", justifyContent:"center", padding:"6rem" }}>
      <Spin size="large" />
    </div>
  );

  const statCards = [
    { label: "Currently Borrowing", value: user?.currently_borrowing ?? 0, icon: <BookOutlined />,        color: "#8ac7f7", iconColor: "#0581f5" },
    { label: "Overdue Books",        value: user?.overdue_count ?? 0,       icon: <WarningOutlined />,     color: "#ef8e88", iconColor: "#f41014" },
    { label: "Total Borrowed",       value: user?.total_borrows ?? 0,       icon: <ReadOutlined />,        color: "#aa7cef", iconColor: "#6c12ea" },
    { label: "Total Returned",       value: user?.total_returned ?? 0,      icon: <CheckCircleOutlined />, color: "#cef4a9", iconColor: "#47ca05" },
  ];

  return (
    <div className="reader-dashboard">
      {/* ── Welcome Banner ── */}
      <div className="rd-hero">
        <div className="rd-hero__left">
          <img
            src={user?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.full_name}`}
            alt={user?.full_name}
            className="rd-hero__avatar"
            onError={e => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.full_name}`; }}
          />
          <div>
            <h1 className="rd-hero__name">Hello, {user?.full_name?.split(" ").slice(-1)[0]}! </h1>
            <p className="rd-hero__sub">Welcome back to Mindspace Library</p>
          </div>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="rd-stats">
        {statCards.map((card, i) => (
          <div key={i} className="rd-stat-card" style={{ background: card.color }}>
            <div className="rd-stat-icon" style={{ color: card.iconColor }}>{card.icon}</div>
            <div className="rd-stat-num">{card.value}</div>
            <div className="rd-stat-lbl">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="rd-body">
        {/* ── Active Borrows ── */}
        <div className="rd-section">
          <div className="rd-section-header">
            <h2><ClockCircleOutlined /> Currently Borrowing</h2>
            <button className="rd-link" onClick={() => navigate("/reader/history")}>
              View all →
            </button>
          </div>

          {activeBorrows.length === 0 ? (
            <div className="rd-empty">
              <BookOutlined />
              <p>No active borrows</p>
            </div>
          ) : (
            <div className="rd-borrow-list">
              {activeBorrows.map(b => {
                const m        = STATUS_META[b.status] || STATUS_META.borrowing;
                const daysLeft = b.status === "overdue"
                  ? -Math.floor((Date.now() - new Date(b.due_date)) / 86400000)
                  : Math.ceil((new Date(b.due_date) - Date.now()) / 86400000);
                return (
                  <div key={b.id} className={`rd-borrow-item ${b.status === "overdue" ? "rd-borrow-item--overdue" : ""}`}>
                    <img
                      src={b.book_cover || "https://placehold.co/48x64?text=N/A"}
                      alt={b.book_title}
                      onError={e => { e.target.src = "https://placehold.co/48x64?text=N/A"; }}
                    />
                    <div className="rd-borrow-info">
                      <div className="rd-borrow-title">{b.book_title}</div>
                      <div className="rd-borrow-author">{b.book_author}</div>
                      <div className="rd-borrow-dates">
                        Due: <strong style={{ color: b.status === "overdue" ? "#ff4d4f" : "#262626" }}>
                          {fmtDate(b.due_date)}
                        </strong>
                        {b.status === "overdue"
                          ? <span className="rd-days-tag rd-days-tag--late">{Math.abs(daysLeft)}d overdue</span>
                          : <span className="rd-days-tag">{daysLeft}d left</span>
                        }
                      </div>
                    </div>
                    <span className="rd-status-dot" style={{ background: m.bg, color: m.color, borderColor: m.dot }}>
                      {m.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Popular Books ── */}
        <div className="rd-section">
          <div className="rd-section-header">
            <h2><ReadOutlined /> Popular Books</h2>
            <button className="rd-link" onClick={() => navigate("/reader/books")}>Browse all →</button>
          </div>
          <div className="rd-top-books">
            {topBooks.map((bk, i) => (
              <div key={bk.id} className="rd-top-book">
                <span className={`rd-rank rank-${i+1}`}>#{i+1}</span>
                <img
                  src={bk.book_cover || "https://placehold.co/48x64?text=N/A"}
                  alt={bk.title}
                  onError={e => { e.target.src = "https://placehold.co/48x64?text=N/A"; }}
                />
                <div className="rd-top-book-info">
                  <div className="rd-top-book-title">{bk.title}</div>
                  <div className="rd-top-book-author">{bk.author}</div>
                  <div className="rd-top-book-loans">{bk.borrowed_all_time} borrows</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}