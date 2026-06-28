import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Layout, Menu, Modal, Badge, Rate, Spin } from "antd";
import {
  LogoutOutlined, HomeOutlined, BookOutlined, UserOutlined,
  HistoryOutlined, MessageOutlined, BellOutlined, SaveOutlined,
  CheckOutlined, StarFilled, CloseOutlined, EditOutlined,
} from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import { logout }          from "../services/authService";
import notificationService from "../services/notificationService";
import reviewService       from "../services/reviewService";
import bookService         from "../services/bookService";
import { useToast }        from "./Toast";
import logo from "../assets/LibraryLogo.svg";
import "../style/ReaderSidebar.scss";

const { Sider } = Layout;

const MENU = [
  { key: "home",         icon: <HomeOutlined />,    label: "Home",         path: "/reader/home"         },
  { key: "books",        icon: <BookOutlined />,    label: "Books",        path: "/reader/books"        },
  { key: "reservations", icon: <SaveOutlined />,    label: "Reservations", path: "/reader/reservations" },
  { key: "history",      icon: <HistoryOutlined />, label: "My Borrows",   path: "/reader/history"      },
  // { key: "chat",         icon: <MessageOutlined />, label: "Chat",         path: "/reader/chat"         },
  { key: "profile",      icon: <UserOutlined />,    label: "My Profile",   path: "/reader/profile"      },
];

const fmtTime = (d) =>
  new Date(d).toLocaleString("vi-VN", {
    hour: "2-digit", minute: "2-digit",
    day: "2-digit",  month: "2-digit",
  });

const STAR_LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

// ── Notification title constants (must match backend) ──
// Used to decide whether to open review form on click
const TITLE_UPDATE_REVIEW = "Would you like to update your review?";

// ─────────────────────────────────────────────────────────
// Review Form Modal
// isUpdateMode = true  → pre-fill existing review, "Update" button
// isUpdateMode = false → blank form, "Submit" button
// ─────────────────────────────────────────────────────────
function ReviewFormModal({ bookId, isUpdateMode, onClose, onDone }) {
  const toast = useToast();

  const [book,     setBook]     = useState(null);
  const [rating,   setRating]   = useState(0);
  const [content,  setContent]  = useState("");
  const [saving,   setSaving]   = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    Promise.all([
      bookService.getById(bookId),
      isUpdateMode ? reviewService.getMyReview(bookId) : Promise.resolve(null),
    ])
      .then(([bookRes, reviewRes]) => {
        setBook(bookRes.book);
        if (isUpdateMode && reviewRes?.review) {
          setRating(reviewRes.review.rating);
          setContent(reviewRes.review.content || "");
        }
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [bookId, isUpdateMode]);

  const handleSubmit = async () => {
    if (!rating) { toast.warning("Please choose a star rating first"); return; }
    setSaving(true);
    try {
      await reviewService.upsert({ book_id: bookId, rating, content: content.trim() || null });
      toast.success(isUpdateMode ? "Review updated! 🎉" : "Review submitted! Thank you 🎉");
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to save review");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="rv-overlay" onClick={onClose}>
      <div className="rv-box" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="rv-header">
          <div className="rv-header-title">
            {isUpdateMode
              ? <><EditOutlined className="rv-header-icon" /> Update your review</>
              : <><StarFilled   className="rv-header-icon" /> Share your thoughts</>
            }
          </div>
          <button className="rv-close" onClick={onClose}><CloseOutlined /></button>
        </div>

        {/* Body */}
        <div className="rv-body">
          {fetching ? (
            <div className="rv-loading"><Spin size="large" /></div>
          ) : (
            <>
              {/* Book card */}
              {book && (
                <div className="rv-book-card">
                  <img
                    src={book.book_cover || "https://placehold.co/52x72?text=N/A"}
                    alt={book.title}
                    className="rv-book-cover"
                    onError={e => { e.target.src = "https://placehold.co/52x72?text=N/A"; }}
                  />
                  <div className="rv-book-info">
                    <div className="rv-book-title">{book.title}</div>
                    <div className="rv-book-author">{book.author || "Unknown author"}</div>
                    {isUpdateMode && (
                      <div className="rv-update-badge">
                        <EditOutlined /> Updating previous review
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Stars */}
              <div className="rv-stars-wrap">
                <span className="rv-stars-label">
                  {isUpdateMode ? "Your updated rating" : "Your rating"}
                </span>
                <Rate
                  value={rating}
                  onChange={setRating}
                  style={{ fontSize: "3.2rem", color: "#faad14" }}
                />
                <span className="rv-stars-hint">
                  {STAR_LABELS[rating] || "Tap a star to rate"}
                </span>
              </div>

              {/* Comment */}
              <div className="rv-comment-wrap">
                <label className="rv-comment-label">
                  {isUpdateMode ? "Update your comment" : "Your thoughts"}
                  <span className="rv-optional"> (optional)</span>
                </label>
                <textarea
                  className="rv-textarea"
                  placeholder={
                    isUpdateMode
                      ? "Update your thoughts about this book..."
                      : "What did you like or dislike? Your review helps other readers..."
                  }
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  rows={4}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!fetching && (
          <div className="rv-footer">
            <button className="rv-btn rv-btn--ghost" onClick={onClose}>
              Maybe later
            </button>
            <button
              className="rv-btn rv-btn--submit"
              onClick={handleSubmit}
              disabled={saving || !rating}
            >
              {saving
                ? <Spin size="small" />
                : isUpdateMode ? "Update Review" : "Submit Review"
              }
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────
// Main Sidebar
// ─────────────────────────────────────────────────────────
export default function ReaderSidebar() {
  const navigate   = useNavigate();
  const location   = useLocation();
  const toast      = useToast();
  const panelRef   = useRef(null);
  const triggerRef = useRef(null);

  const [showConfirm,   setShowConfirm]   = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  // Notification state
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [panelOpen,     setPanelOpen]     = useState(false);
  const [panelLoading,  setPanelLoading]  = useState(false);
  const [panelPos,      setPanelPos]      = useState({});

  // Review modal: { open, bookId, isUpdateMode }
  const [reviewModal, setReviewModal] = useState({
    open: false, bookId: null, isUpdateMode: false,
  });

  const activeKey = MENU.find(m => location.pathname.startsWith(m.path))?.key || "home";

  // ── Poll unread every 15 s ────────────────────────────
  const fetchUnread = useCallback(async () => {
    try {
      const res = await notificationService.getUnreadCount();
      setUnreadCount(res.unread_count ?? 0);
    } catch {}
  }, []);

  useEffect(() => {
    fetchUnread();
    const id = setInterval(fetchUnread, 15000);
    return () => clearInterval(id);
  }, [fetchUnread]);

  // ── Panel position — centred on bell button ───────────
  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect    = triggerRef.current.getBoundingClientRect();
    const PANEL_W = 360;
    const PANEL_H = 500;
    const GAP     = 14;
    const PAD     = 16;

    const left     = Math.max(PAD, Math.min(rect.right + GAP, window.innerWidth - PANEL_W - PAD));
    const btnMid   = rect.top + rect.height / 2;
    const idealTop = btnMid - PANEL_H / 2;
    const top      = Math.max(PAD, Math.min(idealTop, window.innerHeight - PANEL_H - PAD));

    setPanelPos({ left: `${left}px`, top: `${top}px` });
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (e.target.closest(".rs-notif-trigger")) return;
      setPanelOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [panelOpen]);

  // Reposition on resize / scroll
  useEffect(() => {
    if (!panelOpen) return;
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [panelOpen, updatePos]);

  // ── Toggle panel ──────────────────────────────────────
  const togglePanel = async () => {
    if (panelOpen) { setPanelOpen(false); return; }

    setPanelOpen(true);
    updatePos();
    setPanelLoading(true);
    try {
      const res = await notificationService.getAll({ limit: 30 });
      setNotifications(res.notifications || []);
      setUnreadCount(res.unread_count ?? 0);
    } catch {
      toast.error("Failed to load notifications");
    } finally {
      setPanelLoading(false);
    }
  };

  // ── Mark single notification read ─────────────────────
  const markOneRead = async (notif) => {
    if (notif.is_read) return;
    try {
      await notificationService.markRead(notif.id);
      setNotifications(prev =>
        prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  };

  // ── Notification click ────────────────────────────────
  // reference_id = book_id → review notification
  //
  // FIRST-TIME invite ("Share your thoughts"):
  //   • Already reviewed → lock: toast info, don't open form
  //   • Not yet reviewed → open NEW review form
  //
  // UPDATE invite ("Would you like to update your review?"):
  //   • review.updated_at > notif.created_at → user already updated
  //     after this notification → lock: toast info, don't reopen
  //   • Otherwise → open UPDATE form (pre-filled with current review)
  const handleNotifClick = async (notif) => {
    await markOneRead(notif);

    if (!notif.reference_id) return; // plain notification, nothing more to do

    const isUpdateInvite = notif.title === TITLE_UPDATE_REVIEW;

    let reviewData = null;
    try {
      const res = await reviewService.getMyReview(notif.reference_id);
      reviewData = res.review || null;
    } catch { /* ignore */ }

    if (isUpdateInvite) {
      // Lock if review was updated AFTER this notification was sent
      if (reviewData && reviewData.updated_at) {
        const reviewUpdatedAt  = new Date(reviewData.updated_at).getTime();
        const notifCreatedAt   = new Date(notif.created_at).getTime();
        if (reviewUpdatedAt > notifCreatedAt) {
          toast.info("You have already updated your review for this book.");
          return;
        }
      }
      // Open update form (pre-filled)
      setPanelOpen(false);
      setReviewModal({ open: true, bookId: notif.reference_id, isUpdateMode: true });
      return;
    }

    // First-time review invite
    if (reviewData) {
      // Already submitted — lock this notification
      toast.info("You have already reviewed this book. Borrow it again to update your review.");
      return;
    }

    // No review yet → open new review form
    setPanelOpen(false);
    setReviewModal({ open: true, bookId: notif.reference_id, isUpdateMode: false });
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      toast.error("Failed to mark all as read");
    }
  };

  const handleLogout = async () => {
    try {
      setLogoutLoading(true);
      await logout();
      toast.success("Logged out successfully!");
      setTimeout(() => navigate("/"), 500);
    } catch {
      localStorage.clear();
      navigate("/");
    } finally {
      setLogoutLoading(false);
      setShowConfirm(false);
    }
  };

  // ─────────────────────────────────────────────────────
  // Notification panel portal
  // ─────────────────────────────────────────────────────
  const notifPanel = panelOpen && createPortal(
    <div className="rs-panel" ref={panelRef} style={panelPos}>

      <div className="rs-panel-head">
        <span className="rs-panel-title">Notifications</span>
        {unreadCount > 0 && (
          <button className="rs-panel-mark-all" onClick={handleMarkAllRead}>
            <CheckOutlined /> Mark all read
          </button>
        )}
      </div>

      <div className="rs-panel-list">
        {panelLoading ? (
          <div className="rs-panel-spin"><Spin /></div>
        ) : notifications.length === 0 ? (
          <div className="rs-panel-empty">
            <BellOutlined />
            <p>No notifications yet</p>
          </div>
        ) : (
          notifications.map(n => {
            const isReview = !!n.reference_id;
            return (
              <div
                key={n.id}
                className={[
                  "rs-notif-item",
                  !n.is_read ? "rs-notif-item--unread" : "",
                  isReview   ? "rs-notif-item--review"  : "",
                ].filter(Boolean).join(" ")}
                onClick={() => handleNotifClick(n)}
              >
                {!n.is_read && <span className="rs-notif-dot" />}
                {isReview && <span className="rs-notif-star"><StarFilled /></span>}

                <div className="rs-notif-body">
                  <div className="rs-notif-title">{n.title}</div>
                  <div className="rs-notif-msg">{n.message}</div>
                  {isReview && <div className="rs-notif-cta">Tap to rate →</div>}
                  <div className="rs-notif-time">{fmtTime(n.created_at)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>,
    document.body
  );

  return (
    <>
      <Sider className="reader-sidebar" width={220} theme="light">

        <div className="rs-logo"><img src={logo} alt="Logo" /></div>

        <Menu
          mode="inline"
          selectedKeys={[activeKey]}
          className="rs-menu"
          onClick={({ key }) => {
            const item = MENU.find(m => m.key === key);
            if (item) navigate(item.path);
          }}
          items={MENU.map(item => ({ key: item.key, icon: item.icon, label: item.label }))}
        />

        <div className="rs-notif-area">
          <button
            ref={triggerRef}
            className={`rs-notif-trigger ${panelOpen ? "rs-notif-trigger--active" : ""}`}
            onClick={togglePanel}
          >
            <Badge count={unreadCount} size="small" offset={[4, -2]} overflowCount={99}>
              <BellOutlined className="rs-notif-icon" />
            </Badge>
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="rs-badge-pill">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        </div>

        <div className="rs-footer">
          <button
            className="rs-logout-btn"
            onClick={() => setShowConfirm(true)}
            disabled={logoutLoading}
          >
            <LogoutOutlined className="rs-logout-icon" />
            <span>Logout</span>
          </button>
        </div>
      </Sider>

      <Modal
        open={showConfirm}
        onOk={handleLogout}
        onCancel={() => setShowConfirm(false)}
        okText="Logout"
        cancelText="Cancel"
        okButtonProps={{ danger: true, loading: logoutLoading }}
        centered width={400}
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LogoutOutlined style={{ color: "#ff4d4f" }} /> Confirm Logout
          </div>
        }
      >
        <p style={{ fontSize: "1.4rem", color: "#595959", margin: "1.6rem 0", fontWeight: 500 }}>
          Are you sure you want to logout?
        </p>
      </Modal>

      {notifPanel}

      {reviewModal.open && reviewModal.bookId && (
        <ReviewFormModal
          bookId={reviewModal.bookId}
          isUpdateMode={reviewModal.isUpdateMode}
          onClose={() => setReviewModal({ open: false, bookId: null, isUpdateMode: false })}
          onDone={fetchUnread}
        />
      )}
    </>
  );
}