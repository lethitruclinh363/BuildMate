async function loadPublicSchema(pg) {
  const tables = await pg.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const columns = await pg.query(`
    SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  const fks = await pg.query(`
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table,
      ccu.column_name AS foreign_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
    ORDER BY tc.table_name, kcu.column_name
  `);

  const byTable = {};
  for (const name of tables.rows.map((r) => r.table_name)) {
    byTable[name] = { columns: {}, fks: [] };
  }
  for (const row of columns.rows) {
    if (!byTable[row.table_name]) continue;
    byTable[row.table_name].columns[row.column_name] = {
      dataType: row.data_type,
      udtName: row.udt_name,
      nullable: row.is_nullable === 'YES',
      default: row.column_default,
    };
  }
  for (const row of fks.rows) {
    if (!byTable[row.table_name]) continue;
    byTable[row.table_name].fks.push({
      column: row.column_name,
      table: row.foreign_table,
      foreignColumn: row.foreign_column,
    });
  }
  return byTable;
}

function columnNames(schema, table) {
  return Object.keys(schema[table]?.columns || {});
}

module.exports = { loadPublicSchema, columnNames };
