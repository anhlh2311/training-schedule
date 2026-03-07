import { useState, useEffect } from "react";

interface DisplayNameModalProps {
  open: boolean;
  currentName: string;
  onClose: () => void;
  onSave: (displayName: string) => Promise<void>;
}

export default function DisplayNameModal({
  open,
  currentName,
  onClose,
  onSave,
}: DisplayNameModalProps) {
  const [value, setValue] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setValue(currentName);
      setError("");
    }
  }, [open, currentName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Display name cannot be empty");
      return;
    }
    if (trimmed === currentName) {
      onClose();
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(trimmed);
      onClose();
    } catch (err) {
      setError("Failed to update. Please try again.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-100 bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="display-name-modal-title"
      >
        <h2 id="display-name-modal-title" className="text-lg font-semibold text-gray-900">
          Edit display name
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          This name will appear on your calendar events.
        </p>
        <form onSubmit={handleSubmit} className="mt-4">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            autoFocus
            disabled={saving}
            maxLength={100}
          />
          {error && (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          )}
          <div className="mt-4 flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
