const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function vnParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return null;
  const shifted = new Date(ms + VN_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function dayKeyFromParts(parts) {
  return `${parts.y}-${pad(parts.m)}-${pad(parts.day)}`;
}

function monthKeyFromParts(parts) {
  return `${parts.y}-${pad(parts.m)}`;
}

function dayKey(value) {
  const parts = vnParts(value);
  return parts ? dayKeyFromParts(parts) : null;
}

function monthKey(value) {
  const parts = vnParts(value);
  return parts ? monthKeyFromParts(parts) : null;
}

function addUtcDays(parts, delta) {
  const utc = Date.UTC(parts.y, parts.m - 1, parts.day) + delta * 24 * 60 * 60 * 1000;
  const next = new Date(utc);
  return { y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

function lastDayKeys(count, now = new Date()) {
  const today = vnParts(now) || vnParts(new Date());
  const keys = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    keys.push(dayKeyFromParts(addUtcDays(today, -i)));
  }
  return keys;
}

function lastMonthKeys(count, now = new Date()) {
  const parts = vnParts(now) || vnParts(new Date());
  const keys = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    let month = parts.m - i;
    let year = parts.y;
    while (month <= 0) {
      month += 12;
      year -= 1;
    }
    keys.push(`${year}-${pad(month)}`);
  }
  return keys;
}

function dayLabel(key) {
  const [, month, day] = String(key).split('-');
  return `${day}/${month}`;
}

function monthLabel(key) {
  const [year, month] = String(key).split('-');
  return `${month}/${year}`;
}

function emptyMap(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function addAmount(map, key, amount) {
  if (!key || !(key in map)) return;
  const value = Number(amount);
  map[key] += Number.isFinite(value) ? value : 0;
}

function addCount(map, key) {
  if (!key || !(key in map)) return;
  map[key] += 1;
}

function periodDelta(values) {
  if (!Array.isArray(values) || values.length < 2) return 0;
  const prev = Number(values[values.length - 2]) || 0;
  const last = Number(values[values.length - 1]) || 0;
  if (!prev) return 0;
  return Math.round(((last - prev) / prev) * 1000) / 10;
}

function buildAdminSeries(now, input = {}) {
  const day7 = lastDayKeys(7, now);
  const day30 = lastDayKeys(30, now);
  const month12 = lastMonthKeys(12, now);

  const created7 = emptyMap(day7);
  const completed7 = emptyMap(day7);
  const created30 = emptyMap(day30);
  const completed30 = emptyMap(day30);
  const created12 = emptyMap(month12);
  const completed12 = emptyMap(month12);
  const gmv7 = emptyMap(day7);
  const gmv30 = emptyMap(day30);
  const gmv12 = emptyMap(month12);
  const deposit12 = emptyMap(month12);
  const commission12 = emptyMap(month12);
  const earning12 = emptyMap(month12);
  const customer12 = emptyMap(month12);
  const contractor12 = emptyMap(month12);

  for (const order of input.orders || []) {
    addCount(created7, dayKey(order.createdAt));
    addCount(created30, dayKey(order.createdAt));
    addCount(created12, monthKey(order.createdAt));
    if (order.status === 'CUSTOMER_ACCEPTED') {
      const at = order.completedAt || order.updatedAt || order.createdAt;
      addCount(completed7, dayKey(at));
      addCount(completed30, dayKey(at));
      addCount(completed12, monthKey(at));
    }
  }

  for (const event of input.gmvEvents || []) {
    addAmount(gmv7, dayKey(event.at), event.amount);
    addAmount(gmv30, dayKey(event.at), event.amount);
    addAmount(gmv12, monthKey(event.at), event.amount);
  }

  for (const event of input.depositEvents || []) {
    addAmount(deposit12, monthKey(event.at), event.amount);
  }

  for (const event of input.commissionEvents || []) {
    addAmount(commission12, monthKey(event.at), event.platformAmount);
    addAmount(earning12, monthKey(event.at), event.contractorAmount);
  }

  for (const user of input.customers || []) {
    addCount(customer12, monthKey(user.createdAt));
  }
  for (const user of input.contractors || []) {
    addCount(contractor12, monthKey(user.createdAt));
  }

  const mapDays = (keys, created, completed, gmv) =>
    keys.map((key) => ({
      key,
      label: dayLabel(key),
      created: created[key],
      completed: completed[key],
      gmv: Math.round(gmv[key] || 0),
    }));

  const months = month12.map((key) => ({
    key,
    label: monthLabel(key),
    created: created12[key],
    completed: completed12[key],
    gmv: Math.round(gmv12[key] || 0),
    payment: Math.round(deposit12[key] || 0),
    commission: Math.round(commission12[key] || 0),
    earning: Math.round(earning12[key] || 0),
    customer: customer12[key],
    contractor: contractor12[key],
  }));

  return {
    days7: mapDays(day7, created7, completed7, gmv7),
    days30: mapDays(day30, created30, completed30, gmv30),
    months12: months,
    deltas: {
      users: periodDelta(months.map((row) => row.customer)),
      contractors: periodDelta(months.map((row) => row.contractor)),
      orders: periodDelta(months.map((row) => row.created)),
      gmv: periodDelta(months.map((row) => row.gmv)),
      commission: periodDelta(months.map((row) => row.commission)),
    },
  };
}

module.exports = {
  VN_OFFSET_MS,
  dayKey,
  monthKey,
  lastDayKeys,
  lastMonthKeys,
  periodDelta,
  buildAdminSeries,
};
