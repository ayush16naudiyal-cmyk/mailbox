// Rebuilds the database from scratch: drops all tables, recreates them from
// schema.sql, then fills them with fake data. Safe to run as many times as you like.
// Usage: npm run db:reset
import fs from 'node:fs';
import { faker } from '@faker-js/faker';
import { pool } from '../src/db.js';

const USER_COUNT = 50;
const TOTAL_EMAILS = 100_000;
const DEMO_USER_EMAILS = 3_000;
const BATCH_SIZE = 1_000;
const LABEL_NAMES = ['Work', 'Personal', 'College', 'Finance', 'Travel'];

// Same seed = same fake data on every run, which makes results reproducible.
faker.seed(42);

// Builds "($1, $2, $3), ($4, $5, $6), ..." for a multi-row INSERT.
// Only placeholder numbers go into the SQL text; the values are sent separately
// as parameters, so this is still safe from SQL injection.
function placeholders(rowCount, columnCount) {
  const rows = [];
  for (let r = 0; r < rowCount; r++) {
    const cols = [];
    for (let c = 1; c <= columnCount; c++) {
      cols.push(`$${r * columnCount + c}`);
    }
    rows.push(`(${cols.join(', ')})`);
  }
  return rows.join(', ');
}

// Inserts rows in batches of 1,000. One INSERT with 1,000 rows is far faster
// than 1,000 single-row INSERTs, because each query is a network round trip.
// `table` and `columns` are hard-coded in this file, never user input.
async function insertInBatches(client, table, columns, rows, returning = '') {
  const inserted = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const sql = `INSERT INTO ${table} (${columns.join(', ')})
                 VALUES ${placeholders(batch.length, columns.length)} ${returning}`;
    const result = await client.query(sql, batch.flat());
    inserted.push(...result.rows);
  }
  return inserted;
}

function makeUsers() {
  // The demo user goes first so it gets id 1 (DEMO_USER_ID in .env).
  const users = [['Ayush Naudiyal', 'ayush@mailbox.dev']];
  for (let i = 1; i < USER_COUNT; i++) {
    const first = faker.person.firstName();
    const last = faker.person.lastName();
    // The number on the end keeps every address unique.
    users.push([`${first} ${last}`, `${first}.${last}${i}@mailbox.dev`.toLowerCase()]);
  }
  return users;
}

// People outside our app who send and receive mail, so not every
// address in the data belongs to a seeded user.
function makeContacts(users) {
  const outsiders = [];
  for (let i = 0; i < 200; i++) {
    outsiders.push({ name: faker.person.fullName(), email: faker.internet.email().toLowerCase() });
  }
  const insiders = users.map((u) => ({ name: u.name, email: u.email }));
  return [...outsiders, ...insiders];
}

function makeEmail(owner, contacts) {
  const roll = faker.number.float();
  // Roughly 70% inbox, 20% sent, 10% trash.
  const folder = roll < 0.7 ? 'inbox' : roll < 0.9 ? 'sent' : 'trash';

  let other = faker.helpers.arrayElement(contacts);
  if (other.email === owner.email) {
    other = contacts[0]; // don't send mail to yourself
  }

  const isSent = folder === 'sent';
  const sender = isSent ? owner : other;
  const recipient = isSent ? other : owner;

  return [
    owner.id,
    sender.name,
    sender.email,
    recipient.email,
    faker.company.catchPhrase(),
    faker.lorem.paragraphs({ min: 1, max: 3 }, '\n\n'),
    folder,
    // You've always read what you sent. Half of received mail is unread,
    // which gives about 40% unread overall.
    isSent ? true : faker.datatype.boolean({ probability: 0.5 }),
    faker.datatype.boolean({ probability: 0.1 }), // ~10% starred
    faker.date.past({ years: 2 }),
  ];
}

async function seed() {
  const started = Date.now();
  const client = await pool.connect();

  try {
    // Postgres can roll back CREATE/DROP TABLE too, so if anything fails
    // halfway the database is left exactly as it was.
    await client.query('BEGIN');

    console.log('Recreating tables...');
    await client.query('DROP TABLE IF EXISTS email_labels, labels, emails, users CASCADE');
    await client.query(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

    console.log('Inserting users...');
    const users = await insertInBatches(
      client,
      'users',
      ['name', 'email'],
      makeUsers(),
      'RETURNING id, name, email'
    );
    const demoUser = users[0];
    const otherUsers = users.slice(1);
    const contacts = makeContacts(users);

    console.log('Inserting labels...');
    const labelRows = [];
    for (const user of users) {
      for (const name of LABEL_NAMES) {
        labelRows.push([user.id, name]);
      }
    }
    const labels = await insertInBatches(
      client,
      'labels',
      ['user_id', 'name'],
      labelRows,
      'RETURNING id, user_id'
    );

    console.log(`Inserting ${TOTAL_EMAILS.toLocaleString()} emails...`);
    const emailRows = [];
    for (let i = 0; i < TOTAL_EMAILS; i++) {
      // The first 3,000 belong to the demo user; the rest are spread randomly over everyone else.
      const owner = i < DEMO_USER_EMAILS ? demoUser : faker.helpers.arrayElement(otherUsers);
      emailRows.push(makeEmail(owner, contacts));
    }
    const emails = await insertInBatches(
      client,
      'emails',
      [
        'user_id', 'sender_name', 'sender_email', 'recipient_email', 'subject',
        'body', 'folder', 'is_read', 'is_starred', 'created_at',
      ],
      emailRows,
      'RETURNING id, user_id'
    );

    console.log('Labelling about 20% of emails...');
    const labelIdsByUser = {};
    for (const label of labels) {
      labelIdsByUser[label.user_id] ??= [];
      labelIdsByUser[label.user_id].push(label.id);
    }
    const emailLabelRows = [];
    for (const email of emails) {
      if (faker.number.float() < 0.2) {
        // Always one of the owner's own labels, never another user's.
        emailLabelRows.push([email.id, faker.helpers.arrayElement(labelIdsByUser[email.user_id])]);
      }
    }
    await insertInBatches(client, 'email_labels', ['email_id', 'label_id'], emailLabelRows);

    await client.query('COMMIT');

    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\nDone in ${seconds}s`);
    console.log(`  users:        ${users.length}`);
    console.log(`  labels:       ${labels.length}`);
    console.log(`  emails:       ${emails.length}`);
    console.log(`  email_labels: ${emailLabelRows.length}`);
    console.log(`  demo user:    id ${demoUser.id} (${demoUser.email}) -> DEMO_USER_ID=${demoUser.id}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
