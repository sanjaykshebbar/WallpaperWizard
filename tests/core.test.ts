import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import net from "net";
import ssh2 from "ssh2";
import { resolveWallpaper } from "../src/shared/resolveWallpaper";
import { expandScanRange } from "../src/shared/ipMatch";
import { probeBanner, fetchHostFingerprint, pushWallpaper } from "../devicePush";
import { bannerOs, hasPinnedKey, isMacBook } from "../src/shared/deviceDiscovery";
import { setupDownloadUrls, setupSourceUrls, pickLanIp } from "../src/shared/setupScripts";

test("setup commands expose only WallpaperWizard routes", () => {
  assert.deepEqual(setupDownloadUrls(), {
    windows: "/setup/windows.ps1",
    macos: "/setup/macos.sh",
  });
  assert.match(setupSourceUrls.windows, /^https:\/\/raw\.githubusercontent\.com\/sanjaykshebbar\/WallpaperWizard\/[a-f0-9]{40}\/public\/setup\/windows\.ps1$/);
  assert.match(setupSourceUrls.macos, /^https:\/\/raw\.githubusercontent\.com\/sanjaykshebbar\/WallpaperWizard\/[a-f0-9]{40}\/public\/setup\/macos\.sh$/);
  assert.deepEqual(setupDownloadUrls("https://setup.example.test/"), {
    windows: "https://setup.example.test/setup/windows.ps1",
    macos: "https://setup.example.test/setup/macos.sh",
  });
  assert.equal(setupDownloadUrls("http://192.0.2.5:3000").macos, "http://192.0.2.5:3000/setup/macos.sh");
  assert.throws(() => setupDownloadUrls("ftp://setup.example.test"), /HTTP or HTTPS origin/);
  assert.throws(() => setupDownloadUrls("https://setup.example.test/path"), /HTTP or HTTPS origin/);
  assert.throws(() => setupDownloadUrls("https://user@setup.example.test"), /HTTP or HTTPS origin/);
});

test("pickLanIp returns the first non-internal IPv4, skipping loopback and IPv6", () => {
  assert.equal(pickLanIp({
    lo0: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
    en0: [{ family: "IPv6", internal: false, address: "fe80::1" }, { family: "IPv4", internal: false, address: "192.168.1.42" }]
  }), "192.168.1.42");
  assert.equal(pickLanIp({ en0: [{ family: 4, internal: false, address: "10.0.0.5" }] }), "10.0.0.5"); // numeric family (older Node)
  assert.equal(pickLanIp({ lo0: [{ family: "IPv4", internal: true, address: "127.0.0.1" }] }), null);
  assert.equal(pickLanIp({}), null);
});

const wp = (id: string, scope: "org" | "group" | "device", target: string | null, extra: object = {}) => ({
  id, scope, target, isActive: true, scheduledStart: null, scheduledEnd: null, updatedAt: "2026-01-01T00:00:00.000Z", ...extra
});

test("device beats group beats org; inactive and out-of-window never win", () => {
  const now = new Date("2026-06-01T12:00:00Z");
  const all = [
    wp("org", "org", null),
    wp("sales", "group", "Sales"),
    wp("mine", "device", "dev1"),
    wp("off", "device", "dev2", { isActive: false }),
    wp("future", "group", "Lobby", { scheduledStart: "2027-01-01T00:00:00Z" })
  ];
  assert.equal(resolveWallpaper(all, { id: "dev1", group: "Sales" }, now)?.id, "mine");
  assert.equal(resolveWallpaper(all, { id: "dev9", group: "Sales" }, now)?.id, "sales");
  assert.equal(resolveWallpaper(all, { id: "dev2", group: null }, now)?.id, "org");
  assert.equal(resolveWallpaper(all, { id: "dev3", group: "Lobby" }, now)?.id, "org");
  assert.equal(resolveWallpaper([], { id: "dev1", group: null }, now), null);
});

test("newest wallpaper wins among the same scope", () => {
  const all = [wp("old", "org", null), wp("new", "org", null, { updatedAt: "2026-02-01T00:00:00.000Z" })];
  assert.equal(resolveWallpaper(all, { id: "x", group: null })?.id, "new");
});

test("scan ranges expand to hosts and reject oversized/invalid input", () => {
  assert.deepEqual(expandScanRange("10.0.0.5"), ["10.0.0.5"]);
  assert.deepEqual(expandScanRange("192.168.1.0/30"), ["192.168.1.1", "192.168.1.2"]);
  assert.equal(expandScanRange("192.168.1.77/24")?.length, 254);
  assert.equal(expandScanRange("10.0.0.0/20")?.length, 4094);
  assert.equal(expandScanRange("10.0.0.0/19"), null);
  assert.equal(expandScanRange("not-an-ip"), null);
});

test("OS from the SSH banner ident: Windows is reliable, everything else is 'other' until a push confirms it", () => {
  assert.equal(bannerOs("SSH-2.0-OpenSSH_for_Windows_9.5"), "windows");
  assert.equal(bannerOs("SSH-2.0-OpenSSH_10.3"), "other"); // macOS and Linux look the same here
  assert.equal(bannerOs("SSH-2.0-OpenSSH_10.5"), "other");
  assert.equal(bannerOs("SSH-2.0-Go"), "other");
});

test("the device list and push targets require a pinned host key, nothing more", () => {
  const sshFingerprint = "SHA256:" + "A".repeat(43);
  assert.equal(hasPinnedKey({ sshFingerprint }), true);
  assert.equal(hasPinnedKey({ sshFingerprint: "" }), false);
  assert.equal(hasPinnedKey({}), false);
});

test("only MacBook hardware models qualify for macOS wallpaper pushes", () => {
  for (const model of ["MacBook", "MacBook Air", "MacBook Pro", "MacBook Neo"]) {
    assert.equal(isMacBook(model), true);
  }
  for (const model of ["Mac mini", "Mac Studio", "iMac", "Mac Pro", "MacBookish"]) {
    assert.equal(isMacBook(model), false);
  }
});

test("probeBanner reads the full SSH ident line and returns null for closed ports", async () => {
  const server = net.createServer(s => {
    s.write("SSH-2.0-OpenSSH_");
    setTimeout(() => s.end("for_Windows_9.5\r\n"), 25);
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as net.AddressInfo).port;
  assert.equal(await probeBanner("127.0.0.1", 1000, port), "SSH-2.0-OpenSSH_for_Windows_9.5");
  server.close();
  assert.equal(await probeBanner("127.0.0.1", 300, port), null);
});

test("host-key pinning: fingerprint is learned without auth, and a mismatched host never receives the password", async () => {
  const { private: hostKey } = ssh2.utils.generateKeyPairSync("ed25519");
  const passwordsSeen: Array<{ username: string; password: string }> = [];
  const server = new ssh2.Server({ hostKeys: [hostKey] }, client => {
    client.on("authentication", ctx => {
      if (ctx.method === "password") passwordsSeen.push({ username: ctx.username, password: ctx.password });
      ctx.reject();
    });
    client.on("error", () => {});
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as net.AddressInfo).port;

  const parsed = ssh2.utils.parseKey(hostKey);
  const digest = createHash("sha256").update((Array.isArray(parsed) ? parsed[0] : parsed as any).getPublicSSH()).digest();
  const expected = { id: digest.toString("hex").slice(0, 32), sha256: `SHA256:${digest.toString("base64").replace(/=+$/, "")}` };

  // Both helpers use port 22; route them to our test server
  const realConnect = (ssh2.Client.prototype as any).connect;
  (ssh2.Client.prototype as any).connect = function (cfg: any) {
    return realConnect.call(this, { ...cfg, port });
  };
  try {
    assert.deepEqual(await fetchHostFingerprint("127.0.0.1"), expected);
    assert.equal(passwordsSeen.length, 0);

    await assert.rejects(
      pushWallpaper("127.0.0.1", "SHA256:" + "A".repeat(43), "secret", { name: "wallpaper-a.jpg", data: Buffer.from("x") }, "windows"),
      /Host key changed/
    );
    assert.equal(passwordsSeen.length, 0, "password must not be sent to an unpinned host");

    await assert.rejects(
      pushWallpaper("127.0.0.1", expected.sha256, "secret", { name: "wallpaper-a.jpg", data: Buffer.from("x") }, "windows"),
      /authentication/i
    );
    await assert.rejects(
      pushWallpaper("127.0.0.1", expected.sha256, "secret", { name: "wallpaper-a.jpg", data: Buffer.from("x") }, "macos"),
      /authentication/i
    );
    assert.deepEqual(passwordsSeen, [
      { username: ".\\ithelpdesk", password: "secret" },
      { username: "ithelpdesk", password: "secret" }
    ], "pinned hosts only receive credentials for the configured local administrator");
  } finally {
    (ssh2.Client.prototype as any).connect = realConnect;
    server.close();
  }
});

test("unsafe wallpaper file names are refused before connecting", async () => {
  await assert.rejects(
    pushWallpaper("127.0.0.1", "x", "p", { name: "a'; rm -rf /", data: Buffer.from("") }, "windows"),
    /Unsafe/
  );
});

test("wallpaper files are untouched when the authenticated session fails the local admin check", async () => {
  const { private: hostKey } = ssh2.utils.generateKeyPairSync("ed25519");
  let fileSessions = 0;
  let platform: "windows" | "macos" = "windows";
  const server = new ssh2.Server({ hostKeys: [hostKey] }, client => {
    client.on("authentication", ctx => ctx.method === "password" ? ctx.accept() : ctx.reject());
    client.on("error", () => {});
    client.on("ready", () => client.on("session", accept => {
      const session = accept();
      session.on("sftp", (_accept, reject) => { fileSessions++; reject(); });
      session.on("exec", (accept, _reject, info) => {
        const stream = accept();
        const encoded = info.command.split("-EncodedCommand ")[1];
        const command = encoded ? Buffer.from(encoded, "base64").toString("utf16le") : info.command;
        const output = command === "hostname" ? "test-device"
          : command === "uname -s" && platform === "macos" ? "Darwin"
          : command === "$env:OS" && platform === "windows" ? "Windows_NT" : "";
        if (/New-Item|mkdir|Remove-Item/.test(command)) fileSessions++;
        stream.exit(output ? 0 : 1);
        stream.end(output);
      });
    }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  const realConnect = ssh2.Client.prototype.connect;
  ssh2.Client.prototype.connect = function (config) { return realConnect.call(this, { ...config, port }); };
  try {
    const key = await fetchHostFingerprint("127.0.0.1");
    assert.ok(key);
    for (const os of ["windows", "macos"] as const) {
      platform = os;
      const result = await pushWallpaper("127.0.0.1", key.sha256, "secret", { name: "wallpaper-test.jpg", data: Buffer.from("x") }, os);
      assert.equal(result.ok, false);
      assert.match(result.message, /local .*ithelpdesk administrator account/);
    }
    assert.equal(fileSessions, 0);
  } finally {
    ssh2.Client.prototype.connect = realConnect;
    server.close();
  }
});
