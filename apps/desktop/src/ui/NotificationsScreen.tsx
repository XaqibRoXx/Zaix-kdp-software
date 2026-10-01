import { useEffect, useMemo, useState } from "react";
import {
  ZaxisCloudApi,
  type AdminNotification
} from "../cloud/apiClient";
import type { AppSettings } from "../state/appSettings";

export function NotificationsScreen({
  appSettings,
  token
}: {
  appSettings: AppSettings;
  token: string;
}) {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [status, setStatus] = useState("");

  const api = useMemo(
    () => new ZaxisCloudApi(appSettings.cloudApiUrl.trim(), token.trim() || undefined),
    [appSettings.cloudApiUrl, token]
  );

  async function refresh() {
    if (!appSettings.cloudApiUrl.trim() || !token.trim()) {
      setItems([]);
      setStatus("Connect Cloud & Server first.");
      return;
    }

    setStatus("Loading notifications...");

    try {
      const result = await api.notifications();
      setItems(result.notifications);
      setStatus(result.notifications.length + " notification" + (result.notifications.length === 1 ? "" : "s"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load notifications.");
    }
  }

  useEffect(() => {
    void refresh();
  }, [appSettings.cloudApiUrl, token]);

  async function markRead(item: AdminNotification) {
    if (item.read_at) return;

    try {
      await api.markNotificationRead(item.id);
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, read_at: new Date().toISOString() }
            : entry
        )
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not mark notification read.");
    }
  }

  const unread = items.filter((item) => !item.read_at).length;

  return (
    <section className="content notifications-screen">
      <div className="panel hero-panel">
        <div>
          <span className="eyebrow">NOTIFICATIONS</span>
          <h2>System, storage, export and Admin updates.</h2>
          <p>{status}</p>
        </div>
        <div className="hero-actions">
          <span className="pill">{unread} unread</span>
          <button className="secondary" onClick={() => void refresh()}>Refresh</button>
        </div>
      </div>

      <div className="notification-list">
        {items.length === 0 ? (
          <div className="panel empty-projects">No notifications.</div>
        ) : items.map((item) => (
          <button
            key={item.id}
            className={
              "notification-card " +
              item.level +
              (item.read_at ? " read" : " unread")
            }
            onClick={() => void markRead(item)}
          >
            <div>
              <strong>{item.title}</strong>
              <small>{new Date(item.created_at).toLocaleString()}</small>
            </div>
            <p>{item.body}</p>
            <span>{item.read_at ? "Read" : "Mark as read"}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
