const { isSensitiveDocumentType } = require('./verification-docs');
const { publicUploadRelativePath } = require('./public-uploads');

const TTL_MS = 60 * 1000;
let cache = { at: 0, allow: new Set(), deny: new Set() };

function normalizeUploadUrl(url) {
  const value = String(url || '').replace(/\\/g, '/').trim();
  if (!value) return '';
  if (value.startsWith('/uploads/')) return value;
  if (value.startsWith('uploads/')) return `/${value}`;
  return value;
}

function collectPortfolioUrls(portfolio = {}) {
  const urls = [portfolio.avatar, portfolio.teamLogo, portfolio.workshop];
  for (const item of portfolio.construction || []) urls.push(item);
  for (const item of portfolio.certificates || []) urls.push(item);
  for (const project of portfolio.projects || []) {
    for (const image of project.images || []) urls.push(image);
  }
  return urls.filter(Boolean);
}

function collectStorePublicUrls(store = {}) {
  const urls = [store.avatar, store.logo, store.coverImage];
  for (const item of store.gallery || []) urls.push(item);
  for (const item of store.crewPhotos || []) urls.push(item);
  for (const item of store.publicCertificates || []) urls.push(item);
  return urls.filter(Boolean);
}

function classifyContractorUploadUrl(url, { documents = [], portfolio = {}, store = {} } = {}) {
  const normalized = normalizeUploadUrl(url);
  if (!normalized.includes('/uploads/contractors/')) return 'other';
  for (const doc of documents) {
    if (normalizeUploadUrl(doc.url) === normalized && isSensitiveDocumentType(doc.type)) {
      return 'deny';
    }
  }
  const allowed = new Set(
    [
      ...collectPortfolioUrls(portfolio),
      ...collectStorePublicUrls(store),
      ...documents.filter((doc) => !isSensitiveDocumentType(doc.type)).map((doc) => doc.url),
    ].map(normalizeUploadUrl)
  );
  return allowed.has(normalized) ? 'allow' : 'unknown';
}

function decideContractorUpload(url, rows) {
  let allow = false;
  for (const row of rows) {
    const result = classifyContractorUploadUrl(url, row);
    if (result === 'deny') return false;
    if (result === 'allow') allow = true;
  }
  return allow;
}

async function loadClassificationSets() {
  if (cache.allow && Date.now() - cache.at < TTL_MS) return cache;
  const { ContractorProfile, Store } = require('../repositories/partnerAccess');
  const [profiles, stores] = await Promise.all([ContractorProfile.find({}), Store.find({})]);
  const allow = new Set();
  const deny = new Set();
  const storeByOwner = new Map(stores.map((store) => [String(store.contractorId || store.ownerId || ''), store]));
  for (const profile of profiles) {
    const store = storeByOwner.get(String(profile.userId || ''));
    const context = {
      documents: profile.documents || [],
      portfolio: profile.portfolio || {},
      store: store || {},
    };
    const urls = [
      ...collectPortfolioUrls(context.portfolio),
      ...collectStorePublicUrls(context.store),
      ...(context.documents || []).map((doc) => doc.url),
    ];
    for (const item of urls) {
      const normalized = normalizeUploadUrl(item);
      if (!normalized.includes('/uploads/contractors/')) continue;
      if (classifyContractorUploadUrl(normalized, context) === 'deny') deny.add(normalized);
      else if (classifyContractorUploadUrl(normalized, context) === 'allow') allow.add(normalized);
    }
  }
  cache = { at: Date.now(), allow, deny };
  return cache;
}

async function canServeContractorPublicFile(reqPath) {
  const relative = publicUploadRelativePath(reqPath);
  const url = `/uploads/${relative}`;
  const sets = await loadClassificationSets();
  if (sets.deny.has(url)) return false;
  return sets.allow.has(url);
}

function invalidateContractorUploadCache() {
  cache = { at: 0, allow: new Set(), deny: new Set() };
}

module.exports = {
  normalizeUploadUrl,
  collectPortfolioUrls,
  collectStorePublicUrls,
  classifyContractorUploadUrl,
  decideContractorUpload,
  canServeContractorPublicFile,
  invalidateContractorUploadCache,
};
