import getPool from '../config/db.js';

const REVIEW_STATS_JOIN = `
  LEFT JOIN (
    SELECT
      r.book_id,
      ROUND(AVG(r.rating)::NUMERIC, 2) AS avg_rating,
      COUNT(*)::INT AS review_count
    FROM book_reviews r
    WHERE r.is_approved = TRUE
      AND EXISTS (
        SELECT 1
        FROM borrows br
        JOIN book_copies bc ON bc.id = br.book_copy_id
        WHERE br.user_id = r.user_id
          AND bc.book_id = r.book_id
          AND br.status = 'returned'
      )
    GROUP BY r.book_id
  ) review_stats ON review_stats.book_id = books.id
`;

const SORT_COLUMNS = {
  title: 'books.title',
  author: 'books.author',
  genre: 'books.genre',
  quantity: 'books.quantity',
  available: 'books.available',
  borrowed_all_time: 'books.borrowed_all_time',
  created_at: 'books.created_at',
  publish_year: 'books.publish_year',
  // Sửa tại đây: Chỉ rõ nguồn từ review_stats và dùng COALESCE để tránh lỗi NULL bị đẩy lên đầu khi sort DESC
  avg_rating: 'COALESCE(review_stats.avg_rating, 0)',
  review_count: 'COALESCE(review_stats.review_count, 0)',
};

const BookModel = {
  async findAll({ search = '', genre = '', page = 1, limit = 10, sortBy = 'created_at', sortOrder = 'DESC' }) {
    const offset = (Number(page) - 1) * Number(limit);
    const params = [];
    const where = [];

    if (search) {
      params.push(`%${search}%`);
      where.push(`(books.title ILIKE $${params.length} OR books.author ILIKE $${params.length})`);
    }

    if (genre) {
      params.push(genre);
      where.push(`books.genre = $${params.length}`);
    }

    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const safeSortBy = SORT_COLUMNS[sortBy] || 'books.created_at';
    const safeSortOrder = sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const countRes = await getPool().query(
      `SELECT COUNT(*) FROM books ${whereSQL}`,
      params
    );

    params.push(Number(limit), offset);

    const dataRes = await getPool().query(
      `SELECT
         books.*,
         COALESCE(review_stats.avg_rating, 0)   AS avg_rating,
         COALESCE(review_stats.review_count, 0) AS review_count
       FROM books
       ${REVIEW_STATS_JOIN}
       ${whereSQL}
       ORDER BY ${safeSortBy} ${safeSortOrder}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return {
      books: dataRes.rows,
      total: Number(countRes.rows[0].count),
    };
  },

  async getGenres() {
    return await getPool().query(`
      SELECT DISTINCT genre
      FROM books
      WHERE genre IS NOT NULL AND genre != ''
      ORDER BY genre ASC
    `);
  },

  async findById(id) {
    const result = await getPool().query(
      `SELECT
         books.*,
         COALESCE(review_stats.avg_rating, 0)   AS avg_rating,
         COALESCE(review_stats.review_count, 0) AS review_count
       FROM books
       ${REVIEW_STATS_JOIN}
       WHERE books.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async create(data) {
    const {
      id, isbn, title, book_cover, author, author_avatar,
      genre, publisher, publish_year, language, pages,
      location, quantity, available, description,
    } = data;

    const result = await getPool().query(`
      INSERT INTO books (
        id, isbn, title, book_cover, author, author_avatar, genre,
        publisher, publish_year, language, pages, location,
        quantity, available, description
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [
      id, isbn, title, book_cover, author, author_avatar, genre,
      publisher, publish_year, language, pages, location,
      quantity || 0, available ?? quantity ?? 0, description,
    ]);
    return result.rows[0];
  },

  async update(id, data) {
    const {
      title, book_cover, author, author_avatar, genre,
      publisher, publish_year, language, pages,
      location, quantity, description,
    } = data;

    const result = await getPool().query(`
      UPDATE books SET
        title=$2, book_cover=$3, author=$4, author_avatar=$5,
        genre=$6, publisher=$7, publish_year=$8, language=$9,
        pages=$10, location=$11, quantity=$12,
        description=$13, updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [
      id, title, book_cover, author, author_avatar, genre,
      publisher, publish_year, language, pages,
      location, quantity, description,
    ]);
    return result.rows[0] || null;
  },

  async delete(id) {
    await getPool().query('DELETE FROM books WHERE id = $1', [id]);
  },

  async getCopies(bookId) {
    const result = await getPool().query(
      'SELECT * FROM book_copies WHERE book_id = $1 ORDER BY id ASC',
      [bookId]
    );
    return result.rows;
  },

  async addCopiesBulk({ book_id, quantity, condition, notes }) {
    const qty = Number(quantity);
    if (qty < 1) throw new Error('Quantity must be at least 1');

    const existRes = await getPool().query(
      `SELECT barcode
       FROM book_copies
       WHERE book_id = $1
       ORDER BY barcode DESC
       LIMIT 1`,
      [book_id]
    );

    let lastIndex = 0;

    if (existRes.rows.length > 0) {
      const lastBarcode = existRes.rows[0].barcode;
      const parts = lastBarcode.split('-');
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) {
        lastIndex = lastNum;
      }
    }

    const values = [];
    const placeholders = [];

    for (let i = 0; i < qty; i++) {
      const nextIndex = lastIndex + i + 1;
      const barcode = `${book_id}-${String(nextIndex).padStart(3, '0')}`;
      const base = i * 4;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, 'available', $${base + 4})`
      );
      values.push(book_id, barcode, condition || 'good', notes || null);
    }

    const result = await getPool().query(
      `INSERT INTO book_copies (book_id, barcode, condition, status, notes)
       VALUES ${placeholders.join(', ')}
       RETURNING *`,
      values
    );

    await getPool().query(
      `UPDATE books
       SET quantity  = quantity  + $1,
           available = available + $1
       WHERE id = $2`,
      [qty, book_id]
    );

    return result.rows;
  },

  async updateCopy(copyId, { status, condition, notes }) {
    const result = await getPool().query(`
      UPDATE book_copies
      SET status=$2, condition=$3, notes=$4, updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [copyId, status, condition, notes || null]);
    return result.rows[0];
  },

  async deleteCopy(copyId) {
    const res = await getPool().query(
      'SELECT book_id FROM book_copies WHERE id = $1', [copyId]
    );
    if (!res.rows[0]) return;

    const { book_id } = res.rows[0];
    await getPool().query('DELETE FROM book_copies WHERE id = $1', [copyId]);
    await getPool().query(
      `UPDATE books
       SET quantity  = quantity  - 1,
           available = available - 1
       WHERE id = $1`,
      [book_id]
    );
  },
};

export default BookModel;