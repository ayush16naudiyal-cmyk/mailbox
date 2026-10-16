-- Mailbox database schema.
-- seed.js runs this file after dropping the old tables, so it always starts from a clean slate.

CREATE TABLE users (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Each row is one copy of an email inside one user's mailbox. Sending an email
-- creates two rows: one in the sender's 'sent' and one in the recipient's 'inbox'.
-- That way each person can star, read or trash their own copy independently.
CREATE TABLE emails (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- mailbox owner
  sender_name     TEXT NOT NULL,
  sender_email    TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,
  folder          TEXT NOT NULL DEFAULT 'inbox' CHECK (folder IN ('inbox', 'sent', 'trash')),
  is_read         BOOLEAN NOT NULL DEFAULT false,
  is_starred      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NOTE: there is deliberately NO index on emails (user_id, folder, created_at) here.
-- scripts/benchmark-index.js creates it, so we can measure the inbox query
-- before and after adding the index.

CREATE TABLE labels (
  id      SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  UNIQUE (user_id, name) -- a user can't have two labels with the same name
);

-- Join table for the many-to-many link between emails and labels.
CREATE TABLE email_labels (
  email_id INTEGER NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (email_id, label_id) -- the same label can't be added to an email twice
);
