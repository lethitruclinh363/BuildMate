const { connectMongo, connectPostgres, closeConnections } = require('../lib/connections');
const { loadPublicSchema } = require('../lib/schema');
const { ident, column } = require('../lib/rows');

const PARENTS = [
  ['repairrequests', 'repair_requests'],
  ['chatrooms', 'chat_rooms'],
  ['messages', 'messages'],
  ['quotations', 'quotations'],
  ['orders', 'service_orders'],
  ['payments', 'payments'],
  ['commissionrules', 'commission_rules'],
  ['commissions', 'commissions'],
  ['progressupdates', 'progress_updates'],
  ['reviews', 'reviews'],
  ['complaints', 'complaints'],
  ['materialOrders', 'material_orders'],
  ['materialOrderPayments', 'material_order_payments'],
  ['materialCommissions', 'material_commissions'],
  ['notifications', 'notifications'],
  ['policies', 'policies'],
  ['policyrevisions', 'policy_revisions'],
  ['auditlogs', 'audit_logs'],
  ['locationcorrections', 'location_corrections'],
];

async function count(pg, table, where = '') {
  const result = await pg.query(`SELECT COUNT(*)::int AS count FROM public.${ident(table)} ${where}`);
  return result.rows[0].count;
}

async function main() {
  let pg;
  const failures = [];
  try {
    const mongo = await connectMongo();
    pg = await connectPostgres();
    const schema = await loadPublicSchema(pg);
    console.log('\n=== Transactional verification ===');
    for (const [collection, table] of PARENTS) {
      const mongoCount = await mongo.db.collection(collection).countDocuments();
      const pgCount = await count(pg, table, 'WHERE legacy_mongo_id IS NOT NULL');
      const dup = await pg.query(`
        SELECT COUNT(*)::int AS count FROM (
          SELECT legacy_mongo_id FROM public.${ident(table)}
          WHERE legacy_mongo_id IS NOT NULL
          GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
        ) d
      `);
      console.log(`${collection} -> ${table}: mongo=${mongoCount} postgres=${pgCount} duplicateLegacy=${dup.rows[0].count}`);
      if (mongoCount !== pgCount) failures.push(`${table} count mismatch`);
      if (dup.rows[0].count) failures.push(`${table} duplicate legacy_mongo_id`);
    }

    const childExpectations = [
      ['repairrequests', 'images', 'videos', 'repair_request_media'],
      ['quotations', 'items', null, 'quotation_items'],
      ['progressupdates', 'images', null, 'progress_media'],
      ['materialOrders', 'items', null, 'material_order_items'],
      ['materialOrders', 'statusHistory', null, 'material_order_status_history'],
    ];
    for (const [collection, left, right, table] of childExpectations) {
      const docs = await mongo.db.collection(collection).find({}).toArray();
      let expected = 0;
      for (const doc of docs) {
        expected += (doc[left] || []).filter((item) => item && (typeof item === 'string' ? item.trim() : true)).length;
        if (right) expected += (doc[right] || []).filter((item) => item && String(item).trim()).length;
      }
      const actual = await count(pg, table);
      console.log(`${table}: expected=${expected} actual=${actual}`);
      if (expected !== actual) failures.push(`${table} child count mismatch`);
    }

    const moneyChecks = [];
    const quoteTotal = column(schema, 'quotations', ['total_cost']);
    const quoteMaterial = column(schema, 'quotations', ['material_cost']);
    const quoteLabor = column(schema, 'quotations', ['labor_cost']);
    const quoteTransport = column(schema, 'quotations', ['transport_cost']);
    if (quoteTotal && quoteMaterial && quoteLabor && quoteTransport) {
      moneyChecks.push([
        'quotation totals',
        `SELECT COUNT(*)::int AS count FROM public.quotations WHERE ${ident(quoteTotal)} <> ${ident(quoteMaterial)} + ${ident(quoteLabor)} + ${ident(quoteTransport)}`,
      ]);
    } else failures.push('quotation money columns missing');

    const payAmount = column(schema, 'payments', ['amount']);
    const platform = column(schema, 'commissions', ['platform_amount']);
    const contractor = column(schema, 'commissions', ['contractor_amount']);
    const commissionPayment = column(schema, 'commissions', ['payment_id']);
    if (payAmount && platform && contractor && commissionPayment) {
      moneyChecks.push([
        'commission totals',
        `SELECT COUNT(*)::int AS count
         FROM public.commissions c
         JOIN public.payments p ON p.id = c.${ident(commissionPayment)}
         WHERE c.${ident(platform)} + c.${ident(contractor)} <> p.${ident(payAmount)}`,
      ]);
    } else failures.push('commission money columns missing');

    const subtotal = column(schema, 'material_orders', ['material_subtotal']);
    const shipping = column(schema, 'material_orders', ['shipping_fee']);
    const total = column(schema, 'material_orders', ['total_amount']);
    const deposit = column(schema, 'material_orders', ['deposit_amount']);
    const remaining = column(schema, 'material_orders', ['remaining_amount']);
    if (subtotal && shipping && total && deposit && remaining) {
      moneyChecks.push([
        'material order totals',
        `SELECT COUNT(*)::int AS count FROM public.material_orders
         WHERE ${ident(subtotal)} + ${ident(shipping)} <> ${ident(total)}
            OR ${ident(deposit)} + ${ident(remaining)} <> ${ident(total)}`,
      ]);
    } else failures.push('material order money columns missing');

    for (const [label, sql] of moneyChecks) {
      const result = await pg.query(sql);
      console.log(`${label} mismatches: ${result.rows[0].count}`);
      if (result.rows[0].count) failures.push(`${label} mismatch`);
    }

    const orphanSql = await pg.query(`
      SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
    `);
    const watched = new Set(PARENTS.map((item) => item[1]).concat([
      'repair_request_media', 'quotation_items', 'progress_media', 'review_images', 'review_media',
      'complaint_attachments', 'complaint_media', 'material_order_items', 'material_order_status_history',
      'users', 'stores', 'locations', 'catalog_services', 'materials',
    ]));
    let orphans = 0;
    for (const fk of orphanSql.rows) {
      if (!watched.has(fk.table_name) || !schema[fk.table_name] || !schema[fk.foreign_table]) continue;
      const result = await pg.query(`
        SELECT COUNT(*)::int AS count
        FROM public.${ident(fk.table_name)} child
        LEFT JOIN public.${ident(fk.foreign_table)} parent
          ON parent.${ident(fk.foreign_column)} = child.${ident(fk.column_name)}
        WHERE child.${ident(fk.column_name)} IS NOT NULL
          AND parent.${ident(fk.foreign_column)} IS NULL
      `);
      if (result.rows[0].count) {
        orphans += result.rows[0].count;
        console.log(`orphan ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table}: ${result.rows[0].count}`);
      }
    }
    console.log(`orphan FK rows: ${orphans}`);
    if (orphans) failures.push('orphan foreign keys');

    const recipient = column(schema, 'notifications', ['user_id', 'recipient_user_id']);
    if (recipient) {
      const missingRecipient = await pg.query(`
        SELECT COUNT(*)::int AS count FROM public.notifications n
        LEFT JOIN public.users u ON u.id = n.${ident(recipient)}
        WHERE u.id IS NULL
      `);
      console.log(`notifications without recipient: ${missingRecipient.rows[0].count}`);
      if (missingRecipient.rows[0].count) failures.push('notification recipient missing');
    }

    const target = column(schema, 'reviews', ['target_type']);
    if (target) {
      const badTarget = await pg.query(`
        SELECT COUNT(*)::int AS count FROM public.reviews
        WHERE ${ident(target)} NOT IN ('CONTRACTOR', 'MATERIAL_STORE')
      `);
      console.log(`reviews with unexpected target: ${badTarget.rows[0].count}`);
      if (badTarget.rows[0].count) failures.push('review target mismatch');
    }

    if (failures.length) throw new Error(failures.join('; '));
    console.log('Verification PASSED. Transactional data matches MongoDB.');
  } finally {
    await closeConnections(pg);
  }
}

main().catch((err) => {
  console.error('\nVerification FAILED:', err.message);
  process.exitCode = 1;
});
