/**
 * Agentless device discovery and wallpaper push over SSH.
 *
 * Windows: OpenSSH Server (built into Windows 10/11, enable via Settings or GPO).
 * macOS:   Remote Login (System Settings > General > Sharing).
 * Nothing is installed on the device except the wallpaper image and, on
 * Windows, a scheduled task that applies it in the signed-in user's session.
 */

import net from "net";
import crypto from "crypto";
import { Client } from "ssh2";
import { deviceIdFromDigest, isMacBook, type ManagedDeviceOs } from "./src/shared/deviceDiscovery";

export interface Credentials {
  username: string;
  password: string;
}

const CONNECT_TIMEOUT_MS = 10_000;

/** Reads the SSH identification banner (e.g. "SSH-2.0-OpenSSH_for_Windows_9.5"), or null if port 22 is closed. */
export function probeBanner(ip: string, timeoutMs = 1500, port = 22): Promise<string | null> {
  return new Promise(resolve => {
    const socket = net.connect({ host: ip, port });
    let buf = "";
    const done = (value: string | null) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs, () => done(null));
    socket.on("error", () => done(null));
    socket.on("close", () => resolve(null));
    socket.on("data", chunk => {
      buf += chunk.toString("latin1");
      const line = buf.split(/\r?\n/).slice(0, -1).find(l => l.startsWith("SSH-"));
      if (line) done(line.trim().slice(0, 200));
      else if (buf.length > 4096) done(null);
    });
  });
}

function fingerprint(key: Buffer): { id: string; sha256: string } {
  const digest = crypto.createHash("sha256").update(key).digest();
  return { id: deviceIdFromDigest(digest), sha256: `SHA256:${digest.toString("base64").replace(/=+$/, "")}` };
}

/** Completes the SSH key exchange only (no login, no password sent) to learn the host-key fingerprint. */
export function fetchHostFingerprint(ip: string): Promise<ReturnType<typeof fingerprint> | null> {
  return new Promise(resolve => {
    const client = new Client();
    let fp: ReturnType<typeof fingerprint> | null = null;
    const finish = () => {
      client.end();
      resolve(fp);
    };
    client.on("error", finish);
    client.on("close", finish);
    client.connect({
      host: ip,
      port: 22,
      username: "wallpaperwizard-probe",
      readyTimeout: CONNECT_TIMEOUT_MS,
      hostVerifier: (key: Buffer) => {
        fp = fingerprint(key);
        return false; // abort before authentication
      }
    });
  });
}

/**
 * Opens an authenticated session, refusing any host whose key does not match
 * the pinned fingerprint, so the password is never sent to an impostor.
 */
function connect(ip: string, expectedFp: string, creds: Credentials): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let keyMismatch = false;
    client.on("ready", () => resolve(client));
    client.on("error", err =>
      reject(keyMismatch ? new Error("Host key changed since discovery; remove the device and rescan to trust it again.") : err)
    );
    client.on("keyboard-interactive", (_name, _instr, _lang, prompts, reply) => reply(prompts.map(() => creds.password)));
    client.connect({
      host: ip,
      port: 22,
      username: creds.username,
      password: creds.password,
      tryKeyboard: true, // macOS sshd often offers keyboard-interactive instead of password
      readyTimeout: CONNECT_TIMEOUT_MS,
      hostVerifier: (key: Buffer) => {
        keyMismatch = fingerprint(key).sha256 !== expectedFp;
        return !keyMismatch;
      }
    });
  });
}

function exec(client: Client, command: string, stdin?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = "";
      let stderr = "";
      stream.on("data", (d: Buffer) => (stdout += d.toString()));
      stream.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
      stream.on("close", (code: number) => resolve({ code: code ?? 0, stdout: stdout.trim(), stderr: stderr.trim() }));
      if (stdin !== undefined) stream.end(stdin);
    });
  });
}

function upload(client: Client, remotePath: string, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.writeFile(remotePath, data, writeErr => {
        sftp.end();
        writeErr ? reject(writeErr) : resolve();
      });
    });
  });
}

/** Runs a PowerShell script without any quoting issues, whichever shell sshd launches (cmd or PowerShell). */
function powershell(script: string): string {
  return `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${Buffer.from(script, "utf16le").toString("base64")}`;
}

const WIN_DIR = "C:\\ProgramData\\WallpaperWizard";
const MAC_DIR = "/Users/Shared/WallpaperWizard";

export function windowsApplyScript(imagePath: string): string {
  // The task runs as whoever is signed in (BUILTIN\Users, S-1-5-32-545), at once and at every logon,
  // because wallpaper is per-user and an SSH session cannot reach the user's desktop directly.
  return `$ErrorActionPreference = 'Stop'
$setter = '${WIN_DIR}\\set-wallpaper.ps1'
@'
Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class WWSpi { [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int SystemParametersInfo(int a, int b, string c, int d); }'
Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name WallpaperStyle -Value '10'
Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name TileWallpaper -Value '0'
[WWSpi]::SystemParametersInfo(20, 0, '${imagePath}', 3) | Out-Null
'@ | Set-Content -Path $setter -Encoding UTF8
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \`"$setter\`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -GroupId 'S-1-5-32-545' -RunLevel Limited
Register-ScheduledTask -TaskName 'WallpaperWizard' -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName 'WallpaperWizard'
$user = (Get-CimInstance Win32_ComputerSystem).UserName
if ($user) { "APPLIED:$user" } else { 'PENDING_LOGON' }`;
}

export function macApplyScript(imagePath: string): string {
  // Wallpaper belongs to the console user; launchctl asuser needs root, hence sudo (password on stdin).
  return `U=$(stat -f %Su /dev/console)
if [ -z "$U" ] || [ "$U" = root ] || [ "$U" = loginwindow ]; then echo PENDING_LOGON; exit 0; fi
sudo -S -p '' launchctl asuser "$(id -u "$U")" sudo -u "$U" osascript -e 'tell application "System Events" to tell every desktop to set picture to POSIX file "${imagePath}"' && echo "APPLIED:$U"`;
}

export interface PushResult {
  ok: boolean;
  applied: boolean; // true when the wallpaper is set now or guaranteed at next sign-in
  os: "windows" | "macos" | "other";
  hostname: string | null;
  message: string;
}

/**
 * Connects, identifies the OS, uploads the image and applies it.
 * `image.name` must be a safe file name (it is embedded in remote scripts).
 */
export async function pushWallpaper(
  ip: string,
  expectedFp: string,
  creds: Credentials,
  image: { name: string; data: Buffer },
  expectedOs: ManagedDeviceOs
): Promise<PushResult> {
  if (!/^[a-zA-Z0-9._-]+$/.test(image.name)) throw new Error("Unsafe wallpaper file name.");
  const client = await connect(ip, expectedFp, creds);
  try {
    const hostname = (await exec(client, "hostname")).stdout.split(/\r?\n/)[0] || null;
    // `uname` exists on macOS; on Windows it fails in both cmd and PowerShell
    const uname = (await exec(client, "uname -s")).stdout;
    const os = uname === "Darwin" ? "macos" : (await exec(client, powershell("$env:OS"))).stdout === "Windows_NT" ? "windows" : "other";

    if (os !== expectedOs) {
      return { ok: false, applied: false, os: "other", hostname, message: "Device OS differs from its discovery record." };
    }

    if (os === "windows") {
      const imagePath = `${WIN_DIR}\\${image.name}`;
      // Fresh file name per version: Windows and macOS both cache a reused path
      await exec(client, powershell(`New-Item -ItemType Directory -Force -Path '${WIN_DIR}' | Out-Null; Remove-Item -Path '${WIN_DIR}\\wallpaper-*' -ErrorAction SilentlyContinue`));
      await upload(client, `/C:/ProgramData/WallpaperWizard/${image.name}`, image.data);
      const res = await exec(client, powershell(windowsApplyScript(imagePath)));
      if (res.code !== 0 || !/APPLIED|PENDING_LOGON/.test(res.stdout)) {
        return { ok: false, applied: false, os, hostname, message: (res.stderr || res.stdout || `exit code ${res.code}`).slice(0, 300) };
      }
      return res.stdout.includes("PENDING_LOGON")
        ? { ok: true, applied: true, os, hostname, message: "No one signed in; applies at next sign-in." }
        : { ok: true, applied: true, os, hostname, message: `Applied for ${res.stdout.split("APPLIED:")[1]}` };
    }

    if (os === "macos") {
      const model = await exec(client, `/usr/sbin/system_profiler SPHardwareDataType -xml | /usr/bin/xmllint --nonet --xpath 'string((//key[.="machine_name"]/following-sibling::string[1])[1])' -`);
      if (model.code !== 0 || !model.stdout) throw new Error("Could not read the Mac hardware model.");
      if (!isMacBook(model.stdout)) {
        return { ok: false, applied: false, os: "other", hostname, message: "Device hardware model is outside the MacBook family." };
      }
      const imagePath = `${MAC_DIR}/${image.name}`;
      await exec(client, `mkdir -p ${MAC_DIR} && chmod 755 ${MAC_DIR} && rm -f ${MAC_DIR}/wallpaper-*`);
      await upload(client, imagePath, image.data);
      await exec(client, `chmod 644 ${imagePath}`);
      const res = await exec(client, macApplyScript(imagePath), creds.password + "\n");
      if (res.stdout.includes("PENDING_LOGON")) {
        // shortcut: macOS has no logon hook without an agent/profile, so we retry each cycle until someone signs in
        return { ok: true, applied: false, os, hostname, message: "No one signed in; will retry next cycle." };
      }
      if (res.code !== 0 || !res.stdout.includes("APPLIED")) {
        return { ok: false, applied: false, os, hostname, message: (res.stderr || res.stdout || `exit code ${res.code}`).slice(0, 300) };
      }
      return { ok: true, applied: true, os, hostname, message: `Applied for ${res.stdout.split("APPLIED:")[1]}` };
    }
  } finally {
    client.end();
  }
}

/** Runs `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}
