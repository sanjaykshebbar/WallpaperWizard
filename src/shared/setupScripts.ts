import type { SetupDownloadUrls } from "../types";

const revision = "10b5596fdf1923416f7656e75effc2eb9ba018e6";
const source = `https://raw.githubusercontent.com/sanjaykshebbar/lazy-code/${revision}`;

export const setupPaths = {
  windows: "/setup/windows.ps1",
  macos: "/setup/macos.sh",
};

export const setupSourceUrls: SetupDownloadUrls = {
  windows: `${source}/Windows/setup-wallpaperwizard.ps1`,
  macos: `${source}/macOS/setup-wallpaperwizard.sh`,
};

export function setupDownloadUrls(baseUrl?: string): SetupDownloadUrls {
  if (!baseUrl?.trim()) return setupSourceUrls;

  const invalid = "WW_SETUP_BASE_URL must be an HTTPS origin, such as https://setup.example.com.";
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new Error(invalid);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.href !== `${url.origin}/`) {
    throw new Error(invalid);
  }

  return {
    windows: url.origin + setupPaths.windows,
    macos: url.origin + setupPaths.macos,
  };
}
