import React, { useState, useEffect, useCallback, useRef } from "react";
import { Spin, Select } from "antd";
import {
  EyeOutlined, CloseOutlined, CheckCircleOutlined,
  UserOutlined, CalendarOutlined, BookOutlined,
  SortAscendingOutlined, DeleteOutlined,
  ScanOutlined, SwapOutlined, WarningOutlined,
  ExclamationCircleOutlined, StopOutlined,
} from "@ant-design/icons";
import SearchBar        from "../../components/SearchBar";
import Table            from "../../components/Table";
import CustomPagination from "../../components/Pagination";
import Filter           from "../../components/Filter";
import QrScanner        from "../../components/QrScanner";
import borrowService    from "../../services/borrowService";
import { useToast }     from "../../components/Toast";
import "../../style/BorrowManagement.scss";

const PAGE_SIZE    = 8;

// Các option filter trạng thái, tương ứng với query params backend
const STATUS_FILTER = [
  { label: "Borrowing", value: "borrowing" },
  { label: "Overdue",   value: "overdue"   },
  { label: "Returned",  value: "returned"  },
];

// Các option sắp xếp, tương ứng với query params backend
const SORT_OPTIONS = [
  { label: "Borrow Date ↓", sortBy: "borrow_date", sortOrder: "DESC" },
  { label: "Borrow Date ↑", sortBy: "borrow_date", sortOrder: "ASC"  },
  { label: "Due Date ↓",    sortBy: "due_date",    sortOrder: "DESC" },
  { label: "Due Date ↑",    sortBy: "due_date",    sortOrder: "ASC"  },
];

// Mapping trạng thái sang màu sắc và label hiển thị
const STATUS_META = {
  borrowing: { bg: "#e6f4ff", color: "#0958d9", border: "#91caff", dot: "#2c8df4", label: "Borrowing" },
  overdue:   { bg: "#fff1f0", color: "#cf1322", border: "#ffa39e", dot: "#ff4d4f", label: "Overdue"   },
  returned:  { bg: "#f6ffed", color: "#389e0d", border: "#b7eb8f", dot: "#52c41a", label: "Returned"  },
};

const StatusBadge = ({ status }) => {
  const m = STATUS_META[status] || STATUS_META.borrowing;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "0.5rem",
      padding: "0.3rem 1rem", borderRadius: "2rem",
      fontSize: "1.2rem", fontWeight: 600,
      background: m.bg, color: m.color, border: `0.1rem solid ${m.border}`,
    }}>
      <span style={{ width: "0.6rem", height: "0.6rem", borderRadius: "50%", background: m.dot, flexShrink: 0 }} />
      {m.label}
    </span>
  );
};

const fmtDate  = (d) => d ? new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
const defaultDueDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().split("T")[0];
};

// Modal: VIEW DETAIL

function ViewModal({ borrowId, onClose }) {
  const toast = useToast();
  const [borrow, setBorrow]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    borrowService.getById(borrowId)
      .then(res => setBorrow(res.borrow))
      .catch(() => { toast.error("Failed to load detail"); onClose(); })
      .finally(() => setLoading(false));
  }, [borrowId]);

  if (loading) return (
    <div className="bm-overlay">
      <div className="bm-modal bm-modal--view" style={{ justifyContent: "center", alignItems: "center", minHeight: "30rem" }}>
        <Spin size="large" />
      </div>
    </div>
  );
  if (!borrow) return null;

  const overdue = borrow.status === "overdue" ||
    (borrow.status === "borrowing" && new Date(borrow.due_date) < new Date());
  const overdueDays = (overdue && !borrow.return_date)
    ? Math.max(0, Math.floor((Date.now() - new Date(borrow.due_date)) / 86400000))
    : 0;

  return (
    <div className="bm-overlay" onClick={onClose}>
      <div className="bm-modal bm-modal--view" onClick={e => e.stopPropagation()}>
        <div className="bm-modal__header">
          <div className="bm-modal__title"><EyeOutlined /><span>Transaction Detail</span></div>
          <button className="bm-btn-close" onClick={onClose}><CloseOutlined /></button>
        </div>
        <div className="bm-modal__body">
          <div className="bm-view-banner">
            <span className="bm-view-id">#{borrow.id}</span>
            <StatusBadge status={borrow.status} />
          </div>

          <div className="bm-view-section">
            <h4><BookOutlined /> Book</h4>
            <div className="bm-view-book">
              <img src={borrow.book_cover || "https://placehold.co/56x80?text=N/A"} alt={borrow.book_title}
                   onError={e => { e.target.src = "https://placehold.co/56x80?text=N/A"; }} />
              <div>
                <div className="bm-view-book-title">{borrow.book_title}</div>
                <div className="bm-view-sub">{borrow.book_author}</div>
                <code className="bm-code">{borrow.barcode}</code>
              </div>
            </div>
          </div>

          <div className="bm-view-section">
            <h4><UserOutlined /> Reader</h4>
            <div className="bm-view-reader">
              <img
                src={borrow.reader_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${borrow.reader_name}`}
                alt={borrow.reader_name} className="bm-view-avatar"
                onError={e => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${borrow.reader_name}`; }}
              />
              <div>
                <div className="bm-view-reader-name">{borrow.reader_name}</div>
                <div className="bm-view-sub">{borrow.reader_email}</div>
              </div>
            </div>
          </div>

          <div className="bm-view-section">
            <h4><CalendarOutlined /> Dates</h4>
            <div className="bm-date-grid">
              {[
                { label: "Borrow Date", value: fmtDate(borrow.borrow_date), color: "inherit"                         },
                { label: "Due Date",    value: fmtDate(borrow.due_date),    color: overdue ? "#ff4d4f" : "inherit"   },
                { label: "Return Date", value: fmtDate(borrow.return_date), color: borrow.return_date ? "#52c41a" : "#bfbfbf" },
              ].map((item, i) => (
                <div key={i} className="bm-date-item">
                  <label>{item.label}</label>
                  <span style={{ color: item.color }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {overdueDays > 0 && (
              <div className="bm-overdue-notice">
                <WarningOutlined />
                <span>Overdue <strong>{overdueDays} day{overdueDays > 1 ? "s" : ""}</strong></span>
              </div>
            )}

        </div>
        <div className="bm-modal__footer">
          <button className="bm-btn bm-btn--secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// Modal: BORROW

const BORROW_STEP = { READER: "READER", BOOKS: "BOOKS" };

function BorrowModal({ onClose, onDone }) {
  const toast = useToast(); //
  const [step,         setStep]         = useState(BORROW_STEP.READER); 
  const [checking,     setChecking]     = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [readerInfo,   setReaderInfo]   = useState(null); 
  const [scannedBooks, setScannedBooks] = useState([]); 
  const [dueDate,      setDueDate]      = useState(defaultDueDate()); 
  const [cameraReady,  setCameraReady]  = useState(false); 
  const stepRef             = useRef(BORROW_STEP.READER); 
  const checkingRef         = useRef(false); 
  const readerInfoRef       = useRef(null); 
  const scannedBooksRef     = useRef([]); 
  const readerScannedSetRef = useRef(new Set()); 
  const bookScannedSetRef   = useRef(new Set()); 
  const pausedTextsRef      = useRef(new Map()); 
  const cameraReadyTimer = useRef(null); 

  useEffect(() => { stepRef.current         = step;         }, [step]); 
  useEffect(() => { checkingRef.current     = checking;     }, [checking]); 
  useEffect(() => { readerInfoRef.current   = readerInfo;   }, [readerInfo]); 
  useEffect(() => { scannedBooksRef.current = scannedBooks; }, [scannedBooks]);

 // Khi chuyển sang step BOOKS, delay 500ms mới active camera để tránh quét nhầm QR thẻ SV vừa quét ở step READER
  useEffect(() => {
    if (step === BORROW_STEP.BOOKS) {
      setCameraReady(false);
      cameraReadyTimer.current = setTimeout(() => setCameraReady(true), 500);
    } else {
      setCameraReady(false);
    }
    return () => clearTimeout(cameraReadyTimer.current);
  }, [step]);

                 
  useEffect(() => () => clearTimeout(cameraReadyTimer.current), []);

  // Kiểm tra text có đang bị pause không
  const isTextPaused = useCallback((text) => {
    const until = pausedTextsRef.current.get(text);
    if (!until) return false;
    if (Date.now() > until) {
      pausedTextsRef.current.delete(text); // Hết hạn → xóa
      return false;
    }
    return true;
  }, []);

  // Pause 1 text cụ thể trong ms milliseconds
  const pauseText = useCallback((text, ms = 5000) => {
    pausedTextsRef.current.set(text, Date.now() + ms);
  }, []);

  // Xử lý kết quả quét QR từ QrScanner
  const handleQrScan = useCallback(async (text) => {
  
    if (checkingRef.current) return; 

    // STEP 1: Quét thẻ sinh viên để lấy thông tin reader và kiểm tra điều kiện mượn
    if (stepRef.current === BORROW_STEP.READER) {

      if (readerScannedSetRef.current.has(text)) return; 
      if (isTextPaused(text)) return; 

      setChecking(true); 
      try { 
        const info = await borrowService.checkReader(text);
        readerScannedSetRef.current.add(text);
        setReaderInfo(info);
        if (info.canBorrow) {
          setStep(BORROW_STEP.BOOKS);
          toast.success(`Reader verified: ${info.full_name}`);
        }
      } catch (err) {
        toast.error(err.message || "Reader not found"); 
        pauseText(text, 5000);
      } finally {
        setChecking(false);
      }

    // STEP 2: Quét sách 
    } else if (stepRef.current === BORROW_STEP.BOOKS) {
      // QR thẻ SV vẫn còn trong khung → bỏ qua silent
      if (readerScannedSetRef.current.has(text)) return;

      const barcode = text.toUpperCase();

      if (isTextPaused(barcode)) return;

      if (bookScannedSetRef.current.has(barcode)) {
        // Đã quét cuốn này → pause luôn để không spam toast
        pauseText(barcode, 3000);
        toast.warning("Already scanned this book");
        return;
      }

      const info      = readerInfoRef.current;
      const remaining = info.maxBorrowLimit - info.currentBorrowing - scannedBooksRef.current.length;
      if (remaining <= 0) {
        pauseText(barcode, 2000);
        toast.warning("Borrow limit reached");
        return;
      }

      setChecking(true);
      try {
               const copy = await borrowService.checkBarcode(barcode);
        bookScannedSetRef.current.add(barcode);
        setScannedBooks(prev => [...prev, copy]);
 
        if (copy.has_reservation) {
          toast.warning(
            `⚠ "${copy.book_title}" has a pending reservation from ${copy.reservation_reader}. ` +
            `Please verify with the reader before proceeding.`,
            6
          );
        } else {
          toast.success(`Added: ${copy.book_title}`);
        }
      } catch (err) {
        toast.error(err.message || "Invalid barcode or book not available");
        pauseText(barcode, 4000);
      } finally {
        setChecking(false);
      }
    }
  }, [toast, isTextPaused, pauseText]);
 
  // Xóa sách đã quét khỏi danh sách
  const removeBook = (barcode) => {
    bookScannedSetRef.current.delete(barcode);
    setScannedBooks(prev => prev.filter(b => b.barcode !== barcode));
  };

  // Xóa toàn bộ state liên quan đến quét để bắt đầu lại
  const clearAllState = () => {
    readerScannedSetRef.current.clear();
    bookScannedSetRef.current.clear();
    pausedTextsRef.current.clear();
  };

  // Reset về step 1 và xóa toàn bộ state liên quan đến quét
  const handleReset = () => {
    setStep(BORROW_STEP.READER);
    setReaderInfo(null);
    setScannedBooks([]);
    setDueDate(defaultDueDate());
    clearAllState();
  };

  const handleSubmit = async () => {
    if (!scannedBooks.length) { toast.warning("No books scanned"); return; }
    try {
      setSubmitting(true);
      await borrowService.createBatch({
        user_id:  readerInfo.id,
        due_date: dueDate,
        items:    scannedBooks.map(b => ({ book_copy_id: b.id, book_id: b.book_id })),
      });
      toast.success(`${scannedBooks.length} book(s) borrowed successfully!`);
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to borrow");
    } finally {
      setSubmitting(false);
    }
  };

  const remaining = readerInfo
    ? readerInfo.maxBorrowLimit - readerInfo.currentBorrowing - scannedBooks.length
    : 0;

  return (
    <div className="bm-overlay" onClick={onClose}>
      <div className="bm-modal bm-modal--scanner" onClick={e => e.stopPropagation()}>

        <div className="bm-modal__header">
          <div className="bm-modal__title"><ScanOutlined /><span>Borrow Books</span></div>
          <button className="bm-btn-close" onClick={onClose}><CloseOutlined /></button>
        </div>

        <div className="bm-steps">
          <div className={`bm-step ${step === BORROW_STEP.READER ? "bm-step--active" : "bm-step--done"}`}>
            <span className="bm-step-dot">1</span> Scan Student Card
          </div>
          <div className="bm-step-arrow">→</div>
          <div className={`bm-step ${step === BORROW_STEP.BOOKS ? "bm-step--active" : ""}`}>
            <span className="bm-step-dot">2</span> Scan Books
          </div>
        </div>

        <div className="bm-modal__body">

          {/* STEP 1: Quét thẻ sinh viên  */}
          {step === BORROW_STEP.READER && (
            <div className="bm-scanner-layout">
              <div className="bm-camera-col">
                <div className="bm-camera-label">
                  <UserOutlined /> Point camera at Student ID card
                </div>

                {/* active=true luôn ở step 1, checking chỉ là gate trong QrScanner */}
                <QrScanner onScan={handleQrScan} active={true} />

                {checking && (
                  <div className="bm-checking-overlay"><Spin /> Verifying...</div>
                )}
              </div>

              <div className="bm-result-col">
                {!readerInfo ? (
                  <div className="bm-scan-waiting">
                    <UserOutlined />
                    <p>Waiting for QR scan...</p>
                    <small>Scan the QR code on the student card</small>
                  </div>
                ) : (
                  <div className={`bm-reader-card ${readerInfo.canBorrow ? "bm-reader-card--ok" : "bm-reader-card--fail"}`}>
                    <div className="bm-reader-card-hero">
                      <img
                        src={readerInfo.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${readerInfo.full_name}`}
                        alt={readerInfo.full_name}
                        onError={e => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${readerInfo.full_name}`; }}
                      />
                      <div>
                        <div className="bm-reader-card-name">{readerInfo.full_name}</div>
                        <div className="bm-reader-card-email">{readerInfo.email}</div>
                        <div className="bm-reader-card-stats">
                          Borrowing: <strong>{readerInfo.currentBorrowing}/{readerInfo.maxBorrowLimit}</strong>
                          {readerInfo.overdueCount > 0 && (
                            <span className="bm-badge-danger">{readerInfo.overdueCount} overdue</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {readerInfo.canBorrow ? (
                      <div className="bm-reader-ok">
                        <CheckCircleOutlined /> Eligible · {readerInfo.maxBorrowLimit - readerInfo.currentBorrowing} slot(s) left
                      </div>
                    ) : (
                      <div className="bm-reader-fail">
                        <ExclamationCircleOutlined /> Not eligible:
                        <ul>{readerInfo.violations.map((v, i) => <li key={i}>{v}</li>)}</ul>
                      </div>
                    )}

                    <div className="bm-card-actions">
                      <button
                        className="bm-btn bm-btn--ghost bm-btn--sm"
                        onClick={() => {
                          setReaderInfo(null);
                          clearAllState();
                        }}
                      >
                        Scan Again
                      </button>
                      {readerInfo.canBorrow && (
                        <button
                          className="bm-btn bm-btn--primary bm-btn--sm"
                          onClick={() => setStep(BORROW_STEP.BOOKS)}
                        >
                          Continue →
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/*  STEP 2: Quét sách  */}
          {step === BORROW_STEP.BOOKS && (
            <div className="bm-scanner-layout">
              <div className="bm-camera-col">
                <div className="bm-reader-mini">
                  <img
                    src={readerInfo.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${readerInfo.full_name}`}
                    alt={readerInfo.full_name}
                    onError={e => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${readerInfo.full_name}`; }}
                  />
                  <div>
                    <div className="bm-reader-mini-name">{readerInfo.full_name}</div>
                    <div className="bm-reader-mini-sub">
                      {remaining > 0
                        ? `${remaining} slot(s) remaining`
                        : <span style={{ color: "#ff4d4f" }}>Limit reached</span>
                      }
                    </div>
                  </div>
                  <button
                    className="bm-btn bm-btn--ghost bm-btn--xs"
                    onClick={() => {
                      setReaderInfo(null);
                      setScannedBooks([]);
                      clearAllState();
                      setStep(BORROW_STEP.READER);
                    }}
                  >
                    Change
                  </button>
                </div>

                <div className="bm-camera-label">
                  <BookOutlined /> Scan book barcode / QR
                </div>

                {remaining > 0 ? (
                  <>
                    {/* cameraReady delay 800ms: tránh bắt ngay QR thẻ SV vừa quét */}
                    <QrScanner
                      onScan={handleQrScan}
                      active={cameraReady}
                    />
                    {(!cameraReady || checking) && (
                      <div className="bm-checking-overlay">
                        <Spin /> {!cameraReady ? "Starting camera..." : "Checking book..."}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="bm-scan-waiting bm-scan-waiting--warn">
                    <StopOutlined />
                    <p>Limit reached</p>
                    <small>Submit or remove a book first</small>
                  </div>
                )}

                <div className="bm-due-row">
                  <label>Due Date</label>
                  <input
                    type="date"
                    className="bm-date-input"
                    value={dueDate}
                    min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                    onChange={e => setDueDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="bm-result-col">
                <div className="bm-result-title">
                  Scanned Books <span className="bm-count-badge">{scannedBooks.length}</span>
                </div>

                {scannedBooks.length === 0 ? (
                  <div className="bm-scan-waiting">
                    <BookOutlined />
                    <p>No books yet</p>
                    <small>Point camera at book barcode or QR</small>
                  </div>
                ) : (
                  <div className="bm-scanned-list">
                    {scannedBooks.map((book, idx) => (
                      <div key={book.barcode} className="bm-scanned-item">
                        <span className="bm-scanned-num">{idx + 1}</span>
                        <img
                          src={book.book_cover || "https://placehold.co/32x44?text=N/A"}
                          alt={book.book_title}
                          onError={e => { e.target.src = "https://placehold.co/32x44?text=N/A"; }}
                        />
                        <div className="bm-scanned-info">                         <div className="bm-scanned-title">{book.book_title}</div>
                         <div className="bm-scanned-author">{book.book_author}</div>
                          <code className="bm-code-sm">{book.barcode}</code>
                       </div>
                        <button className="bm-remove-btn" onClick={() => removeBook(book.barcode)}>
                          <DeleteOutlined />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="bm-modal__footer">
          <button
            className="bm-btn bm-btn--secondary"
            onClick={step === BORROW_STEP.READER ? onClose : handleReset}
          >
            {step === BORROW_STEP.READER ? "Cancel" : "Reset"}
          </button>
          {step === BORROW_STEP.BOOKS && (
            <button
              className="bm-btn bm-btn--primary"
              onClick={handleSubmit}
              disabled={submitting || scannedBooks.length === 0}
            >
              {submitting
                ? <Spin size="small" />
                : <><CheckCircleOutlined /> Confirm Borrow ({scannedBooks.length})</>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Modal: RETURN
// Quét từng barcode sách → hiện thông tin → submit tất cả

// ReturnModal — replacement (no fine display)
// Replace the entire ReturnModal function in BorrowManagement.jsx with this

function ReturnModal({ onClose, onDone }) {
  const toast = useToast();
  const [checking,     setChecking]     = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [scannedItems, setScannedItems] = useState([]);

  const checkingRef     = useRef(false);
  const scannedItemsRef = useRef([]);
  const pausedTextsRef  = useRef(new Map());

  useEffect(() => { checkingRef.current     = checking;     }, [checking]);
  useEffect(() => { scannedItemsRef.current = scannedItems; }, [scannedItems]);

  const isTextPaused = useCallback((text) => {
    const until = pausedTextsRef.current.get(text);
    if (!until) return false;
    if (Date.now() > until) { pausedTextsRef.current.delete(text); return false; }
    return true;
  }, []);

  const pauseText = useCallback((text, ms = 4000) => {
    pausedTextsRef.current.set(text, Date.now() + ms);
  }, []);

  const handleQrScan = useCallback(async (text) => {
    if (checkingRef.current) return;

    const barcode = text.toUpperCase();
    if (isTextPaused(barcode)) return;

    if (scannedItemsRef.current.find(i => i.barcode === barcode)) {
      toast.warning("Already in return list");
      pauseText(barcode, 3000);
      return;
    }

    setChecking(true);
    try {
      const info = await borrowService.checkReturnBarcode(barcode);

      // Block mixing readers
      const existing = scannedItemsRef.current;
      if (existing.length > 0 && existing[0].user_id !== info.user_id) {
        toast.error(
          `This book belongs to "${info.reader_name}" — different from "${existing[0].reader_name}". ` +
          `You can only return books for one reader at a time.`
        );
        pauseText(barcode, 4000);
        return;
      }

      setScannedItems(prev => [...prev, info]);

      if (info.overdue_days > 0) {
        toast.warning(`${info.book_title} — ${info.overdue_days} day(s) overdue`);
      } else {
        toast.success(`Added: ${info.book_title}`);
      }
    } catch (err) {
      toast.error(err.message || "Book not found or not borrowed");
      pauseText(barcode, 4000);
    } finally {
      setChecking(false);
    }
  }, [toast, isTextPaused, pauseText]);

  const removeItem = (barcode) => {
    pausedTextsRef.current.delete(barcode);
    setScannedItems(prev => prev.filter(i => i.barcode !== barcode));
  };

  const handleSubmit = async () => {
    if (!scannedItems.length) { toast.warning("No books scanned"); return; }
    try {
      setSubmitting(true);
      await borrowService.returnBatch(scannedItems.map(i => i.borrow_id));
      toast.success(`${scannedItems.length} book(s) returned successfully!`);
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to process return");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bm-overlay" onClick={onClose}>
      <div className="bm-modal bm-modal--scanner" onClick={e => e.stopPropagation()}>
        <div className="bm-modal__header">
          <div className="bm-modal__title" style={{ color: "#389e0d" }}>
            <SwapOutlined /><span>Return Books</span>
          </div>
          <button className="bm-btn-close" onClick={onClose}><CloseOutlined /></button>
        </div>

        <div className="bm-modal__body">
          <div className="bm-scanner-layout">

            {/* Camera */}
            <div className="bm-camera-col">
              <div className="bm-camera-label">
                <BookOutlined /> Scan book barcode / QR
              </div>
              <QrScanner onScan={handleQrScan} active={!checking} />
              {checking && (
                <div className="bm-checking-overlay">
                  <Spin /> Looking up...
                </div>
              )}
            </div>

            {/* Return list */}
            <div className="bm-result-col">
              <div className="bm-result-title">
                Books to Return <span className="bm-count-badge">{scannedItems.length}</span>
              </div>

              {scannedItems.length === 0 ? (
                <div className="bm-scan-waiting">
                  <SwapOutlined />
                  <p>No books yet</p>
                  <small>Scan the barcode on each book cover</small>
                </div>
              ) : (
                <div className="bm-scanned-list">
                  {scannedItems.map((item, idx) => (
                    <div
                      key={item.barcode}
                      className={`bm-scanned-item ${item.overdue_days > 0 ? "bm-scanned-item--overdue" : ""}`}
                    >
                      <span className="bm-scanned-num">{idx + 1}</span>
                      <img
                        src={item.book_cover || "https://placehold.co/32x44?text=N/A"}
                        alt={item.book_title}
                        onError={e => { e.target.src = "https://placehold.co/32x44?text=N/A"; }}
                      />
                      <div className="bm-scanned-info">
                        <div className="bm-scanned-title">{item.book_title}</div>
                        <div className="bm-scanned-meta">
                          <span className="bm-meta-reader">{item.reader_name}</span>
                          <span className="bm-meta-dot">·</span>
                          <span className="bm-meta-date">Due {fmtDate(item.due_date)}</span>
                        </div>
                        {item.overdue_days > 0 && (
                          <div className="bm-fine-tag">
                            ⚠ Overdue {item.overdue_days} day(s)
                          </div>
                        )}
                      </div>
                      <button className="bm-remove-btn" onClick={() => removeItem(item.barcode)}>
                        <DeleteOutlined />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bm-modal__footer">
          <button className="bm-btn bm-btn--secondary" onClick={onClose}>Cancel</button>
          <button
            className="bm-btn bm-btn--success"
            onClick={handleSubmit}
            disabled={submitting || scannedItems.length === 0}
          >
            {submitting
              ? <Spin size="small" />
              : <><CheckCircleOutlined /> Confirm Return ({scannedItems.length})</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
// Main Page

const BorrowManagement = () => {
  const toast = useToast();

  const [borrows,   setBorrows]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [search,    setSearch]    = useState("");
  const [status,    setStatus]    = useState("");
  const [sortBy,    setSortBy]    = useState("borrow_date");
  const [sortOrder, setSortOrder] = useState("DESC");

  const sortByRef    = useRef("borrow_date");
  const sortOrderRef = useRef("DESC");
  const searchRef    = useRef("");
  const statusRef    = useRef("");
  const pageRef      = useRef(1);
  const searchTimer  = useRef(null);

  const [viewId,     setViewId]     = useState(null);
  const [borrowOpen, setBorrowOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

  const loadBorrows = useCallback(async (p, s, st, sb, so) => {
    try {
      setLoading(true);
      const res = await borrowService.getAll({ page: p, limit: PAGE_SIZE, search: s, status: st, sortBy: sb, sortOrder: so });
      setBorrows(res.borrows || []);
      setTotal(res.total    || 0);
    } catch {
      toast.error("Failed to load records");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBorrows(1, "", "", "borrow_date", "DESC"); }, []);

  const handleSearch = (value) => {
    const v = value.trimStart();
    setSearch(v); searchRef.current = v;
    setPage(1);   pageRef.current   = 1;
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() =>
      loadBorrows(1, v.trim(), statusRef.current, sortByRef.current, sortOrderRef.current), 400);
  };

  const handleStatusFilter = (value) => {
    setStatus(value); statusRef.current = value;
    setPage(1);       pageRef.current   = 1;
    loadBorrows(1, searchRef.current, value, sortByRef.current, sortOrderRef.current);
  };

  const handleSortChange = (val) => {
    const [sb, so] = val.split("__");
    setSortBy(sb);    sortByRef.current    = sb;
    setSortOrder(so); sortOrderRef.current = so;
    setPage(1);       pageRef.current      = 1;
    loadBorrows(1, searchRef.current, statusRef.current, sb, so);
  };

  const handlePageChange = (p) => {
    setPage(p); pageRef.current = p;
    loadBorrows(p, searchRef.current, statusRef.current, sortByRef.current, sortOrderRef.current);
  };

  const handleReset = () => {
    setSearch("");    searchRef.current    = "";
    setStatus("");    statusRef.current    = "";
    setSortBy("borrow_date"); sortByRef.current = "borrow_date";
    setSortOrder("DESC");     sortOrderRef.current = "DESC";
    setPage(1);               pageRef.current      = 1;
    loadBorrows(1, "", "", "borrow_date", "DESC");
  };

  const reload = () =>
    loadBorrows(pageRef.current, searchRef.current, statusRef.current, sortByRef.current, sortOrderRef.current);

  const hasFilter = search || status || sortBy !== "borrow_date" || sortOrder !== "DESC";

  const getActions = (row) => ([{
    label: "View Detail",
    icon:  <EyeOutlined />,
    className: "view",
    onClick: () => setViewId(row.id),
  }]);

  const columns = [
    {
      key: "_stt", label: "STT", sortable: false,
      render: (_, __, idx) => <span className="bm-stt">{(page - 1) * PAGE_SIZE + idx + 1}</span>,
    },
    {
      key: "book_title", label: "Book", sortable: false,
      render: (value, row) => (
        <div className="bm-book-cell">
          <img src={row.book_cover || "https://placehold.co/32x44?text=N/A"} alt={value}
               onError={e => { e.target.src = "https://placehold.co/32x44?text=N/A"; }} />
          <div>
            <div className="bm-book-title">{value}</div>
          </div>
        </div>
      ),
    },
    {
      key: "reader_name", label: "Reader", sortable: false,
      render: (value, row) => (
        <div className="bm-reader-cell">
          <img src={row.reader_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${value}`}
               alt={value} className="bm-table-avatar"
               onError={e => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${value}`; }} />
          <span>{value}</span>
        </div>
      ),
    },
    {
      key: "borrow_date", label: "Borrow Date", sortable: false,
      render: v => <span className="bm-date">{fmtDate(v)}</span>,
    },
    {
      key: "due_date", label: "Due Date", sortable: false,
      render: (v, row) => {
        const od = row.status === "overdue" || (row.status === "borrowing" && new Date(v) < new Date());
        return <span className="bm-date" style={{ color: od ? "#ff4d4f" : "inherit", fontWeight: od ? 600 : 400 }}>{fmtDate(v)}</span>;
      },
    },
    {
      key: "return_date", label: "Return Date", sortable: false,
      render: v => v
        ? <span className="bm-date" style={{ color: "#52c41a" }}>{fmtDate(v)}</span>
        : <span style={{ color: "#bfbfbf" }}>—</span>,
    },
    {
      key: "status", label: "Status", sortable: false,
      render: v => <StatusBadge status={v} />,
    },
  ];

  return (
    <div className="borrow-management">
      <div className="header">
        <h1 className="tittle">Borrow Management</h1>
        <div className="header-actions">
          <Filter filterName="Status" options={STATUS_FILTER} value={status} onChange={handleStatusFilter} />
          <Select
            value={`${sortBy}__${sortOrder}`} style={{ width: 180 }}
            onChange={handleSortChange}
            suffixIcon={<SortAscendingOutlined style={{ color: "#088ef5", fontSize: "1.5rem" }} />}
            options={SORT_OPTIONS.map(o => ({ label: o.label, value: `${o.sortBy}__${o.sortOrder}` }))}
          />
          <SearchBar value={search} onChange={handleSearch} placeholder="Search book, reader, barcode..." />
          {hasFilter && <button className="btn-reset" onClick={handleReset}>✕</button>}
          <button className="btn-borrow" onClick={() => setBorrowOpen(true)}>
            <ScanOutlined /> Borrow
          </button>
          <button className="btn-return" onClick={() => setReturnOpen(true)}>
            <SwapOutlined /> Return
          </button>
        </div>
      </div>

      {(search || status) && (
        <div className="filter-summary">
          {search && <span className="filter-tag">🔍 "{search}"</span>}
          {status && <span className="filter-tag">📋 {status}</span>}
          <span className="filter-count">{total} result{total !== 1 ? "s" : ""} found</span>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "6rem" }}><Spin size="large" /></div>
      ) : borrows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📚</div>
          <p>{search || status ? "No records match" : "No borrow records yet"}</p>
          {(search || status) && <button className="btn-reset" onClick={handleReset}>Clear filters</button>}
        </div>
      ) : (
        <Table
          columns={columns}
          rows={borrows}
          getActions={getActions}
          rowClassName={row => row.status === "overdue" ? "bm-row--overdue" : ""}
        />
      )}

      {!loading && borrows.length > 0 && (
        <CustomPagination total={total} pageSize={PAGE_SIZE} currentPage={page} onChange={handlePageChange} />
      )}

      {viewId      && <ViewModal   borrowId={viewId}  onClose={() => setViewId(null)} />}
      {borrowOpen  && <BorrowModal onClose={() => setBorrowOpen(false)} onDone={reload} />}
      {returnOpen  && <ReturnModal onClose={() => setReturnOpen(false)} onDone={reload} />}
    </div>
  );
};

export default BorrowManagement;