import axiosClient from './axiosClient';

const borrowService = {

  getAll(params = {}) {
    return axiosClient.get('/borrows', { params });
  },

  getById(id) {
    return axiosClient.get(`/borrows/${id}`);
  },

  // Kiểm tra reader trước khi mượn (MSSV hoặc user id)
  checkReader(studentId) {
    return axiosClient.get(`/borrows/check-reader/${encodeURIComponent(studentId)}`);
  },

  // Kiểm tra barcode sách để mượn
  checkBarcode(barcode) {
    return axiosClient.get(`/borrows/check-barcode/${encodeURIComponent(barcode)}`);
  },

  // Kiểm tra barcode để trả
  checkReturnBarcode(barcode) {
    return axiosClient.get(`/borrows/check-return/${encodeURIComponent(barcode)}`);
  },

  // Mượn nhiều sách
  createBatch(data) {
    return axiosClient.post('/borrows/batch', data);
  },

  // Trả nhiều sách
  returnBatch(borrowIds) {
    return axiosClient.post('/borrows/return-batch', { borrow_ids: borrowIds });
  },

  markOverdue() {
    return axiosClient.patch('/borrows/mark-overdue');
  },

  // Gia hạn sách — reader tự thực hiện
  // POST /api/reader-profile/borrows/:id/renew
  renew(borrowId) {
    return axiosClient.post(`/reader-profile/borrows/${borrowId}/renew`);
  },
};

export default borrowService;