import getPool from '../config/db.js';

const FINE_PER_DAY = 5000;

const readerProfileModel = {

  async getUserById(userId) {
    const res = await getPool().query(
      `SELECT id, full_name, email, phone, address, avatar_url, student_id, status, created_at
       FROM users WHERE id = $1`,
      [userId]
    );
    return res.rows[0];
  },

  async getStats(userId) {
    const res = await getPool().query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('borrowing','overdue')) AS currently_borrowing,
         COUNT(*) FILTER (WHERE status = 'overdue')               AS overdue_count,
         COUNT(*) FILTER (WHERE status = 'returned')              AS total_returned,
         COUNT(*)                                                  AS total_borrows
       FROM borrows WHERE user_id = $1`,
      [userId]
    );
    return res.rows[0];
  },

  async getTotalFine(userId) {
    const res = await getPool().query(
      `SELECT COALESCE(SUM((CURRENT_DATE - due_date) * $2), 0) AS total_fine
       FROM borrows WHERE user_id = $1 AND status = 'overdue'`,
      [userId, FINE_PER_DAY]
    );
    return res.rows[0].total_fine;
  },

  async updateProfile(userId, full_name, phone, address) {
    const res = await getPool().query(
      `UPDATE users
       SET full_name = $1, phone = $2, address = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id, full_name, email, phone, address, avatar_url, student_id`,
      [full_name, phone, address, userId]
    );
    return res.rows[0];
  },

  async updateAvatar(userId, avatar_url) {
    const res = await getPool().query(
      `UPDATE users 
       SET avatar_url = $1, updated_at = NOW()
       WHERE id = $2 
       RETURNING id, avatar_url`,
      [avatar_url, userId]
    );
    return res.rows[0];
  },

  async countBorrowHistory(userId, status) {
    const params = [userId];
    let where = '';
    if (status) {
      params.push(status);
      where = `AND br.status = $2`;
    }
    const res = await getPool().query(
      `SELECT COUNT(*) FROM borrows br WHERE br.user_id = $1 ${where}`,
      params
    );
    return Number(res.rows[0].count);
  },

  async getBorrowHistory(userId, status, limit, offset) {
    const params = [userId];
    let where = '';
    if (status) {
      params.push(status);
      where = `AND br.status = $2`;
    }
    params.push(limit, offset);

    const res = await getPool().query(
      `SELECT
         br.id, br.borrow_date, br.due_date, br.return_date, br.status,
         br.renew_count, br.renew_limit, br.last_renewed_at,
         u.status      AS user_status,
         bk.id        AS book_id,
         bk.title     AS book_title,
         bk.book_cover,
         bk.author    AS book_author,
         bc.barcode,
         bc.book_id   AS copy_book_id,
         CASE WHEN br.status = 'overdue'
           THEN GREATEST(0, (CURRENT_DATE - br.due_date) * ${FINE_PER_DAY})
           ELSE 0 END AS fine_amount,
         -- Check if any reservation exists for this book (to disable renew)
         EXISTS (
           SELECT 1 FROM book_reservations r
           WHERE r.book_id = bc.book_id
             AND r.status IN ('pending', 'ready')
         ) AS has_reservation_queue
       FROM borrows br
       JOIN users u       ON u.id  = br.user_id
       JOIN book_copies bc ON bc.id = br.book_copy_id
       JOIN books bk       ON bk.id = bc.book_id
       WHERE br.user_id = $1 ${where}
       ORDER BY br.borrow_date DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.rows;
  },

  async getDashboard(userId) {
    const pool = getPool();

    const [recentRes, topBooksRes] = await Promise.all([
      pool.query(
        `SELECT
           br.id, br.borrow_date, br.due_date, br.return_date, br.status,
           br.renew_count, br.renew_limit, br.last_renewed_at,
           u.status      AS user_status,
           bk.id        AS book_id,
           bk.title     AS book_title,
           bk.book_cover,
           bk.author    AS book_author,
           bc.book_id   AS copy_book_id,
           CASE WHEN br.status = 'overdue'
             THEN GREATEST(0,(CURRENT_DATE - br.due_date) * ${FINE_PER_DAY})
             ELSE 0 END AS fine_amount,
           -- Pre-compute if eligible to renew
           EXISTS (
             SELECT 1 FROM book_reservations r
             WHERE r.book_id = bc.book_id
               AND r.status IN ('pending', 'ready')
           ) AS has_reservation_queue
         FROM borrows br
         JOIN users u       ON u.id  = br.user_id
         JOIN book_copies bc ON bc.id = br.book_copy_id
         JOIN books bk       ON bk.id = bc.book_id
         WHERE br.user_id = $1 AND br.status IN ('borrowing','overdue')
         ORDER BY br.due_date ASC LIMIT 5`,
        [userId]
      ),
      pool.query(
        `SELECT id, title, book_cover, author, genre, borrowed_all_time
         FROM books WHERE borrowed_all_time > 0
         ORDER BY borrowed_all_time DESC LIMIT 6`
      ),
    ]);

    return {
      activeBorrows: recentRes.rows,
      topBooks: topBooksRes.rows,
    };
  },
};

export default readerProfileModel;