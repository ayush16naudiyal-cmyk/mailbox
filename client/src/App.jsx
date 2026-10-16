import { Navigate, Route, Routes } from 'react-router';
import Layout from './components/Layout.jsx';
import MailboxPage from './pages/MailboxPage.jsx';
import EmailPage from './pages/EmailPage.jsx';
import { EmptyState } from './components/States.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/inbox" replace />} />
        {/* The key makes React start fresh when switching folders,
            e.g. so selected checkboxes don't carry over from Inbox to Sent. */}
        <Route path="inbox" element={<MailboxPage key="inbox" view="inbox" />} />
        <Route path="starred" element={<MailboxPage key="starred" view="starred" />} />
        <Route path="sent" element={<MailboxPage key="sent" view="sent" />} />
        <Route path="trash" element={<MailboxPage key="trash" view="trash" />} />
        <Route path="label/:labelId" element={<MailboxPage key="label" view="label" />} />
        <Route path="email/:id" element={<EmailPage />} />
        <Route path="*" element={<EmptyState title="Page not found" message="That page doesn't exist." />} />
      </Route>
    </Routes>
  );
}
