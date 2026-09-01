export function normalizeBaseURL(raw: string): string {
  const value = raw.trim().replace(/\/+$/, "");
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch { return value; }
}

export interface ProfileView {
  profileId: string;
  providerId: string;
  provider: string;
  baseURL: string;
  model: string;
  apiFormat: "openai" | "anthropic";
  temperature: number;
  maxTokens: number;
  thinking: boolean;
  hasApiKey: boolean;
  apiKeyMasked?: string;
}

export interface SettingsView { activeProfileId: string; active: ProfileView; profiles: ProfileView[]; }

export const customProfileId = (baseURL: string) => `custom:${normalizeBaseURL(baseURL)}`;
export const profileFor = (profiles: ProfileView[], profileId: string) => profiles.find((p) => p.profileId === profileId);
