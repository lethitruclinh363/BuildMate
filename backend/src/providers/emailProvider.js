const nodemailer = require('nodemailer');

const { env } = require('../config/env');

let transporter = null;

function isSmtpConfigured() {
  return Boolean(env.smtpHost && env.smtpUser && env.smtpPass);
}

function getTransporter() {
  if (transporter) return transporter;

  if (!isSmtpConfigured()) return null;

  transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: {
      user: env.smtpUser,
      pass: String(env.smtpPass).replace(/\s/g, ''),
    },
  });

  return transporter;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function appOrigin() {
  const first = String(env.clientUrl || '')
    .split(',')
    .map((item) => item.trim())
    .find(Boolean);

  return (first || 'http://localhost:5173').replace(/\/$/, '');
}

function emailBrand(language) {
  if (language === 'en') {
    return {
      lang: 'en',
      tagline: 'LOCAL BUILDING PLATFORM',
      footer: 'BuildMate — Local Building Platform',
    };
  }

  return {
    lang: 'vi',
    tagline: 'HỆ ĐIỀU HÀNH XÂY DỰNG',
    footer: 'BuildMate — Hệ điều hành xây dựng',
  };
}

function buildMateEmailLayout({
  language = 'vi',
  title = 'BuildMate',
  preheader = '',
  contentHtml,
}) {
  const brand = emailBrand(language);
  const hidden = escapeHtml(preheader);

  return `<!DOCTYPE html>
<html lang="${brand.lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>${escapeHtml(title)}</title>
  </head>

  <body style="margin:0;padding:0;background:#f4efe6;font-family:Georgia,'Times New Roman',serif;-webkit-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      ${hidden}
    </div>

    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      style="background:#f4efe6;padding:24px 12px;"
    >
      <tr>
        <td align="center">
          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            style="width:100%;max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6dccb;"
          >
            <tr>
              <td style="background:#1b2a4a;padding:28px 24px;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td
                      width="44"
                      height="44"
                      style="width:44px;height:44px;border-radius:12px;background:#c4783a;color:#1b2a4a;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;text-align:center;vertical-align:middle;line-height:44px;"
                    >
                      BM
                    </td>

                    <td style="padding-left:14px;vertical-align:middle;">
                      <h1
                        style="margin:0;color:#ffffff;font-size:26px;line-height:1.2;font-weight:700;"
                      >
                        BuildMate
                      </h1>

                      <p
                        style="margin:4px 0 0;color:#c4783a;letter-spacing:2px;font-size:11px;line-height:1.4;font-family:Arial,Helvetica,sans-serif;"
                      >
                        ${brand.tagline}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td
                style="padding:28px 24px;color:#1b2a4a;font-size:16px;line-height:1.6;"
              >
                ${contentHtml}
              </td>
            </tr>

            <tr>
              <td
                style="background:#1b2a4a;padding:16px 24px;text-align:center;"
              >
                <p
                  style="margin:0;color:#c9c1b4;font-size:12px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;"
                >
                  ${brand.footer}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function emailButton(href, label) {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);

  return `<table
    role="presentation"
    cellspacing="0"
    cellpadding="0"
    style="margin:8px 0 20px;"
  >
    <tr>
      <td
        bgcolor="#1b2a4a"
        style="border-radius:999px;background:#1b2a4a;"
      >
        <a
          href="${safeHref}"
          style="display:inline-block;padding:14px 28px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;line-height:1.2;text-decoration:none;border-radius:999px;"
        >
          ${safeLabel}
        </a>
      </td>
    </tr>
  </table>`;
}

function otpEmailHtml({ name, otp, purpose = 'verify' }) {
  const displayName = escapeHtml(name || 'bạn');
  const isReset = purpose === 'reset';

  const title = isReset
    ? 'Đặt lại mật khẩu'
    : 'Xác thực email';

  const validity = 'Mã có hiệu lực trong <strong>5 phút</strong> và chỉ sử dụng được một lần.';
  const intro = isReset
    ? `Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu tài khoản <strong>BuildMate</strong>. Dùng mã bên dưới. ${validity}`
    : `Cảm ơn bạn đã đăng ký tài khoản <strong>BuildMate</strong>. Dùng mã bên dưới để xác thực email. ${validity}`;

  const label = isReset
    ? 'MÃ ĐẶT LẠI MẬT KHẨU'
    : 'MÃ XÁC THỰC';

  const note = 'Vì an toàn tài khoản, tuyệt đối không chia sẻ mã này với bất kỳ ai.';

  const safeOtp = escapeHtml(otp);

  return buildMateEmailLayout({
    language: 'vi',
    title: `BuildMate ${title}`,
    preheader: `${label} ${otp}`,

    contentHtml: `
      <p
        style="margin:0 0 12px;color:#1b2a4a;font-size:18px;"
      >
        Xin chào ${displayName},
      </p>

      <p
        style="margin:0 0 24px;color:#4a4453;font-size:15px;line-height:1.6;"
      >
        ${intro}
      </p>

      <table
        role="presentation"
        width="100%"
        cellspacing="0"
        cellpadding="0"
      >
        <tr>
          <td
            align="center"
            style="background:#f7f1e8;border-radius:12px;padding:20px 12px;border:1px dashed #c4783a;"
          >
            <p
              style="margin:0 0 6px;color:#6b6258;font-size:12px;letter-spacing:2px;font-family:Arial,Helvetica,sans-serif;"
            >
              ${label}
            </p>

            <p
              style="margin:0;font-family:Consolas,Monaco,monospace;font-size:32px;letter-spacing:8px;color:#1b2a4a;font-weight:700;line-height:1.2;"
            >
              ${safeOtp}
            </p>
          </td>
        </tr>
      </table>

      <p
        style="margin:24px 0 0;color:#6b6258;font-size:13px;line-height:1.5;"
      >
        ${note}
      </p>
    `,
  });
}

function buildOtpEmail({ name, otp, purpose = 'verify' }) {
  const isReset = purpose === 'reset';

  const safetyNotice = 'Vì an toàn tài khoản, tuyệt đối không chia sẻ mã này với bất kỳ ai.';

  const subject = isReset
    ? 'BuildMate — mã đặt lại mật khẩu'
    : 'BuildMate — mã xác thực email';

  const text = isReset
    ? `BuildMate

Xin chào ${name || ''},
Mã đặt lại mật khẩu: ${otp}
Mã có hiệu lực trong 5 phút và chỉ sử dụng được một lần.

${safetyNotice}`
    : `BuildMate

Xin chào ${name || ''},
Mã xác thực của bạn là: ${otp}
Mã có hiệu lực trong 5 phút và chỉ sử dụng được một lần.

${safetyNotice}`;

  return {
    subject,
    html: otpEmailHtml({ name, otp, purpose }),
    text,
  };
}

function renderPartnerApprovalEmail({ name, language }) {
  const english = language === 'en';

  const displayName = escapeHtml(
    name || (english ? 'there' : 'bạn')
  );

  const loginUrl = `${appOrigin()}/login`;

  const subject = english
    ? 'Congratulations! Your BuildMate Partner Account Has Been Approved'
    : 'Chúc mừng! Hồ sơ đối tác BuildMate của bạn đã được phê duyệt';

  const text = english
    ? `Hello ${name || ''},

Congratulations!

Your BuildMate partner application has been approved.

You are now an official BuildMate partner.

You can sign in to complete your profile, manage your services, and start connecting with customers.

Sign in: ${loginUrl}

Thank you for joining BuildMate.
BuildMate — Local Building Platform`
    : `Xin chào ${name || ''},

Chúc mừng bạn!

Hồ sơ đối tác của bạn đã được BuildMate xét duyệt thành công.

Từ bây giờ, bạn đã trở thành đối tác chính thức của BuildMate và có thể sử dụng các chức năng dành cho đối tác trên nền tảng.

Bạn có thể đăng nhập để hoàn thiện hồ sơ, quản lý dịch vụ và bắt đầu kết nối với khách hàng.

Đăng nhập: ${loginUrl}

Cảm ơn bạn đã đồng hành cùng BuildMate.
BuildMate — Hệ điều hành xây dựng`;

  const contentHtml = english
    ? `
      <p
        style="margin:0 0 12px;color:#1b2a4a;font-size:18px;"
      >
        Hello ${displayName},
      </p>

      <p
        style="margin:0 0 8px;color:#1b2a4a;font-size:22px;line-height:1.3;"
      >
        Congratulations!
      </p>

      <p
        style="margin:0 0 12px;color:#4a4453;font-size:15px;line-height:1.6;"
      >
        Your BuildMate partner application has been approved.
      </p>

      <p
        style="margin:0 0 12px;color:#4a4453;font-size:15px;line-height:1.6;"
      >
        You are now an official BuildMate partner.
      </p>

      <p
        style="margin:0 0 20px;color:#4a4453;font-size:15px;line-height:1.6;"
      >
        You can sign in to complete your profile, manage your services, and start connecting with customers.
      </p>

      ${emailButton(loginUrl, 'Sign in to BuildMate →')}

      <p
        style="margin:0;color:#6b6258;font-size:13px;line-height:1.5;"
      >
        Thank you for joining BuildMate.
      </p>
    `
    : `
      <p
        style="margin:0 0 12px;color:#1b2a4a;font-size:18px;"
      >
        Xin chào ${displayName},
      </p>

      <p
        style="margin:0 0 8px;color:#1b2a4a;font-size:22px;line-height:1.3;"
      >
        Chúc mừng bạn!
      </p>

      <p
        style="margin:0 0 12px;color:#4a4453;font-size:15px;line-height:1.6;"
      >
        Hồ sơ đối tác của bạn đã được BuildMate xét duyệt thành công.
      </p>

      <p
        style="margin:0 0 12px;color:#4a4453;font-size:15px;line-height:1.6;"
      >
        Từ bây giờ, bạn đã trở thành đối tác chính thức của BuildMate và có thể sử dụng các chức năng dành cho đối tác trên nền tảng.
      </p>

      <p
        style="margin:0 0 20px;color:#4a4453;font-size:15px;line-height:1.6;"
      >
        Bạn có thể đăng nhập để hoàn thiện hồ sơ, quản lý dịch vụ và bắt đầu kết nối với khách hàng.
      </p>

      ${emailButton(loginUrl, 'Đăng nhập vào BuildMate →')}

      <p
        style="margin:0;color:#6b6258;font-size:13px;line-height:1.5;"
      >
        Cảm ơn bạn đã đồng hành cùng BuildMate.
      </p>
    `;

  return {
    subject,
    text,
    html: buildMateEmailLayout({
      language: english ? 'en' : 'vi',
      title: subject,
      preheader: english
        ? 'Your BuildMate partner application has been approved.'
        : 'Hồ sơ đối tác của bạn đã được phê duyệt.',
      contentHtml,
    }),
  };
}

async function sendEmail({ to, subject, text, html }) {
  const mailer = getTransporter();

  if (!mailer) {
    console.log(
      `[email] SMTP chưa cấu hình. Bỏ qua gửi tới ${to}. Subject: ${subject}`
    );

    if (text) {
      console.log(text);
    }

    return {
      sent: false,
      skipped: true,
    };
  }

  await mailer.sendMail({
    from: env.smtpFrom || `"BuildMate" <${env.smtpUser}>`,
    to,
    subject,
    text,
    html,
  });

  return {
    sent: true,
    skipped: false,
  };
}

async function sendOtpMail({ to, name, otp, purpose }) {
  return sendEmail({
    to,
    ...buildOtpEmail({
      name,
      otp,
      purpose,
    }),
  });
}

async function sendPartnerApprovedEmail({ to, name, language }) {
  const message = renderPartnerApprovalEmail({
    name,
    language,
  });

  return sendEmail({
    to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

async function sendVerificationEmail({ to, name, otp }) {
  return sendOtpMail({
    to,
    name,
    otp,
    purpose: 'verify',
  });
}

async function sendResetPasswordEmail({ to, name, otp }) {
  return sendOtpMail({
    to,
    name,
    otp,
    purpose: 'reset',
  });
}

const sendPasswordResetEmail = sendResetPasswordEmail;

module.exports = {
  sendEmail,
  buildMateEmailLayout,
  renderPartnerApprovalEmail,
  otpEmailHtml,
  sendPartnerApprovedEmail,
  sendVerificationEmail,
  sendResetPasswordEmail,
  sendPasswordResetEmail,
  buildOtpEmail,
  isSmtpConfigured,
};