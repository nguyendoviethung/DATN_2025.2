import cron from 'node-cron';
import getPool from '../config/db.js';
import ReservationModel from '../models/reservationModel.js';
import NotificationModel from '../models/notificationModel.js';

export const startBorrowCron = () => {

 const runDailyJobs = async () => {
    console.log('[CRON] Running daily jobs...');
    const pool = getPool();
 
    try {
      // 1. Đánh dấu borrows quá hạn là overdue
      const overdueRes = await pool.query(
        `UPDATE borrows
         SET status = 'overdue'
         WHERE status = 'borrowing'
           AND due_date < CURRENT_DATE
           AND return_date IS NULL
         RETURNING id, user_id, book_copy_id, due_date`
      );

      if (overdueRes.rows.length > 0) {
        const notifs = await Promise.all(
          overdueRes.rows.map(async (b) => {
            const bookRes = await pool.query(
              `SELECT bk.title
               FROM book_copies bc
               JOIN books bk ON bk.id = bc.book_id
               WHERE bc.id = $1`,
              [b.book_copy_id]
            );
            return {
              user_id: b.user_id,
              type:    'overdue',
              title:   'Book Overdue!',
              message: `"${bookRes.rows[0]?.title || 'A book'}" is overdue since ${new Date(b.due_date).toLocaleDateString('vi-VN')}. Please return it as soon as possible.`,
            };
          })
        );
        await NotificationModel.createBulk(notifs);
        console.log(`[CRON] ${overdueRes.rows.length} borrow(s) marked overdue`);
      }

      // Đánh dấu users có borrow quá hạn > 7 ngày là suspended
      const toSuspendRes = await pool.query(
        `SELECT DISTINCT u.id, u.full_name
         FROM users u
         JOIN borrows b ON b.user_id = u.id
         WHERE b.status = 'overdue'
           AND b.return_date IS NULL
           AND b.due_date < CURRENT_DATE - INTERVAL '7 days'
           AND u.status = 'active'
           AND u.role = 'reader'`
      );

      if (toSuspendRes.rows.length > 0) {
        const userIds = toSuspendRes.rows.map(r => r.id);

        await pool.query(
          `UPDATE users
           SET status = 'suspended', updated_at = NOW()
           WHERE id = ANY($1::int[])`,
          [userIds]
        );

        const suspendNotifs = toSuspendRes.rows.map(u => ({
          user_id: u.id,
          type:    'general',
          title:   'Account Suspended',
          message: 'Your account has been suspended because you have a book overdue for more than 7 days. Please return the book to reactivate your account.',
        }));
        await NotificationModel.createBulk(suspendNotifs);

        console.log(`[CRON] Suspended ${toSuspendRes.rows.length} account(s) for overdue > 7 days`);
      }

      // Nhắc nhở những borrows sẽ đến hạn trong 2 ngày
      const dueSoonRes = await pool.query(
        `SELECT b.id, b.user_id, b.book_copy_id, b.due_date
         FROM borrows b
         WHERE b.status = 'borrowing'
           AND b.due_date = CURRENT_DATE + INTERVAL '2 days'
           AND b.return_date IS NULL`
      );

      if (dueSoonRes.rows.length > 0) {
        const notifs = await Promise.all(
          dueSoonRes.rows.map(async (b) => {
            const bookRes = await pool.query(
              `SELECT bk.title
               FROM book_copies bc
               JOIN books bk ON bk.id = bc.book_id
               WHERE bc.id = $1`,
              [b.book_copy_id]
            );
            return {
              user_id: b.user_id,
              type:    'due_reminder',
              title:   'Due Reminder',
              message: `"${bookRes.rows[0]?.title}" is due on ${new Date(b.due_date).toLocaleDateString('vi-VN')}. Please return it on time.`,
            };
          })
        );
        await NotificationModel.createBulk(notifs);
        console.log(`[CRON] Sent ${notifs.length} due reminder(s)`);
      }

      // 2. Xử lý reservations quá hạn (ready > 3 ngày)
      const expiredRes = await ReservationModel.expireOverdueReady();

      if (expiredRes.length > 0) {
        // Notify expired users
        await NotificationModel.createBulk(
          expiredRes.map(r => ({
            user_id: r.user_id,
            type:    'general',
            title:   'Reservation Expired',
            message: 'Your reservation expired because you did not pick up the book in time.',
          }))
        );

        console.log(`[CRON] Expired ${expiredRes.length} reservation(s)`);

        // Promote next person in queue for each book
        const uniqueBooks = [...new Set(expiredRes.map(r => r.book_id))];
        for (const bookId of uniqueBooks) {
          try {
            const next = await ReservationModel.promoteNextPending(bookId);
            if (next) {
              await NotificationModel.create({
                user_id: next.user_id,
                type:    'general',
                title:   'Book Available',
                message: `"${next.book_title}" is now available for pickup. Please come within 3 days.`,
              });
              console.log(`[CRON] Promoted user ${next.user_id} for book ${bookId}`);
            }
          } catch (err) {
            console.error('[CRON] Promote error:', err.message);
          }
        }
      }

      console.log('[CRON] Done');
    } catch (err) {
      console.error('[CRON ERROR]:', err);
    }
  };
   runDailyJobs();

  // chạy mỗi ngày lúc 00:00
  cron.schedule('0 0 * * *', runDailyJobs);
};