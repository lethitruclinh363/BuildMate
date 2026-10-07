const crypto = require('crypto');
const { prisma } = require('../config/prisma');
const { db } = require('./pgContext');
const { legacyClause } = require('./scopedQuery');

function newId() {
  return crypto.randomBytes(12).toString('hex');
}

function text(value, max) {
  const raw = value == null ? '' : String(value);
  return max ? raw.slice(0, max) : raw;
}

function legacyOf(value) {
  if (value == null || value === '') return '';
  if (typeof value.toHexString === 'function') return value.toHexString();
  if (typeof value === 'object') return String(value._id || value.id || '');
  return String(value);
}

function timeOf(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function isOperator(value) {
  return Boolean(
    value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && typeof value.toHexString !== 'function'
  );
}

function matchValue(actual, expected) {
  if (isOperator(expected)) {
    if (expected.$in) return expected.$in.map((item) => legacyOf(item)).includes(legacyOf(actual));
    if (Object.prototype.hasOwnProperty.call(expected, '$ne')) return legacyOf(actual) !== legacyOf(expected.$ne);
    if (expected.$regex) {
      const flags = String(expected.$options || '').includes('i') ? 'i' : '';
      return new RegExp(expected.$regex, flags).test(String(actual || ''));
    }
    return false;
  }
  if (typeof expected === 'boolean') return Boolean(actual) === expected;
  return legacyOf(actual) === legacyOf(expected);
}

function valueAt(doc, key) {
  if (!key.includes('.')) return doc[key];
  return key.split('.').reduce((current, part) => (current == null ? undefined : current[part]), doc);
}

function matches(doc, filter) {
  return Object.entries(filter || {}).every(([key, value]) => {
    if (key === '$or') return value.some((part) => matches(doc, part));
    return matchValue(valueAt(doc, key), value);
  });
}

function sortRows(rows, spec) {
  const keys = Object.entries(spec || {});
  return [...rows].sort((left, right) => {
    for (const [key, direction] of keys) {
      const a = left[key];
      const b = right[key];
      const delta = typeof a === 'number' || typeof b === 'number'
        ? Number(a || 0) - Number(b || 0)
        : (timeOf(a) || 0) - (timeOf(b) || 0);
      if (delta) return direction < 0 ? -delta : delta;
    }
    return 0;
  });
}

function chain(loader) {
  const state = { sort: null, limit: null, skip: 0 };
  const exec = async () => {
    let rows = await loader();
    if (state.sort) rows = sortRows(rows, state.sort);
    if (state.skip) rows = rows.slice(state.skip);
    if (state.limit != null) rows = rows.slice(0, state.limit);
    return rows;
  };
  const query = {
    sort(value) { state.sort = value; return query; },
    skip(value) { state.skip = Number(value) || 0; return query; },
    limit(value) { state.limit = Number(value); return query; },
    select() { return query; },
    populate() { return query; },
    then(resolve, reject) { return exec().then(resolve, reject); },
    catch(reject) { return exec().catch(reject); },
  };
  return query;
}

function markDuplicate(err) {
  if (err?.code === 'P2002') err.code = 11000;
  throw err;
}

async function userId(legacyId) {
  const id = legacyOf(legacyId);
  if (!id) return null;
  const row = await db().users.findFirst({ where: { legacy_mongo_id: id }, select: { id: true } });
  return row?.id || null;
}

class PgNote {
  constructor(data) {
    Object.assign(this, data);
  }

  toPublic() {
    return {
      id: this._id,
      userId: legacyOf(this.userId),
      title: this.title,
      message: this.message,
      type: this.type,
      isRead: Boolean(this.isRead),
      link: this.link || '',
      meta: this.meta || {},
      createdAt: this.createdAt,
    };
  }
}

function noteFromRow(row) {
  return new PgNote({
    pgId: row.id,
    _id: row.legacy_mongo_id,
    userId: row.users?.legacy_mongo_id || '',
    title: row.title,
    message: row.message,
    type: row.notification_type,
    isRead: row.is_read,
    link: row.link || '',
    meta: row.metadata || row.meta || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function allNotes() {
  return (await prisma.notifications.findMany({
    include: { users: { select: { legacy_mongo_id: true } } },
  })).map(noteFromRow);
}

async function persistNote(doc) {
  const user = await userId(doc.userId);
  if (!user) throw new Error('Notification user is not in PostgreSQL');
  const data = {
    user_id: user,
    title: text(doc.title, 140),
    message: text(doc.message, 400),
    notification_type: doc.type,
    is_read: Boolean(doc.isRead),
    link: text(doc.link, 2000),
    meta: doc.meta || {},
    updated_at: new Date(),
  };
  const row = doc.pgId
    ? await db().notifications.update({ where: { id: doc.pgId }, data })
    : await db().notifications.create({
        data: { ...data, legacy_mongo_id: doc._id || newId(), created_at: doc.createdAt || new Date() },
      });
  doc.pgId = row.id;
  doc._id = row.legacy_mongo_id;
}

function noteWhere(filter) {
  const where = {};
  for (const [key, value] of Object.entries(filter || {})) {
    if (key === 'userId') {
      const id = legacyClause(value);
      if (id == null) return null;
      where.users = { legacy_mongo_id: id };
    } else if (key === '_id') {
      const id = legacyClause(value);
      if (id == null) return null;
      where.legacy_mongo_id = id;
    } else if (key === 'isRead' && typeof value === 'boolean') {
      where.is_read = value;
    } else {
      return null;
    }
  }
  return where;
}

async function notesFor(filter, state = {}) {
  const where = noteWhere(filter);
  if (!where) return null;
  const rows = await prisma.notifications.findMany({
    where,
    include: { users: { select: { legacy_mongo_id: true } } },
    orderBy: state.sort?.createdAt < 0 ? { created_at: 'desc' } : undefined,
    skip: state.skip || undefined,
    take: state.limit > 0 ? state.limit : undefined,
  });
  return rows.map(noteFromRow);
}

const Notification = {
  find(filter = {}) {
    const state = { sort: null, limit: null, skip: 0 };
    const exec = async () => {
      const scoped = await notesFor(filter, state);
      if (scoped) return scoped;
      let rows = (await allNotes()).filter((row) => matches(row, filter));
      if (state.sort) rows = sortRows(rows, state.sort);
      if (state.skip) rows = rows.slice(state.skip);
      if (state.limit != null) rows = rows.slice(0, state.limit);
      return rows;
    };
    const query = {
      sort(value) { state.sort = value; return query; },
      skip(value) { state.skip = Number(value) || 0; return query; },
      limit(value) { state.limit = Number(value); return query; },
      select() { return query; },
      populate() { return query; },
      then(resolve, reject) { return exec().then(resolve, reject); },
      catch(reject) { return exec().catch(reject); },
    };
    return query;
  },
  async countDocuments(filter = {}) {
    const where = noteWhere(filter);
    if (where) return prisma.notifications.count({ where });
    return (await allNotes()).filter((row) => matches(row, filter)).length;
  },
  async create(data) {
    const doc = new PgNote({ ...data, isRead: false, meta: data.meta || {} });
    await persistNote(doc);
    return doc;
  },
  async findOneAndUpdate(filter, update) {
    const scoped = await notesFor(filter, { limit: 1 });
    const doc = scoped ? scoped[0] : (await allNotes()).find((row) => matches(row, filter));
    if (!doc) return null;
    Object.assign(doc, update?.$set || update);
    await persistNote(doc);
    return doc;
  },
  async updateMany(filter, update) {
    const where = noteWhere(filter);
    const data = update?.$set || update;
    if (where && Object.keys(data).length === 1 && Object.prototype.hasOwnProperty.call(data, 'isRead')) {
      const result = await prisma.notifications.updateMany({ where, data: { is_read: Boolean(data.isRead), updated_at: new Date() } });
      return { modifiedCount: result.count };
    }
    const scoped = await notesFor(filter);
    const rows = scoped || (await allNotes()).filter((row) => matches(row, filter));
    for (const row of rows) {
      Object.assign(row, data);
      await persistNote(row);
    }
    return { modifiedCount: rows.length };
  },
};

class PgAudit {
  constructor(data) {
    Object.assign(this, data);
  }

  toPublic() {
    return {
      id: this._id,
      actorId: this.actorId ? legacyOf(this.actorId) : null,
      actorRole: this.actorRole || '',
      action: this.action,
      entityType: this.entityType,
      entityId: this.entityId || '',
      meta: this.meta || {},
      ip: this.ip || '',
      createdAt: this.createdAt,
    };
  }
}

function auditFromRow(row) {
  return new PgAudit({
    pgId: row.id,
    _id: row.legacy_mongo_id,
    actorId: row.users?.legacy_mongo_id || null,
    actorRole: row.actor_role || '',
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id || '',
    meta: row.meta || {},
    ip: row.ip || '',
    createdAt: row.created_at,
  });
}

const AuditLog = {
  find(filter = {}) {
    return chain(async () => (await prisma.audit_logs.findMany({
      include: { users: { select: { legacy_mongo_id: true } } },
    })).map(auditFromRow).filter((row) => matches(row, filter)));
  },
  async create(data) {
    const actor = data.actorId ? await userId(data.actorId) : null;
    const row = await db().audit_logs.create({
      data: {
        legacy_mongo_id: newId(),
        actor_user_id: actor,
        actor_role: text(data.actorRole, 50),
        action: data.action,
        entity_type: text(data.entityType, 100),
        entity_id: text(data.entityId, 100),
        meta: data.meta || {},
        ip: text(data.ip, 100),
        created_at: new Date(),
        updated_at: new Date(),
      },
      include: { users: { select: { legacy_mongo_id: true } } },
    });
    return auditFromRow(row);
  },
};

class PgPolicy {
  constructor(data) {
    Object.assign(this, data);
  }

  async save() {
    await persistPolicy(this);
    return this;
  }
}

function policyFromRow(row) {
  return new PgPolicy({
    pgId: row.id,
    _id: row.legacy_mongo_id,
    title: row.title,
    type: row.policy_type,
    content: row.content,
    language: row.language,
    version: row.version,
    status: row.status,
    effectiveDate: row.effective_date,
    createdBy: row.users?.legacy_mongo_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

const policyInclude = { users: { select: { legacy_mongo_id: true } } };

async function allPolicies() {
  return (await prisma.policies.findMany({ include: policyInclude })).map(policyFromRow);
}

async function persistPolicy(doc) {
  const createdBy = doc.createdBy ? await userId(doc.createdBy) : null;
  const data = {
    title: text(doc.title, 160),
    policy_type: doc.type,
    content: doc.content || '',
    language: doc.language,
    version: text(doc.version, 32),
    status: doc.status,
    effective_date: doc.effectiveDate || null,
    created_by: createdBy,
    updated_at: new Date(),
  };
  const row = doc.pgId
    ? await db().policies.update({ where: { id: doc.pgId }, data, include: policyInclude })
    : await db().policies.create({
        data: { ...data, legacy_mongo_id: doc._id || newId(), created_at: doc.createdAt || new Date() },
        include: policyInclude,
      });
  doc.pgId = row.id;
  doc._id = row.legacy_mongo_id;
  doc.updatedAt = row.updated_at;
}

const Policy = {
  find(filter = {}) {
    return chain(async () => (await allPolicies()).filter((row) => matches(row, filter)));
  },
  findOne(filter = {}) {
    const query = this.find(filter);
    const exec = query.then.bind(query);
    query.then = (resolve, reject) => exec((rows) => resolve(rows[0] || null), reject);
    return query;
  },
  findById(id) {
    return this.findOne({ _id: id });
  },
  async countDocuments() {
    return prisma.policies.count();
  },
  async create(data) {
    const doc = new PgPolicy(data);
    await doc.save();
    return doc;
  },
  async insertMany(rows) {
    const created = [];
    for (const row of rows) created.push(await this.create(row));
    return created;
  },
  async updateMany(filter, update) {
    const rows = (await allPolicies()).filter((row) => matches(row, filter));
    const data = update?.$set || update;
    for (const row of rows) {
      Object.assign(row, data);
      await row.save();
    }
    return { modifiedCount: rows.length };
  },
};

class PgRevision {
  constructor(data) {
    Object.assign(this, data);
  }
}

function revisionFromRow(row) {
  return new PgRevision({
    pgId: row.id,
    _id: row.legacy_mongo_id,
    policyId: row.policies?.legacy_mongo_id || '',
    title: row.title,
    type: row.policy_type,
    content: row.content,
    language: row.language,
    version: row.version,
    status: row.status,
    effectiveDate: row.effective_date,
    editedBy: row.users?.legacy_mongo_id || null,
    createdAt: row.created_at,
  });
}

const PolicyRevision = {
  find(filter = {}) {
    return chain(async () => (await prisma.policy_revisions.findMany({
      include: {
        policies: { select: { legacy_mongo_id: true } },
        users: { select: { legacy_mongo_id: true } },
      },
    })).map(revisionFromRow).filter((row) => matches(row, filter)));
  },
  async create(data) {
    const policy = await db().policies.findFirst({ where: { legacy_mongo_id: legacyOf(data.policyId) }, select: { id: true } });
    if (!policy) throw new Error('Policy revision parent is not in PostgreSQL');
    const editor = data.editedBy ? await userId(data.editedBy) : null;
    const row = await db().policy_revisions.create({
      data: {
        legacy_mongo_id: newId(),
        policy_id: policy.id,
        title: text(data.title, 160),
        policy_type: data.type,
        content: data.content || '',
        language: data.language,
        version: text(data.version, 32),
        status: data.status,
        effective_date: data.effectiveDate || null,
        edited_by: editor,
        created_at: new Date(),
        updated_at: new Date(),
      },
      include: {
        policies: { select: { legacy_mongo_id: true } },
        users: { select: { legacy_mongo_id: true } },
      },
    });
    return revisionFromRow(row);
  },
};

class PgCorrection {
  constructor(data) {
    Object.assign(this, data);
    this.confirmedCount = Number(data.confirmedCount || 0);
  }

  async save() {
    const point = this.location?.coordinates || [];
    const lng = Number(point[0]);
    const lat = Number(point[1]);
    let locationId = this.locationPgId || null;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const data = {
        latitude: lat,
        longitude: lng,
        is_confirmed: true,
        confirmed_at: this.lastConfirmedAt || new Date(),
        provider_ref_id: text(this.providerRefId, 2000) || null,
        updated_at: new Date(),
      };
      if (locationId) await db().locations.update({ where: { id: locationId }, data });
      else {
        const created = await db().locations.create({ data: { ...data, created_at: new Date() } });
        locationId = created.id;
      }
    }
    if (!locationId) throw new Error('Location correction needs coordinates');
    const data = {
      normalized_address: this.normalizedAddress,
      location_id: locationId,
      provider_ref_id: text(this.providerRefId, 2000),
      confirmed_count: this.confirmedCount,
      last_confirmed_at: this.lastConfirmedAt || null,
      updated_at: new Date(),
    };
    const row = this.pgId
      ? await db().location_corrections.update({ where: { id: this.pgId }, data })
      : await db().location_corrections.create({
          data: { ...data, legacy_mongo_id: this._id || newId(), created_at: new Date() },
        });
    this.pgId = row.id;
    this._id = row.legacy_mongo_id;
    this.locationPgId = locationId;
    return this;
  }
}

function correctionFromRow(row) {
  return new PgCorrection({
    pgId: row.id,
    locationPgId: row.location_id,
    _id: row.legacy_mongo_id,
    normalizedAddress: row.normalized_address,
    location: row.locations?.latitude == null ? null : {
      type: 'Point',
      coordinates: [Number(row.locations.longitude), Number(row.locations.latitude)],
    },
    providerRefId: row.provider_ref_id || '',
    confirmedCount: row.confirmed_count,
    lastConfirmedAt: row.last_confirmed_at,
  });
}

async function allCorrections() {
  return (await prisma.location_corrections.findMany({ include: { locations: true } })).map(correctionFromRow);
}

const LocationCorrection = {
  find(filter = {}) {
    return chain(async () => (await allCorrections()).filter((row) => matches(row, filter)));
  },
  findOne(filter = {}) {
    const query = this.find(filter);
    const exec = query.then.bind(query);
    query.then = (resolve, reject) => exec((rows) => resolve(rows[0] || null), reject);
    return query;
  },
  async findOneAndUpdate(filter, update, options = {}) {
    try {
      let doc = (await allCorrections()).find((row) => matches(row, filter));
      if (!doc && options.upsert) {
        doc = new PgCorrection({
          normalizedAddress: filter.normalizedAddress || update.$setOnInsert?.normalizedAddress,
          confirmedCount: 0,
          location: { type: 'Point', coordinates: [] },
        });
      }
      if (!doc) return null;
      Object.assign(doc, update.$set || {});
      if (update.$inc) {
        for (const [key, value] of Object.entries(update.$inc)) doc[key] = Number(doc[key] || 0) + Number(value);
      }
      await doc.save();
      return doc;
    } catch (err) {
      markDuplicate(err);
    }
  },
};

module.exports = { Notification, AuditLog, Policy, PolicyRevision, LocationCorrection };
