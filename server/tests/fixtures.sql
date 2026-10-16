-- Small, fixed data set for the tests. The tables are recreated before every
-- test, so the SERIAL ids below are always the same and tests can refer to them.

INSERT INTO users (name, email) VALUES
  ('Ayush Naudiyal', 'ayush@mailbox.dev'),  -- id 1, the demo (logged-in) user
  ('Priya Sharma',   'priya@mailbox.dev'),  -- id 2
  ('Rahul Verma',    'rahul@mailbox.dev');  -- id 3

INSERT INTO labels (user_id, name) VALUES
  (1, 'Work'),      -- id 1
  (1, 'Personal'),  -- id 2
  (2, 'Work');      -- id 3, belongs to Priya

INSERT INTO emails (user_id, sender_name, sender_email, recipient_email, subject, body, folder, is_read, is_starred, created_at) VALUES
  -- Ayush's inbox: 5 emails, 3 unread (ids 1, 2, 5), 2 starred (ids 1, 4)
  (1, 'Priya Sharma', 'priya@mailbox.dev', 'ayush@mailbox.dev', 'Project kickoff meeting', 'Let us meet on Monday to plan the project.', 'inbox', false, true,  '2026-10-10 09:00:00+00'), -- id 1
  (1, 'Rahul Verma',  'rahul@mailbox.dev', 'ayush@mailbox.dev', 'Lunch tomorrow?',         'Are you free for lunch tomorrow?',            'inbox', false, false, '2026-10-11 09:00:00+00'), -- id 2
  (1, 'College Office', 'office@college.edu', 'ayush@mailbox.dev', 'Exam schedule',       'The final exam schedule is attached.',        'inbox', true,  false, '2026-10-12 09:00:00+00'), -- id 3
  (1, 'Bank Alerts',  'alerts@bank.com',   'ayush@mailbox.dev', 'Your monthly statement', 'Your statement for September is ready.',      'inbox', true,  true,  '2026-10-13 09:00:00+00'), -- id 4
  (1, 'Priya Sharma', 'priya@mailbox.dev', 'ayush@mailbox.dev', 'Re: Project kickoff',     'Sounds good, see you then.',                  'inbox', false, false, '2026-10-14 09:00:00+00'), -- id 5
  -- Ayush's sent and trash
  (1, 'Ayush Naudiyal', 'ayush@mailbox.dev', 'priya@mailbox.dev', 'Draft report',         'Here is the draft report.',                   'sent',  true,  false, '2026-10-09 09:00:00+00'), -- id 6
  (1, 'Spammy Deals', 'deals@spam.com',    'ayush@mailbox.dev', 'You won a prize',         'Click here to claim.',                        'trash', true,  false, '2026-10-08 09:00:00+00'), -- id 7
  -- Priya's mailbox: Ayush must never be able to see this
  (2, 'Rahul Verma',  'rahul@mailbox.dev', 'priya@mailbox.dev', 'Secret plans for Priya',  'Only Priya should read this.',                'inbox', false, true,  '2026-10-10 09:00:00+00'); -- id 8

INSERT INTO email_labels (email_id, label_id) VALUES
  (1, 1),  -- "Project kickoff meeting" -> Work
  (5, 1),  -- "Re: Project kickoff"     -> Work
  (3, 2),  -- "Exam schedule"           -> Personal
  (8, 3);  -- Priya's email             -> Priya's Work label
