import type { ZaxisProject } from "@zaxis-kdp/editor-core";

export interface HealthResponse {
  ok: boolean;
  service: string;
  version: string;
  database: string;
  request_id?: string;
}

export interface CloudProjectSummary {
  id: string;
  name: string;
  mode: "kdp" | "graphic-design";
  current_revision: number | string;
  created_at: string;
  updated_at: string;
}

export interface CloudProjectResponse {
  ok: boolean;
  project: CloudProjectSummary;
  snapshot: ZaxisProject | null;
}

export interface SnapshotPushResponse {
  ok: boolean;
  revision: number;
  snapshot_hash?: string;
  idempotent_replay?: boolean;
  sync_mode?: "full" | "delta";
}

export interface ProjectDeltaPayload {
  version: 1;
  project: Partial<Pick<ZaxisProject, "name" | "mode" | "kdpSettings" | "bookStructure" | "masterPages" | "reusableStyles" | "reusableComponents" | "projectOverrides" | "updatedAt">>;
  changed_artboards: ZaxisProject["artboards"];
  removed_artboard_ids: string[];
  artboard_order: string[];
}

export interface CloudAsset {
  id: string;
  project_id: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  version: number;
  source_asset_id: string | null;
  process_kind: string | null;
  created_at: string;
  updated_at: string;
  variants: Record<string, {
    mime_type: string;
    width_px: number | null;
    height_px: number | null;
    size_bytes: number;
  }>;
}

export interface CloudShare {
  id: string;
  project_id: string | null;
  asset_id: string;
  slug: string;
  url: string;
  title: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  password_protected: boolean;
  expires_at: string | null;
  allow_download: boolean;
  proof_mode: boolean;
  revoked_at: string | null;
  replaced_at: string | null;
  active: boolean;
  views: number;
  downloads: number;
  comments: number;
  created_at: string;
  updated_at: string;
}

export interface ServerDiagnostics {
  php_version: string;
  database: string;
  storage_provider: string;
  storage_path: string;
  storage_exists: boolean;
  storage_writable: boolean;
  storage_free_bytes: number | null;
  storage_total_bytes: number | null;
  storage_used_bytes: number;
  user_storage_used_bytes: number;
  user_storage_quota_bytes: number;
  share_base_url: string;
  worker_url: string;
  worker_healthy: boolean | null;
  worker_error: string | null;
  max_upload_mb: number;
  gd_available: boolean;
  pdo_mysql_available: boolean;
  curl_available: boolean;
  zip_available: boolean;
  upload_max_filesize: string | null;
  post_max_size: string | null;
  backup_count: number;
  last_backup_at: string | null;
}

export interface AdminOverview {
  users: number;
  projects: number;
  assets: number;
  asset_bytes: number;
  recycle_items: number;
  active_shares: number;
  queued_exports: number;
  unread_notifications: number;
  backups: number;
}

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: "owner" | "admin" | "editor" | "reviewer";
  storage_quota_bytes: number;
  storage_used_bytes: number;
  project_count: number;
  created_at: string;
  updated_at: string;
}

export interface AdminSettings {
  feature_background_remove: boolean;
  feature_public_sharing: boolean;
  feature_proof_comments: boolean;
  feature_batch_processing: boolean;
  default_share_download: boolean;
  default_share_proof_mode: boolean;
  default_project_mode: "kdp" | "graphic-design";
  naming_project_pattern: string;
  naming_export_pattern: string;
  backup_enabled: boolean;
  backup_interval_hours: number;
  backup_retention_count: number;
  backup_include_assets: boolean;
  backup_secondary_provider: "none" | "local-path";
  backup_secondary_path: string;
  recycle_retention_days: number;
  worker_url_override: string;
}

export interface AdminActivity {
  id: number;
  action: string;
  subject_type: string | null;
  subject_id: string | null;
  details: unknown;
  user_id: number | null;
  user_name: string | null;
  user_email: string | null;
  created_at: string;
}

export interface AdminNotification {
  id: number;
  user_id: number | null;
  level: "info" | "warning" | "error" | "success";
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface AdminBackup {
  id: number;
  file_name: string;
  storage_path: string;
  secondary_path: string | null;
  size_bytes: number;
  status: "completed" | "failed";
  error_message: string | null;
  created_by: number | null;
  created_at: string;
}

export interface AdminExportJob {
  id: string;
  user_id: number;
  project_id: string | null;
  job_type: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  payload: unknown;
  result: unknown;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminRecycleBin {
  projects: Array<{
    id: string;
    owner_user_id: number | string;
    name: string;
    mode: string;
    deleted_at: string;
  }>;
  assets: Array<{
    id: string;
    owner_user_id: number | string;
    project_id: string | null;
    original_name: string;
    mime_type: string;
    size_bytes: number | string;
    deleted_at: string;
  }>;
}

export interface ProjectLockInfo {
  project_id: string;
  user_id: number | string;
  client_id: string;
  client_name: string;
  user_name?: string;
  acquired_at?: string;
  expires_at: string;
}

export class CloudApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: unknown
  ) {
    super(message);
  }
}

export class ZaxisCloudApi {
  private readonly clientId = getDesktopClientId();

  constructor(
    private readonly baseUrl: string,
    private readonly token?: string
  ) {}

  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>("/api/health", { auth: false });
  }

  async pair(connectionCode: string) {
    return this.request<{
      ok: boolean;
      token: string;
      user: { id: number; email: string; name: string };
    }>("/api/pair", {
      method: "POST",
      auth: false,
      body: { code: connectionCode }
    });
  }

  async createConnectionCode(label = "Windows Desktop") {
    return this.request<{
      ok: boolean;
      code: string;
      expires_at: string;
    }>("/api/v1/connection-codes", {
      method: "POST",
      body: { label }
    });
  }

  async me() {
    return this.request<{
      ok: boolean;
      user: {
        id: number;
        email: string;
        name: string;
        role: "owner" | "admin" | "editor" | "reviewer";
        storage_quota_bytes: number;
      };
    }>("/api/v1/me");
  }

  async diagnostics() {
    return this.request<{ ok: boolean; diagnostics: ServerDiagnostics }>("/api/v1/diagnostics");
  }

  async effectiveSettings(projectId?: string) {
    const query = projectId
      ? "?project_id=" + encodeURIComponent(projectId)
      : "";

    return this.request<{ ok: boolean; settings: AdminSettings }>(
      "/api/v1/effective-settings" + query
    );
  }

  async exportJobs() {
    return this.request<{ ok: boolean; jobs: AdminExportJob[] }>(
      "/api/v1/export-jobs"
    );
  }

  async createExportJob(input: {
    projectId?: string | null;
    jobType: string;
    payload?: Record<string, unknown>;
  }) {
    return this.request<{ ok: boolean; job: AdminExportJob }>(
      "/api/v1/export-jobs",
      {
        method: "POST",
        body: {
          project_id: input.projectId ?? null,
          job_type: input.jobType,
          payload: input.payload ?? {}
        }
      }
    );
  }

  async updateExportJob(
    jobId: string,
    input: {
      status: AdminExportJob["status"];
      result?: Record<string, unknown> | null;
      errorMessage?: string | null;
    }
  ) {
    return this.request<{ ok: boolean; job: AdminExportJob }>(
      "/api/v1/export-jobs/" + encodeURIComponent(jobId),
      {
        method: "PATCH",
        body: {
          status: input.status,
          result: input.result ?? null,
          error_message: input.errorMessage ?? null
        }
      }
    );
  }

  async adminOverview() {
    return this.request<{ ok: boolean; overview: AdminOverview }>("/api/v1/admin/overview");
  }

  async adminUsers() {
    return this.request<{ ok: boolean; users: AdminUser[] }>("/api/v1/admin/users");
  }

  async createAdminUser(input: {
    email: string;
    name: string;
    role: AdminUser["role"];
    storageQuotaBytes: number;
  }) {
    return this.request<{
      ok: boolean;
      user: AdminUser;
      connection_code: string;
      expires_at: string;
    }>("/api/v1/admin/users", {
      method: "POST",
      body: {
        email: input.email,
        name: input.name,
        role: input.role,
        storage_quota_bytes: input.storageQuotaBytes
      }
    });
  }

  async updateAdminUser(
    userId: number,
    input: Partial<Pick<AdminUser, "role" | "storage_quota_bytes">>
  ) {
    return this.request<{ ok: boolean; user: AdminUser }>(
      "/api/v1/admin/users/" + encodeURIComponent(String(userId)),
      { method: "PATCH", body: input }
    );
  }

  async adminSettings() {
    return this.request<{ ok: boolean; settings: AdminSettings }>("/api/v1/admin/settings");
  }

  async updateAdminSettings(input: Partial<AdminSettings>) {
    return this.request<{ ok: boolean; settings: AdminSettings }>("/api/v1/admin/settings", {
      method: "PATCH",
      body: input
    });
  }

  async adminActivity() {
    return this.request<{ ok: boolean; activity: AdminActivity[] }>("/api/v1/admin/activity");
  }

  async adminRecycleBin() {
    return this.request<{ ok: boolean; recycle_bin: AdminRecycleBin }>("/api/v1/admin/recycle-bin");
  }

  async restoreRecycleItem(type: "project" | "asset", id: string) {
    return this.request<{ ok: boolean; restored: boolean }>(
      "/api/v1/admin/recycle-bin/" +
        encodeURIComponent(type) +
        "/" +
        encodeURIComponent(id) +
        "/restore",
      { method: "POST" }
    );
  }

  async purgeRecycleItem(type: "project" | "asset", id: string) {
    return this.request<{ ok: boolean; purged: boolean }>(
      "/api/v1/admin/recycle-bin/" +
        encodeURIComponent(type) +
        "/" +
        encodeURIComponent(id),
      { method: "DELETE" }
    );
  }

  async adminNotifications() {
    return this.request<{ ok: boolean; notifications: AdminNotification[] }>(
      "/api/v1/admin/notifications"
    );
  }

  async createAdminNotification(input: {
    userId?: number | null;
    level?: AdminNotification["level"];
    title: string;
    body: string;
  }) {
    return this.request<{ ok: boolean }>("/api/v1/admin/notifications", {
      method: "POST",
      body: {
        user_id: input.userId ?? null,
        level: input.level ?? "info",
        title: input.title,
        body: input.body
      }
    });
  }

  async adminExportJobs() {
    return this.request<{ ok: boolean; jobs: AdminExportJob[] }>(
      "/api/v1/admin/export-jobs"
    );
  }

  async createAdminExportJob(input: {
    userId?: number;
    projectId?: string | null;
    jobType: string;
    payload?: Record<string, unknown>;
  }) {
    return this.request<{ ok: boolean; job: AdminExportJob }>(
      "/api/v1/admin/export-jobs",
      {
        method: "POST",
        body: {
          user_id: input.userId,
          project_id: input.projectId ?? null,
          job_type: input.jobType,
          payload: input.payload ?? {}
        }
      }
    );
  }

  async adminBackups() {
    return this.request<{ ok: boolean; backups: AdminBackup[] }>("/api/v1/admin/backups");
  }

  async createAdminBackup() {
    return this.request<{ ok: boolean; backup: AdminBackup }>("/api/v1/admin/backups", {
      method: "POST"
    });
  }

  async restoreAdminBackup(id: number) {
    return this.request<{
      ok: boolean;
      result: {
        backup_id: number;
        file_name: string;
        safety_backup: {
          file_name: string;
          path: string;
          secondary_path: string | null;
          size_bytes: number;
          created_at: string;
        };
        restored_tables: string[];
        assets_restored: boolean;
        reauth_required: boolean;
      };
    }>(
      "/api/v1/admin/backups/" + encodeURIComponent(String(id)) + "/restore",
      { method: "POST" }
    );
  }

  async adminRepair(action: "purge-expired-locks" | "purge-expired-pairing-codes" | "ensure-storage" | "purge-old-recycle") {
    return this.request<{ ok: boolean; result: Record<string, unknown> }>(
      "/api/v1/admin/repair",
      { method: "POST", body: { action } }
    );
  }

  async notifications() {
    return this.request<{ ok: boolean; notifications: AdminNotification[] }>("/api/v1/notifications");
  }

  async markNotificationRead(notificationId: number) {
    return this.request<{ ok: boolean; read: boolean }>(
      "/api/v1/notifications/" + encodeURIComponent(String(notificationId)) + "/read",
      { method: "POST" }
    );
  }

  async listProjects() {
    return this.request<{ ok: boolean; projects: CloudProjectSummary[] }>("/api/v1/projects");
  }

  async createProject(project: ZaxisProject) {
    return this.request<{ ok: boolean; project_id: string; revision: number }>("/api/v1/projects", {
      method: "POST",
      body: {
        id: project.id,
        name: project.name,
        mode: project.mode,
        snapshot: project
      }
    });
  }

  async getProject(projectId: string): Promise<CloudProjectResponse> {
    return this.request<CloudProjectResponse>("/api/v1/projects/" + encodeURIComponent(projectId));
  }

  async getProjectLock(projectId: string) {
    return this.request<{ ok: boolean; lock: ProjectLockInfo | null }>(
      "/api/v1/projects/" + encodeURIComponent(projectId) + "/lock"
    );
  }

  async acquireProjectLock(
    projectId: string,
    clientName = "Windows Desktop",
    ttlSeconds = 120
  ) {
    return this.request<{ ok: boolean; lock: ProjectLockInfo }>(
      "/api/v1/projects/" + encodeURIComponent(projectId) + "/lock",
      {
        method: "POST",
        body: {
          client_id: this.clientId,
          client_name: clientName,
          ttl_seconds: ttlSeconds
        }
      }
    );
  }

  async releaseProjectLock(projectId: string) {
    return this.request<{ ok: boolean; released: boolean }>(
      "/api/v1/projects/" + encodeURIComponent(projectId) + "/lock",
      {
        method: "DELETE",
        body: { client_id: this.clientId }
      }
    );
  }

  async pushSnapshot(
    project: ZaxisProject,
    baseRevision: number,
    clientEventId: string,
    label?: string
  ): Promise<SnapshotPushResponse> {
    return this.request<SnapshotPushResponse>(
      "/api/v1/projects/" + encodeURIComponent(project.id) + "/snapshot",
      {
        method: "PUT",
        body: {
          base_revision: baseRevision,
          client_event_id: clientEventId,
          label,
          snapshot: project
        }
      }
    );
  }

  async pushDelta(
    projectId: string,
    baseRevision: number,
    clientEventId: string,
    delta: ProjectDeltaPayload,
    label?: string
  ): Promise<SnapshotPushResponse> {
    return this.request<SnapshotPushResponse>(
      "/api/v1/projects/" + encodeURIComponent(projectId) + "/snapshot",
      {
        method: "PATCH",
        body: {
          base_revision: baseRevision,
          client_event_id: clientEventId,
          label,
          delta
        }
      }
    );
  }

  async revisions(projectId: string) {
    return this.request<{
      ok: boolean;
      revisions: Array<{
        revision_number: number | string;
        label: string | null;
        snapshot_hash: string;
        created_at: string;
      }>;
    }>("/api/v1/projects/" + encodeURIComponent(projectId) + "/revisions");
  }

  async getRevision(projectId: string, revisionNumber: number) {
    return this.request<{
      ok: boolean;
      revision: {
        revision_number: number;
        label: string | null;
        snapshot_hash: string;
        created_at: string;
      };
      snapshot: ZaxisProject;
    }>(
      "/api/v1/projects/" +
        encodeURIComponent(projectId) +
        "/revisions/" +
        encodeURIComponent(String(revisionNumber))
    );
  }

  async listAssets(projectId?: string) {
    const query = projectId ? "?project_id=" + encodeURIComponent(projectId) : "";
    return this.request<{ ok: boolean; assets: CloudAsset[] }>("/api/v1/assets" + query);
  }

  async uploadAsset(file: File, projectId?: string) {
    const form = new FormData();
    form.append("file", file);
    if (projectId) form.append("project_id", projectId);

    const url = this.baseUrl.replace(/\/+$/, "") + "/api/v1/assets";
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Zaxis-Client": "desktop/0.1.0",
      "X-Zaxis-Client-Id": this.clientId
    };

    if (this.token) {
      headers.Authorization = "Bearer " + this.token;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: form
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const serverMessage =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error?: unknown }).error ?? "")
          : "";

      throw new CloudApiError(
        serverMessage || "Asset upload failed with HTTP " + response.status,
        response.status,
        payload
      );
    }

    return payload as { ok: boolean; asset: CloudAsset };
  }

  async deleteAsset(assetId: string) {
    return this.request<{ ok: boolean; deleted: boolean }>(
      "/api/v1/assets/" + encodeURIComponent(assetId),
      { method: "DELETE" }
    );
  }

  async removeAssetBackgroundBatch(
    assetIds: string[],
    mode: "fast" | "quality" | "hair" = "quality",
    model = "birefnet-general"
  ) {
    return this.request<{
      ok: boolean;
      assets: CloudAsset[];
      failures: Array<{ asset_id: string; error: string }>;
    }>("/api/v1/assets/background-remove-batch", {
      method: "POST",
      body: {
        asset_ids: assetIds,
        mode,
        model
      }
    });
  }

  async upscaleAsset(
    assetId: string,
    scale: 2 | 4 = 2,
    cleanup = true
  ) {
    return this.request<{
      ok: boolean;
      asset: CloudAsset;
      source_asset_id: string;
      scale: number;
      cleanup: boolean;
    }>(
      "/api/v1/assets/" + encodeURIComponent(assetId) + "/upscale",
      {
        method: "POST",
        body: { scale, cleanup }
      }
    );
  }

  async removeAssetBackground(
    assetId: string,
    mode: "fast" | "quality" | "hair" = "quality",
    model = "birefnet-general"
  ) {
    return this.request<{
      ok: boolean;
      asset: CloudAsset;
      source_asset_id: string;
      mode: string;
      model: string;
    }>(
      "/api/v1/assets/" + encodeURIComponent(assetId) + "/background-remove",
      {
        method: "POST",
        body: { mode, model }
      }
    );
  }

  async replaceAssetContent(assetId: string, file: File) {
    const form = new FormData();
    form.append("file", file);

    const url =
      this.baseUrl.replace(/\/+$/, "") +
      "/api/v1/assets/" +
      encodeURIComponent(assetId) +
      "/replace";

    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Zaxis-Client": "desktop/0.1.0",
      "X-Zaxis-Client-Id": this.clientId
    };

    if (this.token) headers.Authorization = "Bearer " + this.token;

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: form
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error?: unknown }).error ?? "")
          : "";

      throw new CloudApiError(
        message || "Asset replacement failed with HTTP " + response.status,
        response.status,
        payload
      );
    }

    return payload as { ok: boolean; asset: CloudAsset };
  }

  async fetchAssetBlob(assetId: string, variant: "original" | "proxy" = "proxy") {
    const url =
      this.baseUrl.replace(/\/+$/, "") +
      "/api/v1/assets/" +
      encodeURIComponent(assetId) +
      "/content?variant=" +
      encodeURIComponent(variant);

    const headers: Record<string, string> = {
      "X-Zaxis-Client": "desktop/0.1.0",
      "X-Zaxis-Client-Id": this.clientId
    };

    if (this.token) {
      headers.Authorization = "Bearer " + this.token;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new CloudApiError("Asset download failed with HTTP " + response.status, response.status);
    }

    return response.blob();
  }

  async listShares(projectId?: string) {
    const query = projectId ? "?project_id=" + encodeURIComponent(projectId) : "";
    return this.request<{ ok: boolean; shares: CloudShare[] }>("/api/v1/shares" + query);
  }

  async createShare(input: {
    assetId: string;
    projectId?: string;
    title?: string;
    password?: string;
    expiresAt?: string | null;
    allowDownload?: boolean;
    proofMode?: boolean;
  }) {
    const body: Record<string, unknown> = {
      asset_id: input.assetId,
      project_id: input.projectId ?? null,
      title: input.title ?? "",
      password: input.password ?? "",
      expires_at: input.expiresAt ?? null
    };

    if (input.allowDownload !== undefined) {
      body.allow_download = input.allowDownload;
    }
    if (input.proofMode !== undefined) {
      body.proof_mode = input.proofMode;
    }

    return this.request<{ ok: boolean; share: CloudShare }>("/api/v1/shares", {
      method: "POST",
      body
    });
  }

  async updateShare(
    shareId: string,
    input: {
      title?: string;
      password?: string;
      expiresAt?: string | null;
      allowDownload?: boolean;
      proofMode?: boolean;
    }
  ) {
    const body: Record<string, unknown> = {};

    if (input.title !== undefined) body.title = input.title;
    if (input.password !== undefined) body.password = input.password;
    if (input.expiresAt !== undefined) body.expires_at = input.expiresAt;
    if (input.allowDownload !== undefined) body.allow_download = input.allowDownload;
    if (input.proofMode !== undefined) body.proof_mode = input.proofMode;

    return this.request<{ ok: boolean; share: CloudShare }>(
      "/api/v1/shares/" + encodeURIComponent(shareId),
      { method: "PATCH", body }
    );
  }

  async replaceShareAsset(shareId: string, assetId: string) {
    return this.request<{ ok: boolean; share: CloudShare }>(
      "/api/v1/shares/" + encodeURIComponent(shareId) + "/replace",
      {
        method: "POST",
        body: { asset_id: assetId }
      }
    );
  }

  async revokeShare(shareId: string) {
    return this.request<{ ok: boolean; revoked: boolean }>(
      "/api/v1/shares/" + encodeURIComponent(shareId),
      { method: "DELETE" }
    );
  }

  private async request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      auth?: boolean;
    } = {}
  ): Promise<T> {
    const url = this.baseUrl.replace(/\/+$/, "") + path;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Zaxis-Client": "desktop/0.1.0",
      "X-Zaxis-Client-Id": this.clientId
    };

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (options.auth !== false && this.token) {
      headers.Authorization = "Bearer " + this.token;
    }

    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });

    let payload: unknown = null;

    try {
      payload = await response.json();
    } catch {
      // Keep status/message if the server returned non-JSON.
    }

    if (!response.ok) {
      const serverMessage =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error?: unknown }).error ?? "")
          : "";

      throw new CloudApiError(
        serverMessage || "Cloud request failed with HTTP " + response.status,
        response.status,
        payload
      );
    }

    return payload as T;
  }
}

const CLIENT_ID_KEY = "zaxis-kdp:client-id";
let fallbackClientId = "";

export function getDesktopClientId() {
  try {
    let clientId = window.localStorage.getItem(CLIENT_ID_KEY);

    if (!clientId) {
      clientId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : "client-" + Date.now() + "-" + Math.random().toString(36).slice(2);

      window.localStorage.setItem(CLIENT_ID_KEY, clientId);
    }

    return clientId;
  } catch {
    if (!fallbackClientId) {
      fallbackClientId =
        "client-session-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    }

    return fallbackClientId;
  }
}

export function makeClientEventId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return "event-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}
