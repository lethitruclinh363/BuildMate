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
function otpEmailHtml({ name, otp, purpose = 'verify' }) {
  const displayName = escapeHtml(name || 'bạn');
  const isReset = purpose === 'reset';
  const title = isReset ? 'Đặt lại mật khẩu' : 'Xác thực email';
  const intro = isReset
    ? 'Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu tài khoản <strong>BuildMate</strong>. Dùng mã bên dưới. Mã có hiệu lực <strong>5 phút</strong> và chỉ sử dụng một lần.'
    : 'Cảm ơn bạn đã đăng ký tài khoản <strong>BuildMate</strong>. Dùng mã bên dưới để xác thực email. Mã có hiệu lực <strong>5 phút</strong> và chỉ sử dụng một lần.';
  const label = isReset ? 'MÃ ĐẶT LẠI MẬT KHẨU' : 'MÃ XÁC THỰC';
  const footer = 'Vì an toàn cho tài khoản, tuyệt đối không cung cấp mã này với bất kì ai';
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

function buildMateEmailLayout({ language = 'vi', title = 'BuildMate', preheader = '', contentHtml }) {
  const brand = emailBrand(language);
  const hidden = escapeHtml(preheader);

  return `<!DOCTYPE html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BuildMate ${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4efe6;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4efe6;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6dccb;">
            <tr>
              <td style="background:#1b2a4a;padding:28px 32px;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="width:44px;height:44px;border-radius:12px;background:#c4783a;color:#1b2a4a;font-family:Arial,sans-serif;font-size:16px;font-weight:700;text-align:center;vertical-align:middle;">BM</td>
                    <td style="padding-left:14px;">
                      <p style="margin:0;color:#c4783a;letter-spacing:3px;font-size:11px;font-family:Arial,sans-serif;">LOCAL BUILDING PLATFORM</p>
                      <h1 style="margin:4px 0 0;color:#ffffff;font-size:26px;font-weight:700;">BuildMate</h1>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 12px;color:#1b2a4a;font-size:18px;">Xin chào ${displayName},</p>
                <p style="margin:0 0 24px;color:#4a4453;font-size:15px;line-height:1.6;">${intro}</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center" style="background:#f7f1e8;border-radius:12px;padding:20px;border:1px dashed #c4783a;">
                      <p style="margin:0 0 6px;color:#6b6258;font-size:12px;letter-spacing:2px;font-family:Arial,sans-serif;">${label}</p>
                      <p style="margin:0;font-family:Consolas,Monaco,monospace;font-size:36px;letter-spacing:10px;color:#1b2a4a;font-weight:700;">${otp}</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;color:#6b6258;font-size:13px;line-height:1.5;">${footer}</p>
              </td>
            </tr>
            <tr>
              <td style="background:#1b2a4a;padding:16px 32px;text-align:center;">
                <p style="margin:0;color:#c9c1b4;font-size:12px;font-family:Arial,sans-serif;">© BuildMate — kết nối chủ nhà, thợ và cửa hàng vật liệu.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildOtpEmail({ name, otp, purpose = 'verify' }) {
  const isReset = purpose === 'reset';
  const safetyNotice = 'Vì an toàn cho tài khoản, tuyệt đối không cung cấp mã này với bất kì ai';
  const subject = isReset ? 'BuildMate — mã đặt lại mật khẩu' : 'BuildMate — mã xác thực email';
  const text = isReset
    ? `BuildMate\n\nXin chào ${name || ''},\nMã đặt lại mật khẩu: ${otp}\nMã hết hạn sau 5 phút và chỉ sử dụng một lần.\n\n${safetyNotice}`
    : `BuildMate\n\nXin chào ${name || ''},\nMã xác thực của bạn là: ${otp}\nMã hết hạn sau 5 phút và chỉ sử dụng một lần.\n\n${safetyNotice}`;

  return { subject, html: otpEmailHtml({ name, otp, purpose }), text };
}

async function sendEmail({ to, subject, text, html }) {
  const mailer = getTransporter();
  if (!mailer) {
    console.log(`[email] SMTP chưa cấu hình. Bỏ qua gửi tới ${to}. Subject: ${subject}`);
    if (text) console.log(text);
    return { sent: false, skipped: true };
  }

  await mailer.sendMail({
    from: env.smtpFrom || `"BuildMate" <${env.smtpUser}>`,
    to,
    subject,
    text,
    html,
  });

  return { sent: true, skipped: false };
}

async function sendOtpMail({ to, name, otp, purpose }) {
  return sendEmail({ to, ...buildOtpEmail({ name, otp, purpose }) });
}

async function sendPartnerApprovedEmail({ to, name, language }) {
  const message = renderPartnerApprovalEmail({ name, language });
  return sendEmail({ to, subject: message.subject, text: message.text, html: message.html });
}

async function sendVerificationEmail({ to, name, otp }) {
  return sendOtpMail({ to, name, otp, purpose: 'verify' });
}

async function sendResetPasswordEmail({ to, name, otp }) {
  return sendOtpMail({ to, name, otp, purpose: 'reset' });
}

const sendPasswordResetEmail = sendResetPasswordEmail;

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendResetPasswordEmail,
  sendPasswordResetEmail,
  buildOtpEmail,
  isSmtpConfigured,
};
