import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

// A simple check for "something@something.something". The server does the real validation.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(form) {
  const errors = {};
  if (!EMAIL_PATTERN.test(form.to.trim())) errors.to = 'Enter a valid email address';
  if (!form.subject.trim()) errors.subject = 'Subject is required';
  if (!form.body.trim()) errors.body = 'Message is required';
  return errors;
}

// Uses the browser's built-in <dialog>. showModal() gives us for free:
// a backdrop, focus kept inside the dialog, and Esc to close.
export default function ComposeModal({ onClose, onSent }) {
  const dialogRef = useRef(null);
  const toInputRef = useRef(null);
  const [form, setForm] = useState({ to: '', subject: '', body: '' });
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState(null);

  useEffect(() => {
    dialogRef.current.showModal();
    toInputRef.current.focus();
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const newErrors = validate(form);
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSending(true);
    setServerError(null);
    try {
      await api('/emails', {
        method: 'POST',
        body: { to: form.to.trim(), subject: form.subject.trim(), body: form.body },
      });
      onSent();
    } catch (err) {
      setServerError(err.message);
      setSending(false);
    }
  }

  // Shared props for each input, so the error text is linked to its field for screen readers.
  function fieldProps(name) {
    return {
      id: `compose-${name}`,
      name,
      value: form[name],
      onChange: handleChange,
      'aria-invalid': errors[name] ? true : undefined,
      'aria-describedby': errors[name] ? `compose-${name}-error` : undefined,
    };
  }

  return (
    // onClose fires for Esc and for dialog.close(), so every way of closing goes through it.
    <dialog ref={dialogRef} className="compose" onClose={onClose} aria-labelledby="compose-title">
      <form onSubmit={handleSubmit} noValidate>
        <div className="compose-header">
          <h2 id="compose-title">New message</h2>
          <button
            type="button"
            className="icon-button"
            onClick={() => dialogRef.current.close()}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="compose-fields">
          <div className="field">
            <label htmlFor="compose-to">To</label>
            <input ref={toInputRef} type="email" autoComplete="email" {...fieldProps('to')} />
            {errors.to && <p id="compose-to-error" className="field-error">{errors.to}</p>}
          </div>

          <div className="field">
            <label htmlFor="compose-subject">Subject</label>
            <input type="text" maxLength={200} {...fieldProps('subject')} />
            {errors.subject && <p id="compose-subject-error" className="field-error">{errors.subject}</p>}
          </div>

          <div className="field field-grow">
            <label htmlFor="compose-body">Message</label>
            <textarea rows={10} maxLength={10000} {...fieldProps('body')} />
            {errors.body && <p id="compose-body-error" className="field-error">{errors.body}</p>}
          </div>

          {serverError && (
            <p className="field-error" role="alert">
              {serverError}
            </p>
          )}
        </div>

        <div className="compose-footer">
          {/* Disabled while sending so a double click can't send the email twice. */}
          <button type="submit" className="button button-primary" disabled={sending}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
