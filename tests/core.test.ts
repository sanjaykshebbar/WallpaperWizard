import { test } from "node:test";
import assert from "node:assert/strict";
import net from "net";
import ssh2 from "ssh2";
import { resolveWallpaper } from "../src/shared/resolveWallpaper";
import { expandScanRange } from "../src/shared/ipMatch";
import { probeBanner, fetchHostFingerprint, fingerprint, pushWallpaper } from "../devicePush";

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

test("probeBanner reads the SSH ident line and returns null for closed ports", async () => {
  const server = net.createServer(s => s.end("SSH-2.0-OpenSSH_for_Windows_9.5\r\n"));
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as net.AddressInfo).port;
  assert.equal(await probeBanner("127.0.0.1", 1000, port), "SSH-2.0-OpenSSH_for_Windows_9.5");
  server.close();
  assert.equal(await probeBanner("127.0.0.1", 300, port), null);
});

test("host-key pinning: fingerprint is learned without auth, and a mismatched host never receives the password", async () => {
  const { private: hostKey } = ssh2.utils.generateKeyPairSync("ed25519");
  const passwordsSeen: string[] = [];
  const server = new ssh2.Server({ hostKeys: [hostKey] }, client => {
    client.on("authentication", ctx => {
      if (ctx.method === "password") passwordsSeen.push(ctx.password);
      ctx.reject();
    });
    client.on("error", () => {});
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as net.AddressInfo).port;

  const parsed = ssh2.utils.parseKey(hostKey);
  const expected = fingerprint((Array.isArray(parsed) ? parsed[0] : parsed as any).getPublicSSH());

  // Both helpers use port 22; route them to our test server
  const realConnect = (ssh2.Client.prototype as any).connect;
  (ssh2.Client.prototype as any).connect = function (cfg: any) {
    return realConnect.call(this, { ...cfg, port });
  };
  try {
    assert.equal(await fetchHostFingerprint("127.0.0.1"), expected);
    assert.equal(passwordsSeen.length, 0);

    await assert.rejects(
      pushWallpaper("127.0.0.1", "0".repeat(32), { username: "ithelpdesk", password: "secret" }, { name: "wallpaper-a.jpg", data: Buffer.from("x") }),
      /Host key changed/
    );
    assert.equal(passwordsSeen.length, 0, "password must not be sent to an unpinned host");

    await assert.rejects(
      pushWallpaper("127.0.0.1", expected, { username: "ithelpdesk", password: "secret" }, { name: "wallpaper-a.jpg", data: Buffer.from("x") }),
      /authentication/i
    );
    assert.deepEqual(passwordsSeen, ["secret"], "pinned host gets the password");
  } finally {
    (ssh2.Client.prototype as any).connect = realConnect;
    server.close();
  }
});

test("unsafe wallpaper file names are refused before connecting", async () => {
  await assert.rejects(
    pushWallpaper("127.0.0.1", "x", { username: "u", password: "p" }, { name: "a'; rm -rf /", data: Buffer.from("") }),
    /Unsafe/
  );
});
