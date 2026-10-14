# Uy tín đội thợ

Điểm uy tín là công thức cố định. Backend tính trong `backend/src/services/reputationScore.js` và đọc PostgreSQL trong `backend/src/services/reputationService.js`. Frontend chỉ hiển thị JSON trả về. Không có API để chủ đội thợ sửa điểm.

## Công thức

```
S = 2 × ((n × averageStars + 10 × 3.5) / (n + 10))
C = tỷ lệ hoàn thành × 10
T = tỷ lệ đúng hẹn × 10
Q = tỷ lệ xử lý khiếu nại × 10
Reputation = S × 0.50 + C × 0.25 + T × 0.15 + Q × 0.10
```

Mỗi thành phần và điểm tổng được giới hạn trong 0–10 rồi làm tròn 2 chữ số thập phân. Thành phần được làm tròn trước khi nhân trọng số.

## Khi nào công khai điểm

Công khai khi có ít nhất 5 đơn hợp lệ và 3 đánh giá hợp lệ. Nếu chưa đủ, `score` và `grade` là `null`, trạng thái là `INSUFFICIENT`. Các thống kê đếm được vẫn trả về.

## Đơn hợp lệ

Chỉ dùng bảng `service_orders`. Bỏ đơn test và đơn gian lận:

- Email khách kết thúc bằng `@buildmate.test` hoặc `@example.com`, hoặc `order_code` bắt đầu bằng `TEST-`.
- `cancel_reason` đúng bằng `FRAUD`, hoặc tiêu đề bắt đầu bằng `[FRAUD]`. Cơ sở dữ liệu chưa có cột cờ gian lận riêng.

## Mẫu số

**Hoàn thành (C).** Tử số: đơn `COMPLETED` hoặc `CUSTOMER_ACCEPTED`. Mẫu số: tử số cộng đơn `CANCELLED` do chính đội thợ hủy (`cancelled_by` trùng `contractor_user_id`). Đơn khách hủy không vào mẫu số. Đơn admin hủy hoặc không rõ người hủy cũng không vào mẫu số. Đơn đang làm không vào mẫu số.

**Đúng hẹn (T).** Chỉ đơn đã hoàn thành, có `quotations.estimated_days` ≥ 1 và có `completed_at`. Hạn = `created_at` + số ngày trong báo giá. Đúng hẹn khi `completed_at` không muộn hơn hạn. Đơn thiếu hạn hoặc thiếu ngày hoàn thành không vào mẫu số.

**Khiếu nại (Q).** Khiếu nại trong `complaints` nhắm vào đội thợ và gắn đơn hợp lệ. Chỉ `RESOLVED` và `REJECTED` vào mẫu số. `REJECTED` là tử số (admin bác khiếu nại). `RESOLVED` làm giảm tỷ lệ. `OPEN` và `PROCESSING` chưa được tính.

## Thiếu dữ liệu của một thành phần

Nếu mẫu số của C, T hoặc Q bằng 0, thành phần đó lấy điểm trung lập **5.0**. Không gán 10 và không gán 0. S luôn dùng công thức sao ở trên; khi chưa có đánh giá, n = 0 nên S = 7.00, nhưng điểm tổng vẫn không công khai nếu chưa đủ 5 đơn và 3 đánh giá.

## Xếp loại

Áp dụng trên điểm đã làm tròn, chỉ khi đã công khai:

- 9.00–10: Xuất sắc
- 8.00–8.99: Rất tốt
- 7.00–7.99: Tốt
- 5.00–6.99: Trung bình
- dưới 5.00: Cần cải thiện

## Thời điểm cập nhật

`updatedAt` là mốc mới nhất trong các dòng đơn, đánh giá và khiếu nại đã dùng để tính. Điểm không được lưu thành một cột cho chủ đội thợ sửa.
