import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";

interface NotificationSettings {
  aggregationEnabled: boolean;
  availabilityWindowMinutes: number;
  eventSoonWindowMinutes: number;
  eventSoonThresholdHours?: number;
}

const DEFAULTS: NotificationSettings = {
  aggregationEnabled: false,
  availabilityWindowMinutes: 30,
  eventSoonWindowMinutes: 5,
  eventSoonThresholdHours: 2,
};

export default function NotificationSettingsPage() {
  const { isAdmin } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const ref = doc(db, "settings", "notifications");
    getDoc(ref).then((snap) => {
      if (snap.exists()) {
        setSettings({ ...DEFAULTS, ...snap.data() } as NotificationSettings);
      }
      setLoading(false);
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await setDoc(doc(db, "settings", "notifications"), settings, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-amber-800">
        Only admins can access notification settings.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notification settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Control how trainers are notified about availability and event changes.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-6">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="text-sm font-medium text-gray-700">
              Aggregate notifications
            </span>
            <input
              type="checkbox"
              checked={settings.aggregationEnabled}
              onChange={(e) =>
                setSettings((s) => ({ ...s, aggregationEnabled: e.target.checked }))
              }
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </label>
          <p className="text-xs text-gray-500">
            When on, availability updates are batched and sent on a schedule instead of
            immediately. Event subscribe/drop-off within 2 hours of start use a shorter
            batch window.
          </p>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Availability batch window
            </label>
            <select
              value={settings.availabilityWindowMinutes}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  availabilityWindowMinutes: Number(e.target.value),
                }))
              }
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              How often to send batched availability updates (when aggregation is on).
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Event-soon batch window
            </label>
            <select
              value={settings.eventSoonWindowMinutes}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  eventSoonWindowMinutes: Number(e.target.value),
                }))
              }
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value={5}>5 minutes</option>
              <option value={10}>10 minutes</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              For subscribe/drop-off when the event starts within 2 hours.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {saved && (
              <span className="text-sm text-green-600">Settings saved.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
