import { useEffect, useMemo, useState } from "react";
import {
  CloudApiError,
  ZaxisCloudApi,
  type AdminActivity,
  type AdminBackup,
  type AdminExportJob,
  type AdminNotification,
  type AdminOverview,
  type AdminRecycleBin,
  type AdminSettings,
  type AdminUser,
  type ServerDiagnostics
} from "../cloud/apiClient";
import type { AppSettings } from "../state/appSettings";

const emptySettings: AdminSettings = {
  feature_background_remove: true,
  feature_public_sharing: true,
  feature_proof_comments: true,
  feature_batch_processing: true,
  default_share_download: true,
  default_share_proof_mode: false,
  default_project_mode: "kdp",
  naming_project_pattern: "{name}",
  naming_export_pattern: "{project}-{date}",
  backup_enabled: true,
  backup_interval_hours: 24,
  backup_retention_count: 14,
  backup_include_assets: false,
  backup_secondary_provider: "none",
  backup_secondary_path: "",
  recycle_retention_days: 30,
  worker_url_override: ""
};

export function AdminScreen({
  appSettings,
  token
}: {
  appSettings: AppSettings;
  token: string;
}) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [settings, setSettings] = useState<AdminSettings>(emptySettings);
  const [backups, setBackups] = useState<AdminBackup[]>([]);
  const [recycle, setRecycle] = useState<AdminRecycleBin>({ projects: [], assets: [] });
  const [activity, setActivity] = useState<AdminActivity[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [jobs, setJobs] = useState<AdminExportJob[]>([]);
  const [diagnostics, setDiagnostics] = useState<ServerDiagnostics | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [notifyTitle, setNotifyTitle] = useState("");
  const [notifyBody, setNotifyBody] = useState("");
  const [notifyLevel, setNotifyLevel] = useState<AdminNotification["level"]>("info");
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AdminUser["role"]>("editor");
  const [inviteQuotaGb, setInviteQuotaGb] = useState(5);
  const [inviteCode, setInviteCode] = useState("");

  const api = useMemo(
    () => new ZaxisCloudApi(appSettings.cloudApiUrl.trim(), token.trim() || undefined),
    [appSettings.cloudApiUrl, token]
  );

  async function refreshAll() {
    if (!appSettings.cloudApiUrl.trim() || !token.trim()) {
      setStatus("Connect Cloud & Server first.");
      return;
    }

    setBusy(true);
    setStatus("Loading Admin data...");

    try {
      const [
        overviewResult,
        userResult,
        settingsResult,
        backupResult,
        recycleResult,
        activityResult,
        notificationResult,
        jobResult,
        diagnosticsResult
      ] = await Promise.all([
        api.adminOverview(),
        api.adminUsers(),
        api.adminSettings(),
        api.adminBackups(),
        api.adminRecycleBin(),
        api.adminActivity(),
        api.adminNotifications(),
        api.adminExportJobs(),
        api.diagnostics()
      ]);

      setOverview(overviewResult.overview);
      setUsers(userResult.users);
      setSettings(settingsResult.settings);
      setBackups(backupResult.backups);
      setRecycle(recycleResult.recycle_bin);
      setActivity(activityResult.activity);
      setNotifications(notificationResult.notifications);
      setJobs(jobResult.jobs);
      setDiagnostics(diagnosticsResult.diagnostics);
      setStatus("Admin data refreshed.");
    } catch (error) {
      if (error instanceof CloudApiError && error.status === 403) {
        setStatus("This account does not have Owner/Admin permission.");
      } else {
        setStatus(error instanceof Error ? error.message : "Could not load Admin data.");
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refreshAll();
  }, [appSettings.cloudApiUrl, token]);

  async function saveSettings() {
    setBusy(true);
    setStatus("Saving global Admin settings...");

    try {
      const result = await api.updateAdminSettings(settings);
      setSettings(result.settings);
      setStatus("Global defaults and feature settings saved.");
      await refreshAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save Admin settings.");
      setBusy(false);
    }
  }

  async function createUserInvite() {
    if (!inviteName.trim() || !inviteEmail.trim()) {
      setStatus("User name and email are required.");
      return;
    }

    setStatus("Creating user and connection code...");

    try {
      const result = await api.createAdminUser({
        name: inviteName.trim(),
        email: inviteEmail.trim(),
        role: inviteRole,
        storageQuotaBytes: Math.max(0, inviteQuotaGb) * 1073741824
      });
      setInviteCode(
        result.connection_code +
          " • expires " +
          new Date(result.expires_at).toLocaleString()
      );
      setInviteName("");
      setInviteEmail("");
      setStatus("User created. Share the one-time connection code securely.");
      await refreshAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create user.");
    }
  }

  async function updateUser(user: AdminUser, input: Partial<Pick<AdminUser, "role" | "storage_quota_bytes">>) {
    setStatus("Updating " + user.email + "...");

    try {
      await api.updateAdminUser(user.id, input);
      setStatus("User role/quota updated.");
      await refreshAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update user.");
    }
  }

  async function createBackup() {
    setBusy(true);
    setStatus("Creating server backup...");

    try {
      const result = await api.createAdminBackup();
      setStatus(
        "Backup created: " +
          result.backup.file_name +
          " • " +
          (result.backup.size_bytes / (1024 * 1024)).toFixed(2) +
          " MB"
      );
      await refreshAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Backup failed.");
      setBusy(false);
    }
  }

  async function repair(action: "purge-expired-locks" | "purge-expired-pairing-codes" | "ensure-storage" | "purge-old-recycle") {
    setStatus("Running repair: " + action + "...");

    try {
      const result = await api.adminRepair(action);
      setStatus("Repair complete: " + JSON.stringify(result.result));
      await refreshAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Repair failed.");
    }
  }

  async function restoreRecycle(type: "project" | "asset", id: string) {
    try {
      await api.restoreRecycleItem(type, id);
      setStatus(type + " restored from recycle bin.");
      await refreshAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Restore failed.");
    }
  }

  async function purgeRecycle(type: "project" | "asset", id: string) {
    if (!window.confirm("Permanently purge this " + type + "? This cannot be undone.")) return;

    try {
      await api.purgeRecycleItem(type, id);
      setStatus(type + " permanently purged.");
      await refreshAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Purge failed.");
    }
  }

  async function sendNotification() {
    if (!notifyTitle.trim() || !notifyBody.trim()) {
      setStatus("Notification title and body are required.");
      return;
    }

    try {
      await api.createAdminNotification({
        level: notifyLevel,
        title: notifyTitle.trim(),
        body: notifyBody.trim()
      });
      setNotifyTitle("");
      setNotifyBody("");
      setStatus("Global notification created.");
      await refreshAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create notification.");
    }
  }

  const usedPercent = (user: AdminUser) =>
    user.storage_quota_bytes > 0
      ? Math.min(100, (user.storage_used_bytes / user.storage_quota_bytes) * 100)
      : 0;

  return (
    <section className="content admin-screen">
      <div className="panel hero-panel">
        <div>
          <span className="eyebrow">PHASE 3 • ADMIN & SERVER</span>
          <h2>Production controls for users, storage, backups, features, recycle, logs and repair.</h2>
          <p>{status || "Owner/Admin controls are enforced by the server API."}</p>
        </div>
        <div className="hero-actions">
          <button className="secondary" disabled={busy} onClick={() => void refreshAll()}>
            {busy ? "Working..." : "Refresh Admin"}
          </button>
          <button className="primary" disabled={busy} onClick={() => void createBackup()}>
            Create Backup Now
          </button>
        </div>
      </div>

      {overview && (
        <div className="admin-metrics">
          <AdminMetric label="Users" value={overview.users} />
          <AdminMetric label="Projects" value={overview.projects} />
          <AdminMetric label="Assets" value={overview.assets} />
          <AdminMetric label="Storage" value={(overview.asset_bytes / (1024 * 1024)).toFixed(1) + " MB"} />
          <AdminMetric label="Active Shares" value={overview.active_shares} />
          <AdminMetric label="Recycle" value={overview.recycle_items} />
          <AdminMetric label="Export Queue" value={overview.queued_exports} />
          <AdminMetric label="Backups" value={overview.backups} />
        </div>
      )}

      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">USERS & QUOTAS</span>
            <h3>Roles / Permissions / Storage</h3>
          </div>
          <span className="pill">{users.length} users</span>
        </div>

        <div className="admin-invite">
          <div className="settings-grid">
            <label>Name
              <input value={inviteName} onChange={(event) => setInviteName(event.target.value)} />
            </label>
            <label>Email
              <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
            </label>
            <label>Role
              <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as AdminUser["role"])}>
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="reviewer">Reviewer</option>
              </select>
            </label>
            <label>Quota GB
              <input type="number" min="0" step="0.5" value={inviteQuotaGb} onChange={(event) => setInviteQuotaGb(Number(event.target.value))} />
            </label>
          </div>
          <div className="hero-actions">
            <button className="primary" onClick={() => void createUserInvite()}>Create User & Connection Code</button>
          </div>
          {inviteCode && <p className="connection-code-output">{inviteCode}</p>}
        </div>

        <div className="admin-table">
          {users.map((user) => (
            <div className="admin-user-row" key={user.id}>
              <div>
                <strong>{user.name}</strong>
                <small>{user.email} • {user.project_count} projects</small>
              </div>

              <label>Role
                <select
                  value={user.role}
                  onChange={(event) =>
                    void updateUser(user, {
                      role: event.target.value as AdminUser["role"]
                    })
                  }
                >
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="reviewer">Reviewer</option>
                </select>
              </label>

              <label>Quota GB
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={Math.round((user.storage_quota_bytes / 1073741824) * 100) / 100}
                  onChange={(event) =>
                    void updateUser(user, {
                      storage_quota_bytes: Math.max(0, Number(event.target.value)) * 1073741824
                    })
                  }
                />
              </label>

              <div className="quota-meter">
                <span style={{ width: usedPercent(user) + "%" }} />
                <small>
                  {(user.storage_used_bytes / (1024 * 1024)).toFixed(1)} MB /{" "}
                  {(user.storage_quota_bytes / (1024 * 1024)).toFixed(1)} MB
                </small>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">FEATURES & GLOBAL DEFAULTS</span>
            <h3>Server Configuration</h3>
          </div>
          <button className="primary" disabled={busy} onClick={() => void saveSettings()}>
            Save Global Settings
          </button>
        </div>

        <div className="settings-grid">
          <Toggle label="Background Remover" checked={settings.feature_background_remove} onChange={(value) => setSettings({ ...settings, feature_background_remove: value })} />
          <Toggle label="Public Sharing" checked={settings.feature_public_sharing} onChange={(value) => setSettings({ ...settings, feature_public_sharing: value })} />
          <Toggle label="Proof Comments" checked={settings.feature_proof_comments} onChange={(value) => setSettings({ ...settings, feature_proof_comments: value })} />
          <Toggle label="Batch Processing" checked={settings.feature_batch_processing} onChange={(value) => setSettings({ ...settings, feature_batch_processing: value })} />
          <Toggle label="Default Share Download" checked={settings.default_share_download} onChange={(value) => setSettings({ ...settings, default_share_download: value })} />
          <Toggle label="Default Share Proof Mode" checked={settings.default_share_proof_mode} onChange={(value) => setSettings({ ...settings, default_share_proof_mode: value })} />

          <label>Default Project Mode
            <select
              value={settings.default_project_mode}
              onChange={(event) => setSettings({
                ...settings,
                default_project_mode: event.target.value as AdminSettings["default_project_mode"]
              })}
            >
              <option value="kdp">KDP / Book</option>
              <option value="graphic-design">Graphic Design</option>
            </select>
          </label>

          <label>Project Naming
            <input
              value={settings.naming_project_pattern}
              onChange={(event) => setSettings({ ...settings, naming_project_pattern: event.target.value })}
            />
          </label>

          <label>Export Naming
            <input
              value={settings.naming_export_pattern}
              onChange={(event) => setSettings({ ...settings, naming_export_pattern: event.target.value })}
            />
          </label>

          <label>Recycle Retention Days
            <input
              type="number"
              min="1"
              max="365"
              value={settings.recycle_retention_days}
              onChange={(event) => setSettings({ ...settings, recycle_retention_days: Number(event.target.value) })}
            />
          </label>
          <label>Image Worker URL
            <input
              value={settings.worker_url_override}
              onChange={(event) => setSettings({
                ...settings,
                worker_url_override: event.target.value
              })}
              placeholder="Inherit WORKER_URL from server .env"
            />
          </label>
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">BACKUPS</span>
            <h3>Schedule / Retention / Secondary Copy</h3>
          </div>
          <span className="pill">{backups.length} records</span>
        </div>

        <div className="settings-grid">
          <Toggle label="Scheduled Backups" checked={settings.backup_enabled} onChange={(value) => setSettings({ ...settings, backup_enabled: value })} />
          <Toggle label="Include Asset Binaries" checked={settings.backup_include_assets} onChange={(value) => setSettings({ ...settings, backup_include_assets: value })} />
          <label>Interval Hours
            <input
              type="number"
              min="1"
              value={settings.backup_interval_hours}
              onChange={(event) => setSettings({ ...settings, backup_interval_hours: Number(event.target.value) })}
            />
          </label>
          <label>Retention Count
            <input
              type="number"
              min="1"
              value={settings.backup_retention_count}
              onChange={(event) => setSettings({ ...settings, backup_retention_count: Number(event.target.value) })}
            />
          </label>
          <label>Secondary Provider
            <select
              value={settings.backup_secondary_provider}
              onChange={(event) => setSettings({
                ...settings,
                backup_secondary_provider: event.target.value as AdminSettings["backup_secondary_provider"]
              })}
            >
              <option value="none">None</option>
              <option value="local-path">Local / Mounted Path</option>
            </select>
          </label>
          <label>Secondary Backup Path
            <input
              value={settings.backup_secondary_path}
              onChange={(event) => setSettings({ ...settings, backup_secondary_path: event.target.value })}
              placeholder="/home/account/secondary-backups"
            />
          </label>
        </div>

        <div className="admin-list">
          {backups.slice(0, 15).map((backup) => (
            <div key={backup.id} className={"admin-list-row " + backup.status}>
              <div>
                <strong>{backup.file_name}</strong>
                <small>{new Date(backup.created_at).toLocaleString()}</small>
              </div>
              <span>{(backup.size_bytes / (1024 * 1024)).toFixed(2)} MB</span>
              <span>{backup.secondary_path ? "Secondary copy ✓" : "Primary only"}</span>
              <span>{backup.status}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">SERVER / STORAGE / WORKER</span>
            <h3>Deep Diagnostics</h3>
          </div>
        </div>

        {diagnostics ? (
          <div className="admin-diagnostics-grid">
            <AdminMetric label="Database" value={diagnostics.database} />
            <AdminMetric label="PHP" value={diagnostics.php_version} />
            <AdminMetric label="Storage Used" value={(diagnostics.storage_used_bytes / (1024 * 1024)).toFixed(1) + " MB"} />
            <AdminMetric label="Storage Free" value={diagnostics.storage_free_bytes === null ? "Unknown" : (diagnostics.storage_free_bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB"} />
            <AdminMetric label="My Quota" value={diagnostics.user_storage_quota_bytes > 0 ? (diagnostics.user_storage_quota_bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB" : "Unlimited"} />
            <AdminMetric label="Worker" value={diagnostics.worker_url ? (diagnostics.worker_healthy === true ? "Healthy" : diagnostics.worker_healthy === false ? "Error" : "Configured") : "Not configured"} />
            <AdminMetric label="ZIP Backups" value={diagnostics.zip_available ? "Ready" : "Missing"} />
            <AdminMetric label="cURL" value={diagnostics.curl_available ? "Ready" : "Missing"} />
            <AdminMetric label="GD Proxy" value={diagnostics.gd_available ? "Ready" : "Missing"} />
            <AdminMetric label="Backups" value={diagnostics.backup_count} />
          </div>
        ) : (
          <p className="muted">Diagnostics not loaded.</p>
        )}

        {diagnostics?.worker_error && (
          <p className="admin-diagnostic-error">{diagnostics.worker_error}</p>
        )}
        {diagnostics?.last_backup_at && (
          <p className="muted">Last successful backup: {new Date(diagnostics.last_backup_at).toLocaleString()}</p>
        )}
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">REPAIR TOOLS</span>
            <h3>Server Maintenance</h3>
          </div>
        </div>
        <div className="hero-actions">
          <button className="secondary" onClick={() => void repair("ensure-storage")}>Repair Storage</button>
          <button className="secondary" onClick={() => void repair("purge-expired-locks")}>Purge Expired Locks</button>
          <button className="secondary" onClick={() => void repair("purge-expired-pairing-codes")}>Purge Pairing Codes</button>
          <button className="secondary" onClick={() => void repair("purge-old-recycle")}>Purge Old Recycle</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">RECYCLE BIN</span>
            <h3>Restore / Permanent Purge</h3>
          </div>
          <span className="pill">{recycle.projects.length + recycle.assets.length} items</span>
        </div>
        <div className="admin-list">
          {recycle.projects.map((item) => (
            <div className="admin-list-row" key={"project-" + item.id}>
              <div><strong>{item.name}</strong><small>Project • {item.deleted_at}</small></div>
              <button className="secondary" onClick={() => void restoreRecycle("project", item.id)}>Restore</button>
              <button className="secondary danger" onClick={() => void purgeRecycle("project", item.id)}>Purge</button>
            </div>
          ))}
          {recycle.assets.map((item) => (
            <div className="admin-list-row" key={"asset-" + item.id}>
              <div><strong>{item.original_name}</strong><small>Asset • {item.deleted_at}</small></div>
              <button className="secondary" onClick={() => void restoreRecycle("asset", item.id)}>Restore</button>
              <button className="secondary danger" onClick={() => void purgeRecycle("asset", item.id)}>Purge</button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">NOTIFICATIONS</span>
            <h3>Create System Notification</h3>
          </div>
          <span className="pill">{notifications.filter((item) => !item.read_at).length} unread</span>
        </div>
        <div className="settings-grid">
          <label>Level
            <select value={notifyLevel} onChange={(event) => setNotifyLevel(event.target.value as AdminNotification["level"])}>
              <option value="info">Info</option>
              <option value="success">Success</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </select>
          </label>
          <label>Title
            <input value={notifyTitle} onChange={(event) => setNotifyTitle(event.target.value)} />
          </label>
          <label className="admin-wide">Body
            <textarea value={notifyBody} onChange={(event) => setNotifyBody(event.target.value)} />
          </label>
        </div>
        <button className="primary" onClick={() => void sendNotification()}>Send Global Notification</button>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">EXPORT QUEUE</span>
            <h3>Production Jobs</h3>
          </div>
          <span className="pill">{jobs.length} jobs</span>
        </div>
        <div className="admin-list">
          {jobs.slice(0, 30).map((job) => (
            <div className="admin-list-row" key={job.id}>
              <div><strong>{job.job_type}</strong><small>{job.project_id ?? "No project"} • {new Date(job.created_at).toLocaleString()}</small></div>
              <span>{job.status}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">ACTIVITY LOG</span>
            <h3>Latest Server Activity</h3>
          </div>
          <span className="pill">{activity.length} entries</span>
        </div>
        <div className="admin-list activity-list">
          {activity.slice(0, 100).map((item) => (
            <div className="admin-list-row" key={item.id}>
              <div>
                <strong>{item.action}</strong>
                <small>{item.user_name ?? "System"} • {new Date(item.created_at).toLocaleString()}</small>
              </div>
              <span>{item.subject_type ?? ""} {item.subject_id ?? ""}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AdminMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="admin-metric">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle-setting">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
