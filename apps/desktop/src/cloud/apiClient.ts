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
}

export interface CloudAsset {
  id: string;
  project_id: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  created_at: string;
  variants: Record<string, {
    mime_type: string;
    width_px: number | null;
    height_px: number | null;
    size_bytes: number;
  }>;
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
    return this.request<{ ok: boolean; user: { id: number; email: string; name: string } }>("/api/v1/me");
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
      "X-Zaxis-Client": "desktop/0.1.0"
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

  async fetchAssetBlob(assetId: string, variant: "original" | "proxy" = "proxy") {
    const url =
      this.baseUrl.replace(/\/+$/, "") +
      "/api/v1/assets/" +
      encodeURIComponent(assetId) +
      "/content?variant=" +
      encodeURIComponent(variant);

    const headers: Record<string, string> = {
      "X-Zaxis-Client": "desktop/0.1.0"
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
      "X-Zaxis-Client": "desktop/0.1.0"
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

export function makeClientEventId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return "event-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}
