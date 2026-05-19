import { useState, useEffect, useCallback, useRef } from "react";
import { Spin, Select } from "antd";
import {
  HistoryOutlined, FilterOutlined, ReloadOutlined,
  CalendarOutlined, CheckCircleOutlined, CloseOutlined,
} from "@ant-design/icons";
import readerProfileService from "../../services/readerProfileService";
import borrowService        from "../../services/borrowService";
import { useToast }         from "../../components/Toast";
import "../../style/ReaderHistory.scss";

const PAGE_SIZE  = 8;
const RENEW_DAYS = 7;

const STATUS_OPTS = [
  { label: "Borrowing", value: "borrowing" },
  { label: "Overdue",   value: "overdue"   },
  { label: "Returned",  value: "returned"  },
];

const STATUS_META = {
  borrowing: { bg: "#e6f4ff", color: "#0958d9", label: "Borrowing" },
  overdue:   { bg: "#fff1f0", color: "#cf1322", label: "Overdue"   },
  returned:  { bg: "#f6ffed", color: "#389e0d", label: "Returned"  },
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric",
  }) : "—";

// ── Compute renewal eligibility on the client side ────
// Backend validates again on submit — this just controls UI display
function getRenewInfo(item) {
  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const dueDate  = new Date(item.due_date); dueDate.setHours(0, 0, 0, 0);
  const renewCount   = Number(item.renew_count  ?? 0);
  const renewLimit   = Number(item.renew_limit  ?? 2);
  const isActive     = item.status === "borrowing";
  const isOverdue    = dueDate < today;
  const hasQueue     = !!item.has_reservation_queue;
  const limitReached = renewCount >= renewLimit;
  const isSuspended  = item.user_status === "suspended";
  const isBanned     = item.user_status === "banned";

  const canRenew =
    isActive && !isOverdue && !hasQueue && !limitReached && !isSuspended && !isBanned;

  // Thứ tự ưu tiên: kiểm tra từ trên xuống, lý do cuối cùng match sẽ được dùng
  // Đặt các lý do quan trọng nhất ở cuối để ghi đè
  let disabledReason = null;
  if (!isActive)    disabledReason = item.status === "returned" ? null : "Book is overdue";
  if (limitReached) disabledReason = `Renewal limit reached (${renewLimit}/${renewLimit})`;
  if (hasQueue)     disabledReason = "Another reader has reserved this book";
  if (isOverdue)    disabledReason = "Book is overdue — please return it";
  if (isSuspended)  disabledReason = "Account suspended — return overdue books first";
  if (isBanned)     disabledReason = "Your account has been banned";

  const newDue = new Date(dueDate);
  newDue.setDate(newDue.getDate() + RENEW_DAYS);

  return {
    canRenew,
    disabledReason,
    renewCount,
    renewLimit,
    renewsRemaining: Math.max(0, renewLimit - renewCount),
    newDueDate: newDue,
  };
}

// ── Renew Confirmation Modal ──────────────────────────
function RenewModal({ item, onClose, onSuccess }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const info = getRenewInfo(item);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const res = await borrowService.renew(item.id);
      toast.success(`"${item.book_title}" renewed until ${fmtDate(res.new_due_date)}!`);
      onSuccess(res);
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to renew. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const dotsFilled = info.renewsRemaining - 1; // after this renewal
  const dotsTotal  = info.renewLimit;

  return (
    <div className="rh-modal-overlay" onClick={onClose}>
      <div className="rh-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="rh-modal-header">
          <div className="rh-modal-title">
            <ReloadOutlined className="rh-modal-icon" />
            <span>Renew Book</span>
          </div>
          <button className="rh-modal-close" onClick={onClose}>
            <CloseOutlined />
          </button>
        </div>

        {/* Body */}
        <div className="rh-modal-body">

          {/* Book card */}
          <div className="rh-modal-book">
            <img
              src={item.book_cover || "https://placehold.co/52x72?text=N/A"}
              alt={item.book_title}
              className="rh-modal-book-cover"
              onError={(e) => { e.target.src = "https://placehold.co/52x72?text=N/A"; }}
            />
            <div className="rh-modal-book-info">
              <div className="rh-modal-book-title">{item.book_title}</div>
              <div className="rh-modal-book-author">{item.book_author}</div>
              <code className="rh-modal-barcode">{item.barcode}</code>
            </div>
          </div>

          {/* Date change visualization */}
          <div className="rh-modal-dates">
            <div className="rh-modal-date-box rh-modal-date-box--old">
              <CalendarOutlined />
              <div>
                <span className="rh-modal-date-label">Current due date</span>
                <span className="rh-modal-date-value">{fmtDate(item.due_date)}</span>
              </div>
            </div>

            <div className="rh-modal-date-arrow">
              <svg width="36" height="20" viewBox="0 0 36 20">
                <path d="M2 10 H30 M24 4 L30 10 L24 16"
                  stroke="#2c8df4" strokeWidth="2.2"
                  strokeLinecap="round" strokeLinejoin="round"
                  fill="none" />
              </svg>
              <span className="rh-modal-date-plus">+{RENEW_DAYS} days</span>
            </div>

            <div className="rh-modal-date-box rh-modal-date-box--new">
              <CheckCircleOutlined />
              <div>
                <span className="rh-modal-date-label">New due date</span>
                <span className="rh-modal-date-value">{fmtDate(info.newDueDate)}</span>
              </div>
            </div>
          </div>

          {/* Renewals remaining dots */}
          <div className="rh-modal-renewals">
            <span className="rh-modal-renewals-label">Renewals after this:</span>
            <div className="rh-modal-renewals-dots">
              {Array.from({ length: dotsTotal }).map((_, i) => (
                <span
                  key={i}
                  className={`rh-modal-renewal-dot ${i < dotsFilled ? "rh-modal-renewal-dot--used" : "rh-modal-renewal-dot--avail"}`}
                />
              ))}
            </div>
            <span className="rh-modal-renewals-text">
              {dotsFilled > 0
                ? `${dotsFilled} renewal${dotsFilled > 1 ? "s" : ""} remaining`
                : "No more renewals after this"}
            </span>
          </div>

          {dotsFilled === 0 && (
            <div className="rh-modal-last-warn">
              ⚠ This is your last renewal. Please return the book by {fmtDate(info.newDueDate)}.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="rh-modal-footer">
          <button className="rh-modal-btn rh-modal-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="rh-modal-btn rh-modal-btn--confirm"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? <Spin size="small" /> : <><ReloadOutlined /> Confirm Renewal</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────
export default function ReaderBorrowHistory() {
  const toast = useToast();
  const [items,     setItems]     = useState([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [status,    setStatus]    = useState("");
  const [loading,   setLoading]   = useState(true);
  const [renewItem, setRenewItem] = useState(null); // item being renewed

  const statusRef = useRef("");
  const pageRef   = useRef(1);

  const load = useCallback(async (p, st) => {
    setLoading(true);
    try {
      const res = await readerProfileService.getHistory({
        page: p, limit: PAGE_SIZE, status: st,
      });
      setItems(res.history || []);
      setTotal(res.total   || 0);
    } catch {
      toast.error("Failed to load history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1, ""); }, []);

  const handleStatus = (val = "") => {
    setStatus(val);   statusRef.current = val;
    setPage(1);       pageRef.current   = 1;
    load(1, val);
  };

  const handlePage = (p) => {
    setPage(p);       pageRef.current = p;
    load(p, statusRef.current);
  };

  // After successful renewal, update the item in place without full reload
  const handleRenewSuccess = (res) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === renewItem.id
          ? {
              ...it,
              due_date:    res.new_due_date,
              renew_count: Number(it.renew_count ?? 0) + 1,
            }
          : it
      )
    );
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="reader-history">
      {/* Header */}
      <div className="rh-header">
        <h1><HistoryOutlined /> My Borrow History</h1>
        <div className="rh-filters">
          <Select
            allowClear
            placeholder="Filter by status"
            value={status || undefined}
            onChange={(val) => handleStatus(val ?? "")}
            style={{ width: 180 }}
            suffixIcon={<FilterOutlined style={{ color: "#2c8df4" }} />}
            options={STATUS_OPTS}
          />
          <span className="rh-count">{total} record{total !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {loading ? (
        <div className="rh-loading"><Spin size="large" /></div>
      ) : items.length === 0 ? (
        <div className="rh-empty">
          <HistoryOutlined />
          <p>No records found</p>
        </div>
      ) : (
        <>
          <div className="rh-list">
            {items.map((item) => {
              const m         = STATUS_META[item.status] || STATUS_META.returned;
              const isOverdue = item.status === "overdue";
              const info      = getRenewInfo(item);

              return (
                <div
                  key={item.id}
                  className={`rh-item ${isOverdue ? "rh-item--overdue" : ""}`}
                >
                  <img
                    src={item.book_cover || "https://placehold.co/56x80?text=N/A"}
                    alt={item.book_title}
                    className="rh-cover"
                    onError={(e) => { e.target.src = "https://placehold.co/56x80?text=N/A"; }}
                  />

                  <div className="rh-info">
                    <div className="rh-title">{item.book_title}</div>
                    <div className="rh-author">{item.book_author}</div>
                    <code className="rh-barcode">{item.barcode}</code>

                    <div className="rh-dates">
                      <span>Borrowed: <strong>{fmtDate(item.borrow_date)}</strong></span>
                      <span>
                        Due:{" "}
                        <strong style={{ color: isOverdue ? "#ff4d4f" : "inherit" }}>
                          {fmtDate(item.due_date)}
                        </strong>
                      </span>
                      {item.return_date && (
                        <span>
                          Returned:{" "}
                          <strong style={{ color: "#52c41a" }}>{fmtDate(item.return_date)}</strong>
                        </span>
                      )}
                      {/* Renewal count tag */}
                      {item.status === "borrowing" && Number(item.renew_count) > 0 && (
                        <span className="rh-renewed-tag">
                          <ReloadOutlined /> Renewed {item.renew_count}×
                        </span>
                      )}
                    </div>

                    {isOverdue && (
                      <div className="rh-overdue-warn">
                        ⚠ Book is overdue — please return it to reactivate your account
                      </div>
                    )}
                  </div>

                  {/* Right section: status badge + renew button */}
                  <div className="rh-item-right">
                    <span className="rh-badge" style={{ background: m.bg, color: m.color }}>
                      {m.label}
                    </span>

                    {/* Renew button — only for borrowing status */}
                    {item.status === "borrowing" && (
                      <div className="rh-renew-wrap">
                        {info.canRenew ? (
                          <button
                            className="rh-renew-btn"
                            onClick={() => setRenewItem(item)}
                            title={`${info.renewsRemaining} renewal${info.renewsRemaining > 1 ? "s" : ""} remaining`}
                          >
                            <ReloadOutlined />
                            <span>Renew</span>
                            <span className="rh-renew-count">{info.renewsRemaining}</span>
                          </button>
                        ) : (
                          info.disabledReason && (
                            <div className="rh-renew-disabled" title={info.disabledReason}>
                              <ReloadOutlined />
                              <span>Can't renew</span>
                            </div>
                          )
                        )}
                        {/* Renewals progress dots */}
                        <div className="rh-renew-dots">
                          {Array.from({ length: info.renewLimit }).map((_, i) => (
                            <span
                              key={i}
                              className={`rh-renew-dot ${
                                i < info.renewCount
                                  ? "rh-renew-dot--used"
                                  : "rh-renew-dot--avail"
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="rh-pagination">
              <button
                className="rh-pg-btn"
                disabled={page === 1}
                onClick={() => handlePage(page - 1)}
              >
                ‹ Prev
              </button>
              <span className="rh-pg-info">Page {page} / {totalPages}</span>
              <button
                className="rh-pg-btn"
                disabled={page === totalPages}
                onClick={() => handlePage(page + 1)}
              >
                Next ›
              </button>
            </div>
          )}
        </>
      )}

      {/* Renew Confirmation Modal */}
      {renewItem && (
        <RenewModal
          item={renewItem}
          onClose={() => setRenewItem(null)}
          onSuccess={handleRenewSuccess}
        />
      )}
    </div>
  );
}