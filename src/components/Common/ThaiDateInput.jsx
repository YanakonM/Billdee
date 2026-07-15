import { useEffect, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { formatDateInputThai, parseDateInputThai } from '../../utils/helpers';

export default function ThaiDateInput({
  value,
  onChange,
  id,
  name,
  className = 'form-input',
  placeholder = 'วว/ดด/พ.ศ.',
  disabled = false,
  readOnly = false,
  'aria-label': ariaLabel = 'วันที่',
}) {
  const nativeRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => formatDateInputThai(value));

  useEffect(() => {
    if (!focused) setDraft(formatDateInputThai(value));
  }, [focused, value]);

  const commit = raw => {
    const iso = parseDateInputThai(raw);
    if (!iso) return false;
    onChange?.(iso);
    setDraft(formatDateInputThai(iso));
    return true;
  };

  const handleTextChange = e => {
    const raw = e.target.value;
    setDraft(raw);
    const iso = parseDateInputThai(raw);
    if (iso) onChange?.(iso);
  };

  const handleBlur = () => {
    setFocused(false);
    const raw = draft.trim();
    if (!raw) {
      onChange?.('');
      setDraft('');
      return;
    }
    if (!commit(raw)) setDraft(formatDateInputThai(value));
  };

  const openPicker = () => {
    if (disabled || readOnly) return;
    const input = nativeRef.current;
    if (!input) return;
    try {
      if (typeof input.showPicker === 'function') input.showPicker();
      else input.click();
    } catch {
      input.focus();
      input.click();
    }
  };

  const handleNativeChange = e => {
    onChange?.(e.target.value);
    setDraft(formatDateInputThai(e.target.value));
  };

  return (
    <div className="thai-date-input">
      <input
        id={id}
        name={name}
        type="text"
        className={className}
        value={draft}
        onFocus={() => setFocused(true)}
        onChange={handleTextChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        inputMode="numeric"
        maxLength={10}
        disabled={disabled}
        readOnly={readOnly}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        className="thai-date-trigger"
        onMouseDown={e => e.preventDefault()}
        onClick={openPicker}
        disabled={disabled || readOnly}
        title="เลือกวันที่"
        aria-label="เลือกวันที่"
      >
        <Calendar size={16} />
      </button>
      <input
        ref={nativeRef}
        type="date"
        className="thai-date-native"
        value={value || ''}
        onChange={handleNativeChange}
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled || readOnly}
      />
    </div>
  );
}
