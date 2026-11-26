import type { ReactNode } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { version } from '../../package.json';
import type { SetupDownloadUrls } from '../types';

const link = 'text-blue-600 underline underline-offset-2 hover:no-underline';
const list = 'list-disc space-y-2 pl-5';
const commandBlock = 'mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100 select-all';

function Article({ children }: { children: ReactNode }) {
  return (
    <article className="mx-auto max-w-[76ch] space-y-7 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-700 sm:p-8">
      {children}
    </article>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-4 space-y-3 border-t border-slate-200 pt-5">
      <h2 id={`${id}-heading`} className="text-lg font-semibold leading-snug text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

export function ChangeLog() {
  return (
    <Article>
      <p className="font-medium text-slate-900">Installed version <code>v{version}</code></p>
      <Section id="version-1-2" title="v1.2.0">
        <p>Superadmins can generate a one-use MacBook setup command that sends the SSH fingerprint to WallpaperWizard. The enrolled MacBook appears in Devices and can be approved once a scan recognizes its host key.</p>
      </Section>
      <Section id="version-1-1" title="v1.1.0">
        <ul className={list}>
          <li>Discovered devices now shows Windows PCs and enrolled MacBooks. Linux servers, other SSH hosts, and unclassified records are hidden.</li>
          <li>The MacBook setup script prints the SSH fingerprint required for enrollment. New Windows PCs require administrator approval before WallpaperWizard can push to them.</li>
          <li>Both setup scripts display progress, explain failures, and show the next steps. Copies are maintained in the Lazy Code repository.</li>
          <li>Change Log and Documentation are available next to About in the dashboard.</li>
        </ul>
        <p>After upgrading, rescan Windows PCs and enroll existing MacBooks. A matching host key keeps the device’s saved name, group, and approval.</p>
      </Section>
      <Section id="version-1-0" title="v1.0.0">
        <ul className={list}>
          <li>Initial self-hosted dashboard with SSH discovery, approvals, and agentless wallpaper delivery.</li>
          <li>Organization, group, and device targeting with optional schedules.</li>
          <li>Superadmin and editor roles, account two-factor authentication, dashboard IP restrictions, and an audit log.</li>
        </ul>
      </Section>
      <Link className={link} to="/admin/documentation">Read the documentation</Link>
    </Article>
  );
}

export function Documentation() {
  const setupScripts = useOutletContext<SetupDownloadUrls | undefined>();
  const sections = [
    ['how-it-works', 'How WallpaperWizard works'],
    ['setup-devices', 'Set up Windows PCs and MacBooks'],
    ['discover-devices', 'Discover and approve devices'],
    ['assign-wallpapers', 'Assign and schedule wallpapers'],
    ['manage-access', 'Manage access and server data'],
    ['troubleshoot', 'Troubleshoot discovery and pushes']
  ];

  return (
    <Article>
      <p>Use WallpaperWizard to assign desktop wallpapers to Windows PCs and MacBooks you manage. Run the setup script once on each device, then manage wallpaper assignments from the dashboard.</p>
      <nav aria-label="On this page" className="space-y-2 bg-slate-50 rounded-lg p-4">
        <h2 className="font-semibold text-slate-900">On this page</h2>
        <ul className="space-y-1.5">
          {sections.map(([id, title]) => <li key={id}><a href={`#${id}`} className={link}>{title}</a></li>)}
        </ul>
      </nav>

      <Section id="how-it-works" title="How WallpaperWizard works">
        <p>The server checks TCP port 22 in your configured network ranges. Windows PCs are identified by the Windows OpenSSH banner. A MacBook is discovered when its public SSH host fingerprint matches one submitted by its setup script or entered in Push Settings. The scan records supported devices without signing in.</p>
        <p>For an approved device with an applicable wallpaper, the server checks the full host key before authenticating, then verifies the operating system and checks MacBook hardware before uploading. It uses the local device admin account from Push Settings.</p>
        <ul className={list}>
          <li><strong>Windows</strong> uses a scheduled task to set the wallpaper for the signed-in user and reapply it at sign-in.</li>
          <li><strong>MacBook</strong> applies the wallpaper to the active desktop session and retries on a later cycle when nobody is signed in.</li>
        </ul>
      </Section>

      <Section id="setup-devices" title="Set up Windows PCs and MacBooks">
        <ol className="list-decimal space-y-3 pl-5">
          <li>Sign in as a superadmin. In <strong>Push Settings</strong>, enter the shared device admin username and password. The Windows account needs local administrator privileges. The MacBook account needs Remote Login access and permission to use sudo.</li>
          <li>Add the IP addresses or IPv4 CIDR ranges you manage, one per line. A single range can be as large as <code>/20</code>, and a scan checks up to 4,096 addresses across all ranges. The server must be able to reach device TCP port 22.</li>
          <li>
            Run the command for each client device. The commands download a versioned copy of the setup scripts over HTTPS.
            {setupScripts ? (
              <>
                <h3 className="mt-3 font-semibold text-slate-900">Windows 10/11</h3>
                <p>Open Windows PowerShell with <strong>Run as administrator</strong> and run this command.</p>
                <pre className={commandBlock}><code>{`irm '${setupScripts.windows}' | iex`}</code></pre>
                <h3 className="mt-3 font-semibold text-slate-900">MacBook</h3>
                <p>In <strong>Push Settings</strong>, enter the WallpaperWizard server URL the MacBook can reach and select <strong>Generate MacBook setup command</strong>. Paste the generated command into Terminal on the MacBook within 30 minutes. The script submits the fingerprint and prints a confirmation.</p>
                <details className="mt-2">
                  <summary className="cursor-pointer font-semibold">Manual enrollment</summary>
                  <pre className={commandBlock}><code>{`curl -fsSL '${setupScripts.macos}' | sudo bash`}</code></pre>
                  <p className="mt-2">Paste the complete <code>SHA256:</code> fingerprint from the script into <strong>MacBook fingerprints</strong> in Push Settings, one per line, then save.</p>
                </details>
                <p className="mt-2">If macOS requests Full Disk Access, setup opens the approval pane. Enable Terminal in <strong>Privacy &amp; Security → Full Disk Access</strong>, then quit and reopen Terminal before rerunning setup. You can also enable Remote Login directly in <strong>System Settings → General → Sharing</strong> and rerun setup.</p>
              </>
            ) : <p role="status">Loading setup commands…</p>}
          </li>
        </ol>
      </Section>

      <Section id="discover-devices" title="Discover and approve devices">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Go to <strong>Devices</strong> and select <strong>Scan now</strong>. Discovered devices lists Windows PCs and enrolled MacBooks in the configured address ranges.</li>
          <li>Verify each device before selecting <strong>Approve</strong>. Windows PCs and MacBooks enrolled with a setup command require approval. <strong>Auto-approve manually enrolled MacBooks</strong> applies to fingerprints entered in Push Settings.</li>
          <li>Give a device a recognizable name and an optional group, such as Sales or Lobby. Set the status to <strong>Ignored</strong> to keep a device out of push runs.</li>
        </ol>
        <p>To withdraw a setup command enrollment, remove the record from Devices. If the fingerprint was entered manually, remove it from <strong>MacBook fingerprints</strong> in Push Settings.</p>
      </Section>

      <Section id="assign-wallpapers" title="Assign and schedule wallpapers">
        <p>Open <strong>Wallpapers</strong>, upload a JPG or PNG up to 20 MB, and give it a title. Choose everyone, a group, or a specific device. Set an optional start and end time, make the wallpaper active, and save.</p>
        <p>The active wallpaper targeting the device directly takes priority over a group wallpaper, which takes priority over one assigned to everyone. At the same priority, the most recently updated matching wallpaper applies.</p>
        <p>Changes trigger a push when the worker is available. The worker also runs periodically, every 15 minutes by default. Use <strong>Push</strong> on a device or <strong>Push to all</strong> to resend the current assignment. Check <strong>Last push</strong> for the outcome. When a wallpaper expires without a matching replacement, the device keeps the image already applied.</p>
      </Section>

      <Section id="manage-access" title="Manage access and server data">
        <ul className={list}>
          <li>Superadmins manage users, device approvals, push settings, IP restrictions, and the audit log. Editors can manage wallpapers and request pushes to approved devices.</li>
          <li>In <strong>Account &amp; Security</strong>, enable two-factor authentication if required. <strong>Access Restrictions</strong> controls which IPs can access the dashboard.</li>
          <li>The device password is encrypted on the server. The browser only receives an indicator that a password is saved. Keep the server on your managed network.</li>
          <li>For a Docker installation, back up the <code>wallpaperwizard-data</code> volume. It contains the database, images, and generated encryption key. If you supply <code>WW_SECRET_KEY</code> externally, retain that value alongside your backup procedures so saved device credentials can be decrypted after restoring.</li>
        </ul>
      </Section>

      <Section id="troubleshoot" title="Troubleshoot discovery and pushes">
        <ul className={list}>
          <li><strong>Windows PC missing.</strong> Confirm OpenSSH Server is running, check TCP port 22 from the server and the firewall policy on the active network profile, and confirm the PC’s IP is in a scan range.</li>
          <li><strong>MacBook missing.</strong> Check Remote Login, the IP range, and the exact fingerprint from local setup. If the device has been reinstalled and its host key changed, replace the fingerprint with the new one verified on that MacBook, then scan and approve the new record.</li>
          <li><strong>Host key changed.</strong> Verify the device and new key with your administrator before approving the newly discovered record.</li>
          <li><strong>Authentication failed.</strong> Correct the username or saved password in Push Settings and confirm the account can sign in over SSH on the device.</li>
          <li><strong>MacBook wallpaper did not apply.</strong> Sign in to its desktop and allow System Events if prompted. Then retry the push or wait for the next cycle.</li>
        </ul>
        <p><a className={link} href="https://support.apple.com/guide/mac-help/allow-a-remote-computer-to-access-your-mac-mchlp1066/mac">Apple Remote Login guide</a>{' · '}<a className={link} href="https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh-server-configuration">Microsoft OpenSSH configuration</a></p>
      </Section>
    </Article>
  );
}
