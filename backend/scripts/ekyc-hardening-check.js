const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { connectDatabase } = require('../src/config/database');
const { User, ROLES, USER_STATUS } = require('../src/models/User');
const { ContractorProfile, VERIFICATION_STATUS } = require('../src/models/ContractorProfile');
const { ContractorEkycVerification } = require('../src/models/ContractorEkycVerification');
const { Notification } = require('../src/models/Notification');

const API = 'http://127.0.0.1:5000/api';
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function tokenFingerprint(file) {
  const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find((item) => item.startsWith('EKYC_INTERNAL_TOKEN='));
  const value = line ? line.slice('EKYC_INTERNAL_TOKEN='.length).trim() : '';
  return {
    present: value.length > 0,
    hash: crypto.createHash('sha256').update(value).digest('hex'),
  };
}

async function login(pathname, email, password) {
  const response = await fetch(`${API}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  return { status: response.status, token: body.data?.token || '', body };
}

function jpeg(size = 800) {
  const bytes = Buffer.alloc(size, 0);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[size - 2] = 0xff;
  bytes[size - 1] = 0xd9;
  return new Blob([bytes], { type: 'image/jpeg' });
}

async function upload(token, file, type, name) {
  const form = new FormData();
  form.append('file', file, name);
  form.append('type', type);
  const response = await fetch(`${API}/contractor/ekyc/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function main() {
  const buildmate = tokenFingerprint(path.resolve(__dirname, '../.env'));
  const fastapi = tokenFingerprint('D:/Kì 9/2850_CT_SEP490_33_CT_SourceCode/hotel-booking-system/ekyc-service/.env');
  record('token-match', buildmate.present && buildmate.hash === fastapi.hash, buildmate.hash === fastapi.hash ? 'same hash' : 'different hash');

  let healthStatus = 0;
  try {
    const health = await fetch('http://127.0.0.1:8001/health');
    healthStatus = health.status;
  } catch {
    healthStatus = 0;
  }
  record('fastapi-health', healthStatus === 200, healthStatus ? `HTTP ${healthStatus}` : 'connection refused');

  const guest = await fetch(`${API}/contractor/ekyc`);
  record('guest-ekyc', guest.status === 401, `HTTP ${guest.status}`);

  await connectDatabase();
  const password = 'Ekyc@Test123';
  const stamp = Date.now();
  const emails = {
    customer: `ekyc-customer-${stamp}@buildmate.local`,
    approved: `ekyc-approved-${stamp}@buildmate.local`,
    first: `ekyc-a-${stamp}@buildmate.local`,
    second: `ekyc-b-${stamp}@buildmate.local`,
  };
  const users = [];
  try {
    const customer = await User.create({
      name: 'Ekyc Customer',
      email: emails.customer,
      password,
      phone: `0900001${String(stamp).slice(-4)}`,
      role: ROLES.CUSTOMER,
      status: USER_STATUS.ACTIVE,
      emailVerified: true,
    });
    users.push(customer);
    const approvedUser = await User.create({
      name: 'Ekyc Approved',
      email: emails.approved,
      password,
      phone: `0900002${String(stamp).slice(-4)}`,
      role: ROLES.CONTRACTOR,
      status: USER_STATUS.ACTIVE,
      emailVerified: true,
    });
    await ContractorProfile.create({ userId: approvedUser._id, verificationStatus: VERIFICATION_STATUS.APPROVED });
    users.push(approvedUser);
    let phoneSeq = 3;
    for (const email of [emails.first, emails.second]) {
      const user = await User.create({
        name: 'Ekyc Probe',
        email,
        password,
        phone: `090000${phoneSeq}${String(stamp).slice(-4)}`,
        role: ROLES.CONTRACTOR,
        status: USER_STATUS.ACTIVE,
        emailVerified: true,
      });
      phoneSeq += 1;
      await ContractorProfile.create({ userId: user._id, verificationStatus: VERIFICATION_STATUS.DRAFT });
      users.push(user);
    }

    const customerLogin = await login('/auth/login', emails.customer, password);
    const customerEkyc = await fetch(`${API}/contractor/ekyc`, {
      headers: { Authorization: `Bearer ${customerLogin.token}` },
    });
    record('customer-ekyc', customerEkyc.status === 403, `HTTP ${customerEkyc.status}`);

    const approved = await login('/auth/login', emails.approved, password);
    const approvedUpload = await upload(approved.token, jpeg(), 'CCCD_FRONT', 'front.jpg');
    record('approved-contractor-locked', approvedUpload.status === 409, `HTTP ${approvedUpload.status}`);

    const contractorA = users.find((user) => user.email === emails.first);
    const first = await login('/auth/login', emails.first, password);
    const second = await login('/auth/login', emails.second, password);
    const admin = await login('/admin/auth/login', 'ivan.p@example.net', 'Admin@1234');
    if (!first.token || !second.token || !admin.token) {
      throw new Error(`login failed customer=${customerLogin.status} a=${first.status} b=${second.status} admin=${admin.status}`);
    }

    const empty = await upload(first.token, new Blob([], { type: 'image/jpeg' }), 'CCCD_FRONT', 'empty.jpg');
    record('empty-file', empty.status === 400, `HTTP ${empty.status}`);

    const text = await upload(first.token, new Blob(['not-an-image'], { type: 'text/plain' }), 'CCCD_FRONT', 'note.txt');
    record('bad-mime', text.status === 400, `HTTP ${text.status}`);

    const huge = Buffer.alloc(9 * 1024 * 1024);
    huge[0] = 0xff;
    huge[1] = 0xd8;
    huge[2] = 0xff;
    const large = await upload(first.token, new Blob([huge], { type: 'image/jpeg' }), 'CCCD_FRONT', 'big.jpg');
    record('too-large', large.status === 400 || large.status === 413, `HTTP ${large.status}`);

    const front = await upload(first.token, jpeg(), 'CCCD_FRONT', 'front.jpg');
    const back = await upload(first.token, jpeg(900), 'CCCD_BACK', 'back.jpg');
    record('valid-card-upload', front.status === 200 && back.status === 200, `front ${front.status} back ${back.status}`);

    const privateRoot = path.resolve(__dirname, '../private/ekyc');
    const ownerDir = path.join(privateRoot, String(contractorA._id));
    const privateFiles = fs.existsSync(ownerDir) ? fs.readdirSync(ownerDir) : [];
    const publicHit = privateFiles.some((name) => fs.existsSync(path.resolve(__dirname, '../uploads', name)));
    record('private-storage', privateFiles.length >= 2 && !publicHit, `${privateFiles.length} private files`);

    const leaked = await fetch(`http://127.0.0.1:5000/private/ekyc/${contractorA._id}/${privateFiles[0] || 'missing.jpg'}`);
    const staticBypass = await fetch('http://127.0.0.1:5000/uploads/../private/ekyc');
    record('static-blocked', leaked.status === 404 && staticBypass.status === 404, `direct ${leaked.status} bypass ${staticBypass.status}`);

    const own = await fetch(`${API}/contractor/ekyc/files/front`, { headers: { Authorization: `Bearer ${first.token}` } });
    const other = await fetch(`${API}/contractor/ekyc/files/front`, { headers: { Authorization: `Bearer ${second.token}` } });
    record('owner-file', own.status === 200, `HTTP ${own.status}`);
    record('other-contractor-file', other.status === 404 || other.status === 403, `HTTP ${other.status}`);

    const profile = await ContractorProfile.findOne({ userId: contractorA._id });
    const contractorOnAdmin = await fetch(`${API}/admin/verifications/${profile._id}/ekyc/files/front`, {
      headers: { Authorization: `Bearer ${second.token}` },
    });
    const adminFile = await fetch(`${API}/admin/verifications/${profile._id}/ekyc/files/front`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    record('contractor-admin-route', contractorOnAdmin.status === 403, `HTTP ${contractorOnAdmin.status}`);
    record('admin-file', adminFile.status === 200, `HTTP ${adminFile.status}`);

    const form = new FormData();
    for (const field of ['selfie_image', 'left_image', 'right_image', 'up_image', 'down_image']) {
      form.append(field, jpeg(), `${field}.jpg`);
    }
    const processed = await fetch(`${API}/contractor/ekyc/process`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${first.token}` },
      body: form,
    });
    const processedBody = await processed.json();
    const serialized = JSON.stringify(processedBody);
    record('process-without-fastapi', processed.status === 502 || processed.status === 400, `HTTP ${processed.status}`);
    record('process-hides-embedding', !serialized.includes('embedding') && !serialized.includes('faceTemplate'), 'response has no template');
    const current = await fetch(`${API}/contractor/ekyc`, { headers: { Authorization: `Bearer ${first.token}` } });
    const currentBody = await current.json();
    record('status-not-passed-on-outage', currentBody.data?.status !== 'AI_PASSED' && currentBody.data?.status !== 'SUBMITTED', currentBody.data?.status || 'missing');

    const submitted = await fetch(`${API}/contractor/ekyc/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${first.token}` },
    });
    record('submit-blocked', submitted.status === 400, `HTTP ${submitted.status}`);

    profile.verificationStatus = VERIFICATION_STATUS.SUBMITTED;
    await profile.save();
    const retake = await fetch(`${API}/admin/verifications/${profile._id}/ekyc/retake`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Anh CCCD mo, yeu cau chup lai' }),
    });
    const retakeBody = await retake.json();
    const freshProfile = await ContractorProfile.findById(profile._id);
    const freshEkyc = await ContractorEkycVerification.findOne({ userId: contractorA._id });
    const notice = await Notification.findOne({ userId: contractorA._id, type: 'STATUS_UPDATE' });
    record('retake', retake.status === 200 && retakeBody.data?.status === 'NOT_STARTED' && freshEkyc.attempts.length === 1, `HTTP ${retake.status} status ${retakeBody.data?.status}`);
    record('retake-draft', freshProfile.verificationStatus === 'DRAFT', freshProfile.verificationStatus);
    record('retake-history', freshEkyc.attempts[0]?.cardImages?.front && !freshEkyc.attempts[0]?.faceTemplate, 'attempt kept, template absent');
    record('retake-notice', Boolean(notice), notice ? 'notification stored' : 'missing');
    record('retake-response-clean', !JSON.stringify(retakeBody).includes('faceTemplate'), 'no template field');
  } catch (error) {
    console.error('HARNESS_ERROR', error.message);
  } finally {
    const ids = users.map((user) => user._id);
    for (const id of ids) {
      fs.rmSync(path.resolve(__dirname, '../private/ekyc', String(id)), { recursive: true, force: true });
    }
    await Notification.deleteMany({ userId: { $in: ids } });
    await ContractorEkycVerification.deleteMany({ userId: { $in: ids } });
    await ContractorProfile.deleteMany({ userId: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
    const failed = results.filter((item) => !item.ok).length;
    console.log(`SUMMARY ${results.length - failed}/${results.length}`);
    process.exit(failed ? 1 : 0);
  }
}

main().catch((error) => {
  console.error('HARNESS_ERROR', error.message);
  process.exit(1);
});
