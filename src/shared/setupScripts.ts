import type { SetupDownloadUrls } from "../types";

export const setupPaths = {
  windows: "/setup/windows.ps1",
  macos: "/setup/macos.sh",
};

const scriptRevision = "50e01ca1835d6bf74e2f206255867aea0f086a91";
const githubSource = `https://raw.githubusercontent.com/sanjaykshebbar/WallpaperWizard/${scriptRevision}/public`;

export const setupSourceUrls: SetupDownloadUrls = {
  windows: githubSource + setupPaths.windows,
  macos: githubSource + setupPaths.macos,
};

export function setupDownloadUrls(baseUrl?: string): SetupDownloadUrls {
  if (!baseUrl?.trim()) return setupPaths;

  const invalid = "WW_SETUP_BASE_URL must be an HTTP or HTTPS origin, such as https://setup.example.com.";
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new Error(invalid);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.href !== `${url.origin}/`) {
    throw new Error(invalid);
  }

  return {
    windows: url.origin + setupPaths.windows,
    macos: url.origin + setupPaths.macos,
  };
}
