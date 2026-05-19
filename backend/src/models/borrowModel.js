import getPool from '../config/db.js';

const MAX_BORROW_LIMIT = 5;
const RENEW_DAYS       = 7;   // extend by 7 days per renewal

const BorrowModel = {

  // 1. Kiểm tra reader có đủ điều kiện mượn không
  async checkReader(studentId) {
    const cleanedId = studentId.trim();
    const userRes = await getPool().query(
      `SELECT id, full_name, email, avatar_url, status
       FROM users
       WHERE (student_id = $1 OR id::text = $1)
         AND role = 'reader'
       LIMIT 1`,
      [cleanedId]
    );
    if (!userRes.rows[0]) throw new Error('Reader not found');
    const user = userRes.rows[0];
    if (user.status === 'suspended') throw new Error('Account is suspended');
    if (user.status === 'banned')    throw new Error('Account is banned');
    if (user.status !== 'active')    throw new Error('Account is not active');

    const borrowingRes = await getPool().query(
      `SELECT COUNT(*) AS count FROM borrows
       WHERE user_id = $1 AND status IN ('borrowing', 'overdue')`,
      [user.id]
    );
    const currentBorrowing = Number(borrowingRes.rows[0].count);

    const overdueRes = await getPool().query(
      `SELECT COUNT(*) AS count FROM borrows
       WHERE user_id = $1 AND status = 'overdue'`,
      [user.id]
    );
    const overdueCount = Number(overdueRes.rows[0].count);

    return {
      id:              user.id,
      full_name:       user.full_name,
      email:           user.email,
      avatar_url:      user.avatar_url,
      status:          user.status,
      currentBorrowing,
      overdueCount,
      maxBorrowLimit:  MAX_BORROW_LIMIT,
      canBorrow:
        overdueCount === 0 &&
        currentBorrowing < MAX_BORROW_LIMIT,
      violations: [
        ...(overdueCount > 0  ? [`Has ${overdueCount} overdue book(s) — please return before borrowing`] : []),
        ...(currentBorrowing >= MAX_BORROW_LIMIT ? [`Borrow limit reached (${currentBorrowing}/${MAX_BORROW_LIMIT})`] : []),
      ],
    };
  },

  // 2. Kiểm tra barcode sách để mượn
  async checkBarcode(barcode) {
    const res = await getPool().query(
      `SELECT
         bc.id, bc.barcode, bc.status AS copy_status,
         bk.id AS book_id, bk.title AS book_title,
         bk.author AS book_author, bk.book_cover, bk.genre
       FROM book_copies bc
       JOIN books bk ON bk.id = bc.book_id
       WHERE bc.barcode = $1`,
      [barcode.trim().toUpperCase()]
    );
    if (!res.rows[0]) throw new Error('Barcode not found');
    const copy = res.rows[0];
    if (copy.copy_status !== 'available')
      throw new Error(`Book is currently ${copy.copy_status}`);

    const resvRes = await getPool().query(
      `SELECT r.id, r.user_id, r.status, r.reserved_at,
              u.full_name AS reader_name, u.email AS reader_email
       FROM book_reservations r
       JOIN users u ON u.id = r.user_id
       WHERE r.book_id = $1
         AND r.status IN ('pending', 'ready')
       ORDER BY r.reserved_at ASC
       LIMIT 1`,
      [copy.book_id]
    );

    return {
      ...copy,
      has_reservation:    !!resvRes.rows[0],
      reservation_reader: resvRes.rows[0]?.reader_name  || null,
      reservation_email:  resvRes.rows[0]?.reader_email || null,
      reservation_status: resvRes.rows[0]?.status       || null,
    };
  },

  // 3. Mượn nhiều sách cùng lúc
  async createBatch({ user_id, items, due_date }) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const activeCount = await client.query(
        `SELECT COUNT(*) AS c FROM borrows
         WHERE user_id = $1 AND status IN ('borrowing','overdue')`,
        [user_id]
      );
      if (Number(activeCount.rows[0].c) + items.length > MAX_BORROW_LIMIT) {
        throw new Error(`Borrow limit exceeded. Currently borrowing ${activeCount.rows[0].c}, trying to add ${items.length}`);
      }

      const createdIds = [];
      for (const item of items) {
        const copyCheck = await client.query(
          `SELECT status FROM book_copies WHERE id = $1 FOR UPDATE`,
          [item.book_copy_id]
        );
        if (copyCheck.rows[0]?.status !== 'available') {
          throw new Error(`Book copy ${item.book_copy_id} is no longer available`);
        }

        const br = await client.query(
          `INSERT INTO borrows (user_id, book_copy_id, borrow_date, due_date, status)
           VALUES ($1, $2, CURRENT_DATE, $3, 'borrowing')
           RETURNING id`,
          [user_id, item.book_copy_id, due_date]
        );
        createdIds.push(br.rows[0].id);

        await client.query(
          `UPDATE book_copies SET status = 'borrowed' WHERE id = $1`,
          [item.book_copy_id]
        );
        await client.query(
          `UPDATE books SET available = available - 1 WHERE id = $1`,
          [item.book_id]
        );

        await client.query(
          `UPDATE book_reservations
           SET status = 'fulfilled'
           WHERE user_id = $1 AND book_id = $2 AND status = 'ready'`,
          [user_id, item.book_id]
        );
      }
      await client.query('COMMIT');
      return createdIds;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // 4. Kiểm tra barcode để trả sách
  async checkReturnBarcode(barcode) {
    const res = await getPool().query(
      `SELECT
         br.id AS borrow_id, br.borrow_date, br.due_date,
         br.status AS borrow_status, br.user_id,
         u.full_name AS reader_name, u.avatar_url AS reader_avatar,
         bc.barcode, bc.id AS book_copy_id,
         bk.id AS book_id, bk.title AS book_title,
         bk.book_cover, bk.author AS book_author
       FROM borrows br
       JOIN users u ON u.id = br.user_id
       JOIN book_copies bc ON bc.id = br.book_copy_id
       JOIN books bk ON bk.id = bc.book_id
       WHERE bc.barcode = $1
         AND br.status IN ('borrowing', 'overdue')
       ORDER BY br.borrow_date DESC
       LIMIT 1`,
      [barcode.trim().toUpperCase()]
    );
    if (!res.rows[0]) throw new Error('No active borrow found for this barcode');
    const row   = res.rows[0];
    const today = new Date();
    const due   = new Date(row.due_date);
    const days  = Math.max(0, Math.floor((today - due) / (1000 * 60 * 60 * 24)));

    return {
      borrow_id:     row.borrow_id,
      borrow_status: row.borrow_status,
      borrow_date:   row.borrow_date,
      due_date:      row.due_date,
      overdue_days:  days,
      barcode:       row.barcode,
      book_copy_id:  row.book_copy_id,
      book_id:       row.book_id,
      book_title:    row.book_title,
      book_cover:    row.book_cover,
      book_author:   row.book_author,
      user_id:       row.user_id,
      reader_name:   row.reader_name,
      reader_avatar: row.reader_avatar,
    };
  },

  // 5. Trả sách hàng loạt + reactivate account nếu hết overdue
  async returnBatch(borrowIds) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const returnedItems = [];

      for (const id of borrowIds) {
        const br = await client.query(
          `SELECT br.id, br.status, br.book_copy_id, br.user_id,
                  bc.book_id, bk.title AS book_title
           FROM borrows br
           JOIN book_copies bc ON bc.id = br.book_copy_id
           JOIN books bk ON bk.id = bc.book_id
           WHERE br.id = $1 FOR UPDATE`,
          [id]
        );
        if (!br.rows[0]) throw new Error(`Borrow #${id} not found`);
        if (br.rows[0].status === 'returned') throw new Error(`Borrow #${id} already returned`);

        const { book_copy_id, book_id, user_id, book_title } = br.rows[0];

        await client.query(
          `UPDATE borrows SET status = 'returned', return_date = CURRENT_DATE WHERE id = $1`,
          [id]
        );
        await client.query(
          `UPDATE book_copies SET status = 'available' WHERE id = $1`,
          [book_copy_id]
        );
        await client.query(
          `UPDATE books
           SET available = available + 1, borrowed_all_time = borrowed_all_time + 1
           WHERE id = $1`,
          [book_id]
        );

        // Notification: invite to review
        const reviewExistsRes = await client.query(
          `SELECT id, updated_at FROM book_reviews
           WHERE user_id = $1 AND book_id = $2 LIMIT 1`,
          [user_id, book_id]
        );
        const borrowCountRes = await client.query(
          `SELECT COUNT(*) AS cnt
           FROM borrows br
           JOIN book_copies bc ON bc.id = br.book_copy_id
           WHERE br.user_id = $1 AND bc.book_id = $2 AND br.status = 'returned'`,
          [user_id, book_id]
        );
        const existingReview = reviewExistsRes.rows[0] || null;
        const borrowCount    = Number(borrowCountRes.rows[0].cnt);

        if (!existingReview) {
          await client.query(
            `INSERT INTO notifications (user_id, type, title, message, reference_id)
             VALUES ($1, 'general', $2, $3, $4)`,
            [user_id, 'Share your thoughts on this book',
             `You have returned "${book_title}". Help other readers by sharing your experience — tap here to leave a review!`,
             book_id]
          );
        } else if (borrowCount >= 2) {
          await client.query(
            `INSERT INTO notifications (user_id, type, title, message, reference_id)
             VALUES ($1, 'general', $2, $3, $4)`,
            [user_id, 'Would you like to update your review?',
             `You returned "${book_title}" again. Your thoughts may have changed — tap here to update your previous review!`,
             book_id]
          );
        }

        // Notify next person waiting for reservation
        const pendingResv = await client.query(
          `SELECT r.id, r.user_id
           FROM book_reservations r
           WHERE r.book_id = $1 AND r.status = 'pending'
           ORDER BY r.reserved_at ASC
           LIMIT 1`,
          [book_id]
        );
        if (pendingResv.rows[0]) {
          const resv      = pendingResv.rows[0];
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 3);
          await client.query(
            `UPDATE book_reservations
             SET status = 'ready', expires_at = $2, notified_at = NOW()
             WHERE id = $1`,
            [resv.id, expiresAt.toISOString()]
          );
          await client.query(
            `INSERT INTO notifications (user_id, type, title, message)
             VALUES ($1, 'general', $2, $3)`,
            [resv.user_id,
             'Your reserved book is now available!',
             `Great news! "${book_title}" is now available at the library. Please come pick it up within 3 days.`]
          );
        }

        returnedItems.push({ borrow_id: id, user_id, book_id, book_title });
      }

      // Reactivate suspended accounts that no longer have overdue books
      const uniqueUserIds = [...new Set(returnedItems.map(i => i.user_id))];
      for (const uid of uniqueUserIds) {
        const overdueCheckRes = await client.query(
          `SELECT COUNT(*) AS cnt FROM borrows
           WHERE user_id = $1 AND status = 'overdue' AND return_date IS NULL`,
          [uid]
        );
        if (Number(overdueCheckRes.rows[0].cnt) === 0) {
          const reactivateRes = await client.query(
            `UPDATE users
             SET status = 'active', updated_at = NOW()
             WHERE id = $1 AND status = 'suspended'
             RETURNING id`,
            [uid]
          );
          if (reactivateRes.rows[0]) {
            await client.query(
              `INSERT INTO notifications (user_id, type, title, message)
               VALUES ($1, 'general', $2, $3)`,
              [uid,
               'Account Reactivated',
               'All overdue books have been returned. Your account is now active and you can borrow books again!']
            );
            console.log(`[returnBatch] Reactivated account for user ${uid}`);
          }
        }
      }

      await client.query('COMMIT');
      return returnedItems;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // 6. Danh sách mượn trả với phân trang
  async findAll({ search = '', status = '', page = 1, limit = 10, sortBy = 'borrow_date', sortOrder = 'DESC' }) {
    const offset = (Number(page) - 1) * Number(limit);
    const params = [];
    const where  = [];

    if (search) {
      params.push(`%${search}%`);
      where.push(`(u.full_name ILIKE $${params.length} OR bk.title ILIKE $${params.length} OR bc.barcode ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      where.push(`br.status = $${params.length}`);
    }

    const whereSQL      = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const allowedSort   = ['borrow_date', 'due_date', 'return_date'];
    const safeSortBy    = allowedSort.includes(sortBy) ? `br.${sortBy}` : 'br.borrow_date';
    const safeSortOrder = sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const countRes = await getPool().query(
      `SELECT COUNT(*) FROM borrows br
       JOIN users u ON u.id = br.user_id
       JOIN book_copies bc ON bc.id = br.book_copy_id
       JOIN books bk ON bk.id = bc.book_id
       ${whereSQL}`, params
    );

    params.push(Number(limit), offset);
    const dataRes = await getPool().query(
      `SELECT
         br.id, br.borrow_date, br.due_date, br.return_date, br.status,
         br.renew_count, br.renew_limit,
         u.id AS reader_id, u.full_name AS reader_name, u.avatar_url AS reader_avatar,
         bc.barcode,
         bk.id AS book_id, bk.title AS book_title, bk.book_cover, bk.author AS book_author
       FROM borrows br
       JOIN users u ON u.id = br.user_id
       JOIN book_copies bc ON bc.id = br.book_copy_id
       JOIN books bk ON bk.id = bc.book_id
       ${whereSQL}
       ORDER BY ${safeSortBy} ${safeSortOrder}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { borrows: dataRes.rows, total: Number(countRes.rows[0].count) };
  },

  // 7. Chi tiết phiếu mượn
  async findById(id) {
    const result = await getPool().query(
      `SELECT
         br.id, br.borrow_date, br.due_date, br.return_date, br.status,
         br.renew_count, br.renew_limit, br.last_renewed_at,
         u.id AS reader_id, u.full_name AS reader_name, u.avatar_url AS reader_avatar,
         u.email AS reader_email, u.phone AS reader_phone,
         bc.barcode, bk.id AS book_id, bk.title AS book_title,
         bk.book_cover, bk.author AS book_author, bk.genre AS book_genre
       FROM borrows br
       JOIN users u ON u.id = br.user_id
       JOIN book_copies bc ON bc.id = br.book_copy_id
       JOIN books bk ON bk.id = bc.book_id
       WHERE br.id = $1`, [id]
    );
    return result.rows[0] || null;
  },

  // 8. Tự động đánh dấu quá hạn
  async markOverdue() {
    const result = await getPool().query(
      `UPDATE borrows SET status = 'overdue'
       WHERE status = 'borrowing' AND due_date < CURRENT_DATE
       RETURNING id`
    );
    return result.rowCount;
  },

  // 9. Gia hạn sách — reader tự gia hạn
  // Điều kiện: borrowing + chưa overdue + chưa hết renew_limit + không có reservation queue
  async renew(borrowId, userId) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');

      // Lock record để tránh race condition
      const br = await client.query(
        `SELECT br.id, br.status, br.due_date, br.renew_count, br.renew_limit,
                br.book_copy_id, bc.book_id, bk.title AS book_title,
                u.status AS user_status
         FROM borrows br
         JOIN book_copies bc ON bc.id = br.book_copy_id
         JOIN books bk ON bk.id = bc.book_id
         JOIN users u ON u.id = br.user_id
         WHERE br.id = $1 AND br.user_id = $2
         FOR UPDATE`,
        [borrowId, userId]
      );

      if (!br.rows[0]) throw new Error('Borrow record not found');
      const b = br.rows[0];

      // Bước 2: kiểm tra trạng thái tài khoản
      if (b.user_status === 'suspended') {
        throw new Error('Your account is suspended due to overdue books. Please return them before renewing.');
      }
      if (b.user_status === 'banned') {
        throw new Error('Your account has been banned. Please contact the library.');
      }

      // Bước 3: kiểm tra trạng thái borrow
      if (b.status !== 'borrowing') {
        throw new Error('Only active borrows can be renewed.');
      }

      // Bước 4: kiểm tra overdue
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueDate = new Date(b.due_date);
      dueDate.setHours(0, 0, 0, 0);
      if (dueDate < today) {
        throw new Error('This book is overdue and cannot be renewed. Please return it to the library first.');
      }

      // Bước 5: kiểm tra reservation queue — đảm bảo công bằng FIFO
      const resvRes = await client.query(
        `SELECT id FROM book_reservations
         WHERE book_id = $1 AND status IN ('pending', 'ready')
         LIMIT 1`,
        [b.book_id]
      );
      if (resvRes.rows[0]) {
        throw new Error('This book cannot be renewed because another reader has reserved it.');
      }

      // Bước 6: kiểm tra renew limit
      const renewCount = Number(b.renew_count);
      const renewLimit = Number(b.renew_limit);
      if (renewCount >= renewLimit) {
        throw new Error(`Maximum renewal limit reached (${renewLimit} renewal${renewLimit > 1 ? 's' : ''} allowed per borrow).`);
      }

      // Bước 7: tính due_date mới (+ RENEW_DAYS từ due_date hiện tại)
      const newDue = new Date(b.due_date);
      newDue.setDate(newDue.getDate() + RENEW_DAYS);
      const newDueStr = newDue.toISOString().split('T')[0];

      const updated = await client.query(
        `UPDATE borrows
         SET due_date        = $1,
             renew_count     = renew_count + 1,
             last_renewed_at = NOW(),
             updated_at      = NOW()
         WHERE id = $2
         RETURNING id, due_date, renew_count, renew_limit, status`,
        [newDueStr, borrowId]
      );

      const renewsRemaining = renewLimit - renewCount - 1;
      const fmtDate = (d) => new Date(d).toLocaleDateString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });

      // Bước 8: gửi notification xác nhận
      await client.query(
        `INSERT INTO notifications (user_id, type, title, message)
         VALUES ($1, 'general', $2, $3)`,
        [
          userId,
          'Book Renewed Successfully ✓',
          `"${b.book_title}" has been renewed until ${fmtDate(newDueStr)}. ` +
          (renewsRemaining > 0
            ? `You have ${renewsRemaining} renewal${renewsRemaining > 1 ? 's' : ''} remaining for this book.`
            : 'This was your last renewal — please return the book on time.'),
        ]
      );

      await client.query('COMMIT');

      return {
        ...updated.rows[0],
        book_title:       b.book_title,
        old_due_date:     b.due_date,
        new_due_date:     newDueStr,
        renews_remaining: renewsRemaining,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

export default BorrowModel;