import readerProfileModel from '../models/readerProfileModel.js';
import borrowModel        from '../models/borrowModel.js';

const readerProfileController = {

  async getMe(req, res) {
    try {
      const userId = req.user.id;

      const [user, stats, totalFine] = await Promise.all([
        readerProfileModel.getUserById(userId),
        readerProfileModel.getStats(userId),
        readerProfileModel.getTotalFine(userId),
      ]);

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      return res.json({
        user: {
          ...user,
          currently_borrowing: Number(stats.currently_borrowing),
          overdue_count:       Number(stats.overdue_count),
          total_returned:      Number(stats.total_returned),
          total_borrows:       Number(stats.total_borrows),
          total_fine:          Number(totalFine),
        },
      });

    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Internal server error' });
    }
  },

  async updateProfile(req, res) {
    try {
      const userId = req.user.id;
      const { full_name, phone, address } = req.body;

      if (!full_name?.trim()) {
        return res.status(400).json({ message: 'full_name is required' });
      }

      const user = await readerProfileModel.updateProfile(
        userId,
        full_name.trim(),
        phone?.trim() || null,
        address?.trim() || null
      );

      res.json({ message: 'Profile updated', user });

    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Internal server error' });
    }
  },

  async updateAvatar(req, res) {
    try {
      const userId = req.user.id;
      const { avatar_url } = req.body;

      if (!avatar_url || typeof avatar_url !== 'string') {
        return res.status(400).json({ message: 'Invalid avatar' });
      }

      const user = await readerProfileModel.updateAvatar(userId, avatar_url);

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json({
        message:    'Avatar updated successfully',
        avatar_url: user.avatar_url
      });

    } catch (err) {
      if (err.code === '22001') {
        return res.status(400).json({ message: 'Avatar too large' });
      }
      res.status(500).json({ message: err.message });
    }
  },

  async getBorrowHistory(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 8, status = '' } = req.query;

      const offset = (page - 1) * limit;

      const [total, history] = await Promise.all([
        readerProfileModel.countBorrowHistory(userId, status),
        readerProfileModel.getBorrowHistory(userId, status, limit, offset),
      ]);

      res.json({ history, total });

    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Internal server error' });
    }
  },

  async getDashboardData(req, res) {
    try {
      const userId = req.user.id;
      const data   = await readerProfileModel.getDashboard(userId);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: 'Internal server error' });
    }
  },

  // POST /api/reader-profile/borrows/:id/renew
  // Gia hạn sách — reader tự thực hiện
  async renewBorrow(req, res) {
    try {
      const borrowId = Number(req.params.id);
      const userId   = req.user.id;

      if (!borrowId || isNaN(borrowId)) {
        return res.status(400).json({ message: 'Invalid borrow ID' });
      }

      const result = await borrowModel.renew(borrowId, userId); // ← sửa: borrowModel thay vì BorrowModel

      return res.json({
        message:          'Book renewed successfully',
        borrow:           result,
        new_due_date:     result.new_due_date,
        renews_remaining: result.renews_remaining,
      });

    } catch (err) {
      const msg = err.message || 'Failed to renew';
      const status =
        msg.includes('not found')                              ? 404 :
        msg.includes('suspended') || msg.includes('banned')   ? 403 : 400;
      return res.status(status).json({ message: msg });
    }
  },
};

export default readerProfileController;