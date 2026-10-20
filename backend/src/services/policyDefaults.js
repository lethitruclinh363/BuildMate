const { POLICY_TYPES, POLICY_STATUS } = require('../models/Policy');

function html(blocks) {
  return blocks.map((block) => `<p>${block}</p>`).join('');
}

const COPY = {
  vi: {
    [POLICY_TYPES.TERMS_OF_SERVICE]: {
      title: 'Điều khoản dịch vụ',
      blocks: [
        'BuildMate là nền tảng xây dựng địa phương, kết nối chủ nhà, chủ đội thợ và chủ cửa hàng vật liệu. BuildMate điều phối yêu cầu, báo giá, đơn thi công và đơn vật liệu. BuildMate không phải nhà thầu thi công và không phải cửa hàng bán vật liệu.',
        'Khi tạo tài khoản, bạn xác nhận thông tin họ tên, email và số điện thoại là đúng. Email phải được xác thực bằng mã OTP trước khi đăng nhập. Mỗi người chỉ dùng tài khoản của mình.',
        'Chủ nhà gửi yêu cầu sửa chữa kèm địa điểm. Chủ đội thợ gửi báo giá. Đơn chỉ hình thành khi chủ nhà chấp nhận báo giá. Tiến độ thi công được cập nhật trên đơn để các bên cùng theo dõi.',
        'Đơn sửa chữa Contractor thu tiền cọc 15% trên BuildMate. Phí nền tảng 5% được chốt theo snapshot khi khách chấp nhận báo giá. Cửa hàng vật liệu dùng nền tảng miễn phí, không cọc và không hoa hồng. Thanh toán và hoàn tiền tuân theo Chính sách thanh toán và Chính sách hoàn tiền đang hiệu lực.',
        'BuildMate có thể tạm khóa tài khoản nếu phát hiện gian lận, quấy rối, thông tin giả hoặc giao dịch cố tình đưa ra ngoài nền tảng để trốn phí dịch vụ Contractor.',
      ],
    },
    [POLICY_TYPES.PRIVACY_POLICY]: {
      title: 'Chính sách bảo mật',
      blocks: [
        'BuildMate thu thập họ tên, email, số điện thoại, vai trò tài khoản và mật khẩu đã băm. Khi bạn dùng bản đồ hoặc gửi yêu cầu, nền tảng có thể lưu vị trí để ghép thợ và cửa hàng gần công trình.',
        'Số điện thoại và email dùng để xác thực OTP, đăng nhập và liên hệ trong phạm vi một đơn hàng. Mật khẩu không được lưu dạng đọc được.',
        'Thông tin liên hệ có thể được chia sẻ với đối tác của đúng đơn đó: chủ nhà, chủ đội thợ hoặc chủ cửa hàng vật liệu đang thực hiện công việc. BuildMate không bán dữ liệu cá nhân.',
        'Nhật ký đăng nhập, chấp nhận điều khoản và thao tác quản trị được lưu để xử lý tranh chấp. Bạn có thể yêu cầu cập nhật hồ sơ trong phần tài khoản.',
      ],
    },
    [POLICY_TYPES.CUSTOMER_POLICY]: {
      title: 'Chính sách khách hàng',
      blocks: [
        'Khách hàng là chủ nhà dùng BuildMate để tìm đội thợ gần nhà, gửi yêu cầu sửa chữa, nhận báo giá và theo dõi tiến độ.',
        'Mô tả hư hỏng và địa chỉ công trình cần đủ rõ để đội thợ báo giá. Báo giá chỉ có hiệu lực khi bạn chấp nhận trên nền tảng.',
        'Bạn thanh toán theo thỏa thuận trên đơn, đánh giá sau khi nghiệm thu và có thể gửi khiếu nại nếu tiến độ hoặc chất lượng không đúng thỏa thuận.',
        'Không yêu cầu thợ hoặc cửa hàng giao dịch ngoài BuildMate đối với phần việc đã tạo trên nền tảng.',
      ],
    },
    [POLICY_TYPES.CONTRACTOR_POLICY]: {
      title: 'Chính sách chủ đội thợ',
      blocks: [
        'Chủ đội thợ nhận việc, gửi báo giá và cập nhật tiến độ thi công cho chủ nhà trong khu vực mình phục vụ.',
        'Hồ sơ năng lực cần được duyệt trước khi đội xuất hiện công khai. Báo giá phải nêu hạng mục, đơn giá và phạm vi. Không thêm chi phí ngoài báo giá đã được chấp nhận nếu chưa có thỏa thuận mới trên đơn.',
        'Khi khách chấp nhận báo giá, BuildMate giữ 15% tiền cọc (mô phỏng trong đồ án). Contractor nhận 10% phần giữ hộ sau nghiệm thu hợp lệ; BuildMate ghi nhận 5% phí nền tảng. 85% còn lại khách thanh toán trực tiếp cho đội thợ. Không bắt đầu thi công khi chưa đóng cọc. Cập nhật tiến độ phải phản ánh hiện trường.',
        'Đội thợ chịu trách nhiệm an toàn thi công và chất lượng hạng mục mình nhận. BuildMate không thay mặt đội thợ ký hợp đồng dân sự với chủ nhà.',
      ],
    },
    [POLICY_TYPES.MATERIAL_STORE_POLICY]: {
      title: 'Chính sách chủ cửa hàng vật liệu',
      blocks: [
        'Chủ cửa hàng vật liệu đăng vật liệu, giá, tồn kho và khu vực giao hàng để chủ nhà và đội thợ đặt hàng cho công trình. Cửa hàng sử dụng BuildMate miễn phí: không phí đăng ký, không phí tháng, không hoa hồng, không đặt cọc.',
        'Giá và đơn vị tính hiển thị trên gian hàng phải khớp với đơn được xác nhận. Khách thanh toán trực tiếp cho cửa hàng (COD hoặc chuyển khoản ngoài nền tảng). BuildMate không giữ tiền đơn vật liệu.',
        'Hồ sơ cửa hàng cần được duyệt trước khi gian hàng công khai. Hình ảnh và mô tả không được gây hiểu nhầm về xuất xứ hoặc chất lượng.',
        'Khiếu nại về thiếu hàng, sai quy cách hoặc giao trễ được xử lý giữa khách và cửa hàng, có hỗ trợ khiếu nại trên nền tảng. Đơn vật liệu cũ đã đặt cọc được giữ nguyên lịch sử, không chuyển thành COD.',
      ],
    },
    [POLICY_TYPES.PAYMENT_POLICY]: {
      title: 'Chính sách thanh toán',
      blocks: [
        'Đơn sửa chữa: khách thanh toán cọc 15% tổng báo giá đã chấp nhận. BuildMate giữ khoản này (escrow, mô phỏng trong đồ án). Phí nền tảng = 5% tổng báo giá, không phải 5% của tiền cọc. 85% còn lại khách thanh toán trực tiếp cho Contractor và không phải doanh thu BuildMate.',
        'Doanh thu BuildMate chỉ ghi nhận khi đơn sửa chữa đủ điều kiện quyết toán: đã đóng cọc, đã nghiệm thu, không tranh chấp đang chặn, và phần 85% đã được đối soát. Khi đó hệ thống giải ngân 10% cho Contractor và ghi 5% phí nền tảng.',
        'Đơn vật liệu mới không đặt cọc, không hoa hồng, không giữ tiền trên nền tảng. Tổng đơn = tiền hàng + phí vận chuyển, thuộc giao dịch trực tiếp giữa khách và cửa hàng.',
        'Cổng thanh toán hiện tại là mô phỏng cho đồ án. Trạng thái PAID/REFUNDED/RELEASED trên sổ cái demo không có nghĩa tiền thật đã chuyển. Giao dịch bị nghi ngờ gian lận có thể bị tạm giữ.',
      ],
    },
    [POLICY_TYPES.REFUND_POLICY]: {
      title: 'Chính sách hoàn tiền',
      blocks: [
        'Hủy đơn sửa chữa chưa đóng cọc: không phát sinh phí. Khách tự ý hủy sau khi đã cọc: hệ thống giữ 15% theo điều khoản đã chấp thuận, không giải ngân ngay, Admin xử lý phân bổ. Contractor tự ý hủy hoặc không thực hiện: hoàn toàn bộ 15% cho khách, BuildMate không ghi 5% hoa hồng.',
        'Hai bên thỏa thuận hủy: ghi số tiền đề xuất hoàn, không vượt số dư cọc đang giữ, Admin xác nhận. Khi có tranh chấp, escrow chuyển FROZEN, không giải ngân và không hoàn tự động.',
        'Đơn vật liệu không có cọc nên không phạt mất cọc. Đơn chưa vận chuyển có thể hủy. Đơn đã giao xử lý từ chối nhận hàng, hàng lỗi hoặc hoàn tiền trực tiếp giữa khách và cửa hàng.',
        'Hoàn tiền cọc Contractor trên đồ án là giao dịch mô phỏng, ghi trên đơn gốc. Không hoàn hai lần cùng một khoản escrow.',
      ],
    },
  },
  en: {
    [POLICY_TYPES.TERMS_OF_SERVICE]: {
      title: 'Terms of Service',
      blocks: [
        'BuildMate is a local construction platform that connects homeowners, contractor crews, and material stores. BuildMate coordinates requests, quotations, construction orders, and material orders. BuildMate is not the contractor on site and is not the store selling materials.',
        'When you create an account you confirm that your name, email, and phone number are accurate. The email must be verified with a one-time code before sign-in. Each person uses only their own account.',
        'A homeowner sends a repair request with a location. A contractor sends a quotation. An order exists only after the homeowner accepts that quotation. Site progress is updated on the order so every party can follow it.',
        'Contractor repair orders collect a 15% deposit on BuildMate. The 5% platform fee is snapshotted when the customer accepts the quote. Material stores use the platform for free: no deposit and no commission. Payments and refunds follow the Payment Policy and Refund Policy then in effect.',
        'BuildMate may suspend an account for fraud, harassment, false information, or deliberately moving a contractor job off BuildMate to avoid the service fee.',
      ],
    },
    [POLICY_TYPES.PRIVACY_POLICY]: {
      title: 'Privacy Policy',
      blocks: [
        'BuildMate collects your name, email, phone number, account role, and a hashed password. When you use the map or send a request, the platform may store a location so it can match nearby crews and stores to the site.',
        'Phone number and email are used for one-time codes, sign-in, and contact limited to an order. Passwords are not stored in a readable form.',
        'Contact details may be shared with the other party of that same order: the homeowner, the contractor, or the material store doing the work. BuildMate does not sell personal data.',
        'Sign-in logs, policy acceptance, and admin actions are kept so disputes can be reviewed. You can update your profile from your account.',
      ],
    },
    [POLICY_TYPES.CUSTOMER_POLICY]: {
      title: 'Customer Policy',
      blocks: [
        'A customer is a homeowner who uses BuildMate to find a nearby crew, send a repair request, receive quotations, and follow progress.',
        'Describe the damage and the site address clearly enough for a crew to quote. A quotation takes effect only when you accept it on the platform.',
        'You pay according to the agreement on the order, leave a review after acceptance, and may file a complaint if progress or quality does not match that agreement.',
        'Do not ask a crew or a store to settle, off BuildMate, work that was opened on the platform.',
      ],
    },
    [POLICY_TYPES.CONTRACTOR_POLICY]: {
      title: 'Contractor Policy',
      blocks: [
        'A contractor takes jobs, sends quotations, and updates construction progress for homeowners in the area they serve.',
        'A crew profile must be approved before it is listed publicly. A quotation must state the items, unit prices, and scope. Do not add charges beyond an accepted quotation unless a new agreement is recorded on the order.',
        'When a customer accepts a quote, BuildMate holds 15% as a deposit (mock in this thesis). The contractor receives the 10% hold after valid acceptance; BuildMate records a 5% platform fee. The remaining 85% is paid directly to the contractor. Work cannot start before the deposit is paid. Progress updates must match the site.',
        'The crew is responsible for site safety and for the quality of the work it accepts. BuildMate does not sign the construction contract with the homeowner in the crew’s place.',
      ],
    },
    [POLICY_TYPES.MATERIAL_STORE_POLICY]: {
      title: 'Material Store Policy',
      blocks: [
        'A material store owner lists materials, prices, stock, and a delivery area so homeowners and crews can order for a site. Stores use BuildMate for free: no signup fee, no monthly fee, no commission, and no deposit.',
        'The price and unit shown on the listing must match the confirmed order. The customer pays the store directly (COD or an off-platform transfer). BuildMate does not hold money for material orders.',
        'The store profile must be approved before the shop is public. Photos and descriptions must not misstate origin or quality.',
        'Complaints about shortages, wrong specification, or late delivery are handled between the customer and the store, with platform complaint tools. Legacy material orders that already paid a deposit keep their history and are not converted to COD.',
      ],
    },
    [POLICY_TYPES.PAYMENT_POLICY]: {
      title: 'Payment Policy',
      blocks: [
        'Repair orders: the customer pays a 15% deposit on the accepted quote. BuildMate holds that amount (escrow, mocked in this thesis). Platform fee = 5% of the quote total, not 5% of the deposit. The remaining 85% is paid directly to the contractor and is not BuildMate revenue.',
        'BuildMate revenue is recorded only when a repair order is eligible to settle: deposit paid, customer accepted, no blocking complaint, and the 85% remainder reconciled. Then the system releases 10% to the contractor and posts the 5% platform fee.',
        'New material orders have no deposit, no commission, and no platform hold. Order total = goods + shipping, as a direct sale between customer and store.',
        'The current gateway is a mock for the thesis. PAID/REFUNDED/RELEASED on the demo ledger does not mean real money moved. A transaction suspected of fraud may be held.',
      ],
    },
    [POLICY_TYPES.REFUND_POLICY]: {
      title: 'Refund Policy',
      blocks: [
        'Cancelling a repair order before the deposit is paid creates no fee. If the customer cancels after the deposit, BuildMate holds the 15% under the accepted terms and does not release it immediately; an admin allocates it. If the contractor cancels or does not perform, the customer is refunded the full 15% and BuildMate does not post the 5% fee.',
        'A mutual cancellation records a proposed refund, never above the held deposit, and needs admin confirmation. A dispute freezes escrow: no payout and no automatic refund.',
        'Material orders have no deposit, so there is no deposit penalty. Undelivered orders may be cancelled. Delivered orders use refusal, defect, or direct refund between customer and store.',
        'Contractor deposit refunds in this thesis are mock ledger entries on the original order. The same escrow cannot be refunded twice.',
      ],
    },
  },
};

function defaultPolicies() {
  const now = new Date();
  return ['vi', 'en'].flatMap((language) =>
    Object.entries(COPY[language]).map(([type, item]) => ({
      title: item.title,
      type,
      language,
      content: html(item.blocks),
      version: '1.0',
      status: POLICY_STATUS.ACTIVE,
      effectiveDate: now,
    }))
  );
}

module.exports = { defaultPolicies };
