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
        'Giá vật liệu, phí thi công và hoa hồng nền tảng được ghi nhận trên BuildMate. Thanh toán và hoàn tiền tuân theo Chính sách thanh toán và Chính sách hoàn tiền đang hiệu lực.',
        'BuildMate có thể tạm khóa tài khoản nếu phát hiện gian lận, quấy rối, thông tin giả hoặc giao dịch cố tình đưa ra ngoài nền tảng để trốn hoa hồng.',
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
        'Hoa hồng nền tảng áp dụng trên phần việc hoàn thành theo tỷ lệ quản trị đang hiệu lực. Cập nhật tiến độ phải phản ánh hiện trường.',
        'Đội thợ chịu trách nhiệm an toàn thi công và chất lượng hạng mục mình nhận. BuildMate không thay mặt đội thợ ký hợp đồng dân sự với chủ nhà.',
      ],
    },
    [POLICY_TYPES.MATERIAL_STORE_POLICY]: {
      title: 'Chính sách chủ cửa hàng vật liệu',
      blocks: [
        'Chủ cửa hàng vật liệu đăng vật liệu, giá, tồn kho và khu vực giao hàng để chủ nhà và đội thợ đặt hàng cho công trình.',
        'Giá và đơn vị tính hiển thị trên gian hàng phải khớp với đơn được xác nhận. Cửa hàng chỉ giao trong khu vực đã khai báo, trừ khi hai bên thỏa thuận thêm trên đơn.',
        'Hồ sơ cửa hàng cần được duyệt trước khi gian hàng công khai. Hình ảnh và mô tả không được gây hiểu nhầm về xuất xứ hoặc chất lượng.',
        'Khiếu nại về thiếu hàng, sai quy cách hoặc giao trễ được xử lý cùng Chính sách hoàn tiền.',
      ],
    },
    [POLICY_TYPES.PAYMENT_POLICY]: {
      title: 'Chính sách thanh toán',
      blocks: [
        'Khoản thanh toán trên BuildMate gắn với đơn thi công hoặc đơn vật liệu đã được các bên xác nhận. Số tiền, trạng thái và thời điểm thanh toán được lưu trên đơn.',
        'Hoa hồng nền tảng được tính theo quy tắc hoa hồng đang hiệu lực tại thời điểm đơn hoàn thành, rồi ghi nhận tách khỏi phần thu của chủ đội thợ hoặc cửa hàng.',
        'Khách hàng thanh toán cho phần việc hoặc vật liệu đã chấp nhận. Đối tác không thu thêm ngoài nền tảng cho cùng hạng mục đó.',
        'Giao dịch bị nghi ngờ gian lận có thể bị tạm giữ để quản trị viên kiểm tra trước khi chuyển trạng thái đã thanh toán.',
      ],
    },
    [POLICY_TYPES.REFUND_POLICY]: {
      title: 'Chính sách hoàn tiền',
      blocks: [
        'Khách hàng có thể được hoàn tiền khi đơn bị hủy trước lúc thi công bắt đầu, hoặc khi quản trị viên kết luận khiếu nại là có căn cứ.',
        'Vật liệu đã giao và đã đưa vào công trình không được hoàn đủ giá trị nếu hàng đã cắt, pha trộn hoặc không thể bán lại. Phần chưa giao có thể được hoàn.',
        'Phần việc đã nghiệm thu và chấp nhận không tự động được hoàn. Tranh chấp về chất lượng đi qua khiếu nại, rồi quản trị viên quyết định hoàn một phần hoặc toàn bộ.',
        'Hoàn tiền được ghi trên đơn gốc. Thời gian tiền về phụ thuộc kênh thanh toán đã dùng.',
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
        'Labour prices, material prices, and the platform commission are recorded on BuildMate. Payments and refunds follow the Payment Policy and Refund Policy then in effect.',
        'BuildMate may suspend an account for fraud, harassment, false information, or deliberately moving a platform job off BuildMate to avoid commission.',
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
        'The platform commission applies to completed work at the rate then set by admin. Progress updates must match the site.',
        'The crew is responsible for site safety and for the quality of the work it accepts. BuildMate does not sign the construction contract with the homeowner in the crew’s place.',
      ],
    },
    [POLICY_TYPES.MATERIAL_STORE_POLICY]: {
      title: 'Material Store Policy',
      blocks: [
        'A material store owner lists materials, prices, stock, and a delivery area so homeowners and crews can order for a site.',
        'The price and unit shown on the listing must match the confirmed order. The store delivers inside the area it declared, unless both sides record a further agreement on the order.',
        'The store profile must be approved before the shop is public. Photos and descriptions must not misstate origin or quality.',
        'Complaints about shortages, wrong specification, or late delivery are handled together with the Refund Policy.',
      ],
    },
    [POLICY_TYPES.PAYMENT_POLICY]: {
      title: 'Payment Policy',
      blocks: [
        'A payment on BuildMate belongs to a construction order or a material order the parties have confirmed. The amount, status, and time are stored on that order.',
        'Platform commission is calculated with the commission rule in effect when the order is completed, and is recorded separately from what the contractor or store receives.',
        'The customer pays for accepted work or materials. A partner does not collect an extra off-platform payment for the same item.',
        'A transaction suspected of fraud may be held for an admin review before it is marked paid.',
      ],
    },
    [POLICY_TYPES.REFUND_POLICY]: {
      title: 'Refund Policy',
      blocks: [
        'A customer may receive a refund when an order is cancelled before work starts, or when an admin finds a complaint justified.',
        'Materials already delivered and built into the site are not refunded in full if they were cut, mixed, or cannot be resold. The undelivered part may be refunded.',
        'Work that was accepted is not refunded automatically. Quality disputes go through a complaint, and an admin may refund part or all of the payment.',
        'A refund is recorded on the original order. The time for funds to return depends on the payment channel that was used.',
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
