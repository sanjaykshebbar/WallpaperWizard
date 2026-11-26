/**
 * WallpaperWizard dashboard: wallpapers, devices, and push settings.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, Outlet, useMatch, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, ThemeName } from '../contexts/ThemeContext';
import { WallpaperService } from '../services/wallpaperService';
import { DeviceService } from '../services/deviceService';
import { resolveWallpaper, isLive } from '../shared/resolveWallpaper';
import { Wallpaper, WallpaperScope, Device, PushSettings, WorkerStatus } from '../types';
import InfoTip from '../components/InfoTip';
import Brand from '../components/Brand';
import OnboardingTour from '../components/OnboardingTour';
import AccountSecurityModal from '../components/AccountSecurityModal';
import UserManagementModal from '../components/UserManagementModal';
import SecurityModal from '../components/SecurityModal';
import AuditLogModal from '../components/AuditLogModal';
import AboutModal from '../components/AboutModal';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  LogOut, UploadCloud, Trash2, Pencil, Check, X, Calendar, AlertCircle, Sun, Moon, Scroll,
  UserCog, GraduationCap, Users as UsersIcon, ShieldCheck, ScrollText, Info as InfoIcon, BookOpen, History,
  Image as ImageIcon, Monitor, KeyRound, Radar, Send, Loader2, Apple, MonitorSmartphone, Ban, CheckCircle2
} from 'lucide-react';

type Tab = 'wallpapers' | 'devices' | 'settings';

/** ISO -> value for a datetime-local input, in local time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');
const deviceName = (d: Device) => d.label || d.hostname || d.ip || d.id.slice(0, 8);

const inputClass = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 placeholder-slate-400';
const btnPrimary = 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-3.5 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer';
const btnSecondary = 'bg-white hover:bg-slate-50 border border-slate-200 disabled:opacity-50 text-slate-700 font-semibold px-3 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer';
const sidebarItem = 'w-full flex items-center justify-center sm:justify-start gap-3 px-2 sm:px-3 py-2 rounded-md text-sm font-medium transition-all text-left cursor-pointer';
const sidebarState = (active: boolean) => active ? 'bg-white/15 text-white shadow-inner' : 'text-white/60 hover:bg-white/10 hover:text-white';

const EMPTY_FORM = { title: '', scope: 'org' as WallpaperScope, target: '', start: '', end: '', isActive: true };

export default function Admin() {
  const navigate = useNavigate();
  const { user, logoutAdmin, isSuperadmin, tutorialSeen, markTutorialSeen } = useAuth();
  const { theme, setTheme } = useTheme();

  const [dashboardTab, setTab] = useState<Tab>('wallpapers');
  const isChangeLog = useMatch('/admin/changelog');
  const isDocumentation = useMatch('/admin/documentation');
  const referencePage = !!(isChangeLog || isDocumentation);
  const tab = referencePage ? null : dashboardTab;
  const pageTitle = isChangeLog ? 'Change Log' : isDocumentation ? 'Documentation'
    : tab === 'wallpapers' ? 'Wallpapers' : tab === 'devices' ? 'Devices' : 'Push Settings';
  usePageTitle(pageTitle);

  const [wallpapers, setWallpapers] = useState<Wallpaper[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [worker, setWorker] = useState<WorkerStatus | null>(null);
  const [settings, setSettings] = useState<PushSettings | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [modal, setModal] = useState<null | 'tour' | 'account' | 'users' | 'security' | 'audit' | 'about'>(null);

  // Wallpaper form (add or edit)
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<Wallpaper | null>(null);

  // Push settings form
  const [pushForm, setPushForm] = useState({ username: 'ithelpdesk', password: '', ranges: '', interval: 15 });

  const flash = (ok: boolean, text: string) => setMessage({ ok, text });
  const fail = (err: unknown) => flash(false, err instanceof Error ? err.message : String(err));

  const refresh = useCallback(async () => {
    try {
      const [w, d, s] = await Promise.all([WallpaperService.list(), DeviceService.list(), DeviceService.workerStatus()]);
      setWallpapers(w);
      setDevices(d);
      setWorker(s);
    } catch (err: any) {
      if (/sign in/i.test(err.message)) {
        await logoutAdmin();
        navigate('/login');
      }
    }
  }, [logoutAdmin, navigate]);

  useEffect(() => {
    refresh();
    DeviceService.getSettings().then(s => {
      setSettings(s);
      setPushForm({
        username: s.username, password: '', ranges: s.scanRanges.join('\n'),
        interval: s.intervalMinutes
      });
    }).catch(() => {});
    // Live view of scans and pushes; local server, so a 5s poll is cheap
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (user && !tutorialSeen && !referencePage) setModal('tour');
  }, [user, tutorialSeen, referencePage]);

  const groups = [...new Set(devices.map(d => d.group).filter(Boolean) as string[])].sort();
  const pending = devices.filter(d => d.status === 'pending');

  // ---- Wallpapers ----

  const startEdit = (w: Wallpaper) => {
    setEditing(w);
    setFile(null);
    setForm({ title: w.title, scope: w.scope, target: w.target || '', start: toLocalInput(w.scheduledStart), end: toLocalInput(w.scheduledEnd), isActive: w.isActive });
    setMessage(null);
  };

  const resetForm = () => {
    setEditing(null);
    setFile(null);
    setForm(EMPTY_FORM);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setMessage(null);
    if (!f) return setFile(null);
    try {
      WallpaperService.validateFile(f);
      setFile(f);
      if (!form.title) setForm({ ...form, title: f.name.replace(/\.[^.]+$/, '') });
    } catch (err) {
      fail(err);
      e.target.value = '';
    }
  };

  const saveWallpaper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing && !file) return flash(false, 'Choose a JPG or PNG image.');
    setBusy(true);
    setMessage(null);
    try {
      const url = file ? await WallpaperService.upload(file) : editing!.url;
      await WallpaperService.save({
        id: editing?.id || `wp_${Date.now()}`,
        title: form.title.trim(),
        url,
        mimeType: file?.type || editing?.mimeType,
        fileName: file?.name || editing?.fileName,
        fileSize: file?.size || editing?.fileSize,
        isActive: form.isActive,
        scope: form.scope,
        target: form.scope === 'org' ? null : form.target,
        scheduledStart: form.start ? new Date(form.start).toISOString() : null,
        scheduledEnd: form.end ? new Date(form.end).toISOString() : null
      });
      flash(true, editing ? 'Wallpaper updated. Affected devices are being updated.' : 'Wallpaper added. Matching devices are being updated.');
      resetForm();
      refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (w: Wallpaper) => {
    try {
      await WallpaperService.save({ ...w, isActive: !w.isActive });
      refresh();
    } catch (err) { fail(err); }
  };

  const deleteWallpaper = async (w: Wallpaper) => {
    if (!window.confirm(`Delete wallpaper "${w.title}"? Devices using it will switch to the next matching wallpaper.`)) return;
    try {
      await WallpaperService.remove(w.id);
      if (editing?.id === w.id) resetForm();
      refresh();
    } catch (err) { fail(err); }
  };

  const audienceLabel = (w: Wallpaper) => {
    if (w.scope === 'org') return 'Everyone';
    if (w.scope === 'group') return `Group: ${w.target}`;
    const d = devices.find(x => x.id === w.target);
    return `Device: ${d ? deviceName(d) : 'removed device'}`;
  };

  // ---- Devices ----

  const runAction = async (fn: () => Promise<void>, ok: string) => {
    setMessage(null);
    try {
      await fn();
      flash(true, ok);
      refresh();
    } catch (err) { fail(err); }
  };

  const updateDevice = (d: Device, changes: Parameters<typeof DeviceService.update>[1]) =>
    DeviceService.update(d.id, changes).then(refresh).catch(fail);

  const approveAll = () => runAction(
    async () => { for (const d of pending) await DeviceService.update(d.id, { status: 'approved' }); },
    `Approved ${pending.length} device${pending.length === 1 ? '' : 's'}. Pushing their wallpapers now.`
  );

  const removeDevice = async (d: Device) => {
    if (!window.confirm(`Remove ${deviceName(d)}? It will reappear as pending on the next scan if it is still reachable.`)) return;
    runAction(() => DeviceService.remove(d.id), 'Device removed.');
  };

  // ---- Push settings ----

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await DeviceService.saveSettings({
        username: pushForm.username.trim(),
        password: pushForm.password || undefined,
        scanRanges: pushForm.ranges.split(/[\s,]+/).filter(Boolean),
        intervalMinutes: Number(pushForm.interval)
      });
      const s = await DeviceService.getSettings();
      setSettings(s);
      setPushForm(f => ({ ...f, password: '' }));
      flash(true, 'Push settings saved.');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const handleExit = async () => {
    await logoutAdmin();
    navigate('/login');
  };

  const running = !!worker?.running;
  const lastRun = worker?.lastRun;
  const setupScripts = settings?.setupScripts;

  const navBtn = (id: Tab, icon: React.ReactNode, label: string, badge?: number) => (
    <button
      onClick={() => { setTab(id); setMessage(null); if (referencePage) navigate('/admin'); }}
      className={`${sidebarItem} ${sidebarState(tab === id)}`}
      title={label}
      aria-current={tab === id ? 'page' : undefined}
      id={`tab-${id}`}
    >
      {icon}
      <span className="sr-only sm:not-sr-only">{label}</span>
      {!!badge && <span className="hidden sm:inline ml-auto text-[10px] font-bold bg-pink-500 text-white rounded-full px-1.5 min-w-5 text-center">{badge}</span>}
    </button>
  );

  const sideBtn = (onClick: () => void, icon: React.ReactNode, label: string, id: string) => (
    <button onClick={onClick} id={id} title={label} className={`${sidebarItem} ${sidebarState(false)}`}>
      {icon}
      <span className="sr-only sm:not-sr-only">{label}</span>
    </button>
  );

  const pageLink = (to: string, icon: React.ReactNode, label: string) => (
    <NavLink to={to} end title={label} className={({ isActive }) => `${sidebarItem} ${sidebarState(isActive)}`}>
      {icon}
      <span className="sr-only sm:not-sr-only">{label}</span>
    </NavLink>
  );

  return (
    <div className="h-screen w-screen bg-[#F8FAFC] flex overflow-hidden font-sans text-slate-800" id="ww-dashboard">
      <aside className="w-14 sm:w-64 ww-sidebar flex flex-col shrink-0">
        <div className="p-3 sm:p-5 border-b border-white/10">
          <Brand compactOnMobile />
        </div>

        <nav className="flex-1 p-2 sm:p-4 space-y-6 overflow-y-auto" aria-label="Main">
          <div className="space-y-1">
            {navBtn('wallpapers', <ImageIcon className="w-4 h-4" />, 'Wallpapers')}
            {navBtn('devices', <Monitor className="w-4 h-4" />, 'Devices', pending.length)}
            {isSuperadmin && navBtn('settings', <KeyRound className="w-4 h-4" />, 'Push Settings')}
          </div>

          {isSuperadmin && (
            <div>
              <div className="sr-only sm:not-sr-only text-white/40 text-[10px] px-3 mb-2 font-bold uppercase tracking-wider">Administration</div>
              <div className="space-y-1">
                {sideBtn(() => setModal('users'), <UsersIcon className="w-4 h-4" />, 'Manage Users', 'manage-users-btn')}
                {sideBtn(() => setModal('security'), <ShieldCheck className="w-4 h-4" />, 'Access Restrictions', 'ip-security-btn')}
                {sideBtn(() => setModal('audit'), <ScrollText className="w-4 h-4" />, 'Audit Log', 'audit-log-btn')}
              </div>
            </div>
          )}

          <div>
            <div className="sr-only sm:not-sr-only text-white/40 text-[10px] px-3 mb-2 font-bold uppercase tracking-wider">Account</div>
            <div className="space-y-1">
              {sideBtn(() => setModal('account'), <UserCog className="w-4 h-4" />, 'Account & Security', 'account-security-btn')}
              {sideBtn(() => setModal('tour'), <GraduationCap className="w-4 h-4" />, 'Show Tutorial', 'show-tutorial-btn')}
              {sideBtn(() => setModal('about'), <InfoIcon className="w-4 h-4" />, 'About', 'about-btn')}
              {pageLink('/admin/changelog', <History className="w-4 h-4" />, 'Change Log')}
              {pageLink('/admin/documentation', <BookOpen className="w-4 h-4" />, 'Documentation')}
            </div>
          </div>
        </nav>

        <div className="p-2.5 sm:p-4 border-t border-white/10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full ww-logo text-white font-bold flex items-center justify-center text-sm">
            {(user?.email || 'A').slice(0, 2).toUpperCase()}
          </div>
          <div className="hidden sm:block truncate">
            <div className="text-xs font-bold text-white truncate" title={user?.email}>{user?.email}</div>
            <div className="text-[10px] text-white/50 uppercase tracking-wider font-semibold">{isSuperadmin ? 'Superadmin' : 'Editor'}</div>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between gap-2 px-3 sm:px-8 shrink-0">
          <h1 className="text-base font-display font-bold text-slate-900">
            {pageTitle}
          </h1>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className={`hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-widest ${
              running ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-500'
            }`} id="worker-badge" aria-live="polite">
              {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="w-2 h-2 rounded-full bg-emerald-500" />}
              {running ? 'Scanning / pushing' : lastRun?.finishedAt ? `Last run ${new Date(lastRun.finishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Idle'}
            </div>

            <div className="flex items-center gap-0.5 bg-slate-100 border border-slate-200 rounded-full p-0.5" id="theme-switcher">
              {([
                { name: 'light' as ThemeName, icon: <Sun className="w-3.5 h-3.5" />, hint: 'Light theme' },
                { name: 'dark' as ThemeName, icon: <Moon className="w-3.5 h-3.5" />, hint: 'Dark theme' },
                { name: 'paper' as ThemeName, icon: <Scroll className="w-3.5 h-3.5" />, hint: 'Paper theme' }
              ]).map(({ name, icon, hint }) => (
                <button key={name} onClick={() => setTheme(name)} title={hint} aria-label={hint} aria-pressed={theme === name}
                  className={`p-1.5 rounded-full cursor-pointer ${theme === name ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
                  {icon}
                </button>
              ))}
            </div>

            <button id="logout-btn" onClick={handleExit} className="bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-600 hover:text-red-700 px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
              <LogOut className="w-3.5 h-3.5" /> <span className="sr-only md:not-sr-only">Sign Out</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 sm:p-8 space-y-6">
          <Outlet context={setupScripts} />
          {!referencePage && message && (
            <div role="status" className={`text-xs rounded-lg p-3 flex items-start gap-2 border font-medium ${message.ok ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
              {message.ok ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span className="flex-1">{message.text}</span>
              <button onClick={() => setMessage(null)} aria-label="Dismiss" className="cursor-pointer"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {!referencePage && settings && !settings.hasPassword && tab !== 'settings' && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-lg p-3 flex items-center gap-2">
              <KeyRound className="w-4 h-4 shrink-0" />
              <span className="flex-1">No device password saved yet, so wallpapers can't be pushed.{isSuperadmin ? ' Add it in Push Settings.' : ' Ask a superadmin to add it.'}</span>
              {isSuperadmin && <button className={btnSecondary} onClick={() => setTab('settings')}>Open Push Settings</button>}
            </div>
          )}

          {/* ================= WALLPAPERS ================= */}
          {tab === 'wallpapers' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              <form onSubmit={saveWallpaper} className="xl:col-span-4 bg-white rounded-xl border border-slate-200 p-5 space-y-4 self-start" id="wallpaper-form">
                <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  {editing ? <Pencil className="w-4 h-4 text-blue-600" /> : <UploadCloud className="w-4 h-4 text-blue-600" />}
                  {editing ? `Edit "${editing.title}"` : 'Add wallpaper'}
                </h2>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1" htmlFor="wp-file">
                    Image (JPG or PNG, up to 20 MB){editing && ' · leave empty to keep the current image'}
                  </label>
                  <input id="wp-file" ref={fileRef} type="file" accept="image/jpeg,image/png" onChange={onPickFile}
                    className="block w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-semibold file:cursor-pointer" />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1" htmlFor="wp-title">Title</label>
                  <input id="wp-title" required className={inputClass} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Q4 brand wallpaper" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1" htmlFor="wp-scope">
                      Applies to <InfoTip text="When several wallpapers match a device, the most specific wins: one device beats a group, a group beats everyone. Ties go to the most recently edited." />
                    </label>
                    <select id="wp-scope" className={inputClass} value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value as WallpaperScope, target: '' })}>
                      <option value="org">Everyone</option>
                      <option value="group">A group</option>
                      <option value="device">One device</option>
                    </select>
                  </div>
                  {form.scope === 'group' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1" htmlFor="wp-group">Group</label>
                      <input id="wp-group" required list="ww-groups" className={inputClass} value={form.target} onChange={e => setForm({ ...form, target: e.target.value })} placeholder="Sales" />
                    </div>
                  )}
                  {form.scope === 'device' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1" htmlFor="wp-device">Device</label>
                      <select id="wp-device" required className={inputClass} value={form.target} onChange={e => setForm({ ...form, target: e.target.value })}>
                        <option value="">Choose…</option>
                        {devices.filter(d => d.status !== 'ignored').map(d => <option key={d.id} value={d.id}>{deviceName(d)}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                <fieldset className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                  <legend className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 px-1">
                    <Calendar className="w-3 h-3" /> Schedule (optional, your local time)
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5" htmlFor="wp-start">Start</label>
                      <input id="wp-start" type="datetime-local" className={inputClass} value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5" htmlFor="wp-end">End</label>
                      <input id="wp-end" type="datetime-local" className={inputClass} value={form.end} onChange={e => setForm({ ...form, end: e.target.value })} />
                    </div>
                  </div>
                </fieldset>

                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="accent-violet-600" />
                  Active
                </label>

                <div className="flex gap-2">
                  <button type="submit" disabled={busy} className={`${btnPrimary} flex-1`} id="wp-save-btn">
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    {editing ? 'Save changes' : 'Add & push'}
                  </button>
                  {editing && <button type="button" onClick={resetForm} className={btnSecondary}>Cancel</button>}
                </div>
                <datalist id="ww-groups">{groups.map(g => <option key={g} value={g} />)}</datalist>
              </form>

              <section className="xl:col-span-8" aria-label="Wallpaper library">
                {wallpapers.length === 0 ? (
                  <div className="border border-dashed border-slate-200 bg-white rounded-xl py-14 px-6 text-center">
                    <ImageIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="font-bold text-slate-800 text-sm mb-1">No wallpapers yet</h3>
                    <p className="text-xs text-slate-500">Add one with the form; an "Everyone" wallpaper is a good default.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {wallpapers.map(w => {
                      const users = devices.filter(d => d.status === 'approved' && resolveWallpaper<Wallpaper>(wallpapers, d)?.id === w.id).length;
                      const live = isLive(w, new Date());
                      return (
                        <article key={w.id} className={`bg-white border rounded-xl overflow-hidden flex flex-col ${editing?.id === w.id ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'}`}>
                          <div className="aspect-video bg-slate-900 relative">
                            <img src={w.url} alt={w.title} className="w-full h-full object-cover" />
                            <span className={`absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-md ${live ? 'bg-emerald-600 text-white' : 'bg-slate-900/80 text-white/80'}`}>
                              {!w.isActive ? 'Inactive' : live ? 'Live' : 'Scheduled'}
                            </span>
                          </div>
                          <div className="p-4 space-y-2 flex-1 flex flex-col">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-sm font-bold text-slate-900 truncate" title={w.title}>{w.title}</h3>
                              <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5 whitespace-nowrap">{audienceLabel(w)}</span>
                            </div>
                            <p className="text-[11px] text-slate-500">
                              Current wallpaper on <strong className="text-slate-800">{users}</strong> approved device{users === 1 ? '' : 's'}
                            </p>
                            {(w.scheduledStart || w.scheduledEnd) && (
                              <p className="text-[11px] text-slate-500 flex items-center gap-1">
                                <Calendar className="w-3 h-3" /> {fmt(w.scheduledStart) || 'now'} → {fmt(w.scheduledEnd) || 'no end'}
                              </p>
                            )}
                            <div className="flex gap-2 pt-2 mt-auto">
                              <button onClick={() => startEdit(w)} className={`${btnSecondary} flex-1`}><Pencil className="w-3 h-3" /> Edit</button>
                              <button onClick={() => toggleActive(w)} className={btnSecondary}>{w.isActive ? 'Deactivate' : 'Activate'}</button>
                              <button onClick={() => deleteWallpaper(w)} className={`${btnSecondary} hover:text-red-700`} aria-label={`Delete ${w.title}`}><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ================= DEVICES ================= */}
          {tab === 'devices' && (
            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden" aria-label="Devices">
              <div className="p-5 border-b border-slate-100 flex flex-wrap items-center gap-3 justify-between">
                <div>
                  <h2 className="font-bold text-slate-900 text-sm">Discovered devices</h2>
                  <p className="text-[11px] text-slate-500">
                    {devices.filter(d => d.status === 'approved').length} approved · {pending.length} pending
                    {lastRun?.finishedAt && ` · last run found ${lastRun.found}, pushed ${lastRun.pushed}, failed ${lastRun.failed}`}
                    {lastRun?.note && ` · ${lastRun.note}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  {isSuperadmin && pending.length > 0 && (
                    <button onClick={approveAll} className={btnSecondary} id="approve-all-btn"><CheckCircle2 className="w-3.5 h-3.5" /> Approve all ({pending.length})</button>
                  )}
                  {isSuperadmin && (
                    <button onClick={() => runAction(DeviceService.scanNow, 'Scan started. Devices appear here as they are found.')} disabled={running} className={btnSecondary} id="scan-btn">
                      <Radar className="w-3.5 h-3.5" /> Scan now
                    </button>
                  )}
                  <button onClick={() => runAction(() => DeviceService.pushNow(), 'Pushing to every approved device.')} disabled={running} className={btnPrimary} id="push-all-btn">
                    <Send className="w-3.5 h-3.5" /> Push to all
                  </button>
                </div>
              </div>

              {devices.length === 0 ? (
                <div className="py-14 px-6 text-center">
                  <MonitorSmartphone className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="font-bold text-slate-800 text-sm mb-1">No devices found yet</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Run the current setup command on each Windows PC or MacBook. Save the network ranges in Push Settings, then select Scan now.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider">
                        <th className="px-4 py-2.5 font-bold">Device</th>
                        <th className="px-4 py-2.5 font-bold">Group</th>
                        <th className="px-4 py-2.5 font-bold">Status</th>
                        <th className="px-4 py-2.5 font-bold">Wallpaper</th>
                        <th className="px-4 py-2.5 font-bold">Last push</th>
                        <th className="px-4 py-2.5 font-bold sr-only">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {devices.map(d => {
                        const wp = resolveWallpaper<Wallpaper>(wallpapers, d);
                        const inSync = !!wp && d.applied?.wallpaperId === wp.id && d.applied.version === wp.updatedAt;
                        return (
                          <tr key={d.id} className={d.status === 'ignored' ? 'opacity-50' : ''}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {d.os === 'macos' ? <Apple className="w-4 h-4 text-slate-500" aria-label="MacBook" />
                                  : <Monitor className="w-4 h-4 text-blue-600" aria-label="Windows" />}
                                <div>
                                  {isSuperadmin ? (
                                    <input
                                      aria-label="Device name"
                                      defaultValue={d.label || ''}
                                      placeholder={d.hostname || d.ip}
                                      onBlur={e => e.target.value !== (d.label || '') && updateDevice(d, { label: e.target.value })}
                                      className="bg-transparent font-semibold text-slate-900 border-b border-transparent hover:border-slate-200 focus:border-blue-500 focus:outline-none w-40"
                                    />
                                  ) : <div className="font-semibold text-slate-900">{deviceName(d)}</div>}
                                  <div className="text-[10px] text-slate-400 font-mono">{d.ip || 'offline'}{d.hostname && d.label ? ` · ${d.hostname}` : ''}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {isSuperadmin ? (
                                <input
                                  aria-label="Group"
                                  list="ww-device-groups"
                                  defaultValue={d.group || ''}
                                  placeholder="No group"
                                  onBlur={e => e.target.value.trim() !== (d.group || '') && updateDevice(d, { group: e.target.value })}
                                  className="bg-white border border-slate-200 rounded px-2 py-1 w-28 focus:outline-none focus:border-blue-500"
                                />
                              ) : (d.group || '—')}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                                d.status === 'approved' ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                                : d.status === 'pending' ? 'bg-amber-50 border-amber-200 text-amber-900'
                                : 'bg-slate-100 border-slate-200 text-slate-500'
                              }`}>{d.status}</span>
                            </td>
                            <td className="px-4 py-3">
                              {wp ? (
                                <span className="flex items-center gap-1.5">
                                  <img src={wp.url} alt="" className="w-8 h-5 rounded object-cover" />
                                  <span className="truncate max-w-32" title={wp.title}>{wp.title}</span>
                                  {d.status === 'approved' && (inSync
                                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-label="Applied" />
                                    : <Loader2 className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-label="Not applied yet" />)}
                                </span>
                              ) : <span className="text-slate-400">None matches</span>}
                            </td>
                            <td className="px-4 py-3 max-w-64">
                              {d.lastPush ? (
                                <div title={d.lastPush.message}>
                                  <span className={`font-semibold ${d.lastPush.ok ? 'text-emerald-700' : 'text-red-700'}`}>{d.lastPush.ok ? 'OK' : 'Failed'}</span>
                                  <span className="text-slate-400"> · {fmt(d.lastPush.at)}</span>
                                  <div className="text-[10px] text-slate-500 truncate">{d.lastPush.message}</div>
                                </div>
                              ) : <span className="text-slate-400">Never</span>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1.5 justify-end">
                                {isSuperadmin && d.status !== 'approved' && (
                                  <button onClick={() => updateDevice(d, { status: 'approved' })} className={btnSecondary} aria-label={`Approve ${deviceName(d)}`}><Check className="w-3.5 h-3.5" /> Approve</button>
                                )}
                                {d.status === 'approved' && (
                                  <button onClick={() => runAction(() => DeviceService.pushNow([d.id]), `Pushing to ${deviceName(d)}.`)} disabled={running || !wp} className={btnSecondary} aria-label={`Push to ${deviceName(d)}`}><Send className="w-3.5 h-3.5" /></button>
                                )}
                                {isSuperadmin && d.status !== 'ignored' && (
                                  <button onClick={() => updateDevice(d, { status: 'ignored' })} className={btnSecondary} aria-label={`Ignore ${deviceName(d)}`} title="Ignore: never push to this device"><Ban className="w-3.5 h-3.5" /></button>
                                )}
                                {isSuperadmin && (
                                  <button onClick={() => removeDevice(d)} className={`${btnSecondary} hover:text-red-700`} aria-label={`Remove ${deviceName(d)}`}><Trash2 className="w-3.5 h-3.5" /></button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <datalist id="ww-device-groups">{groups.map(g => <option key={g} value={g} />)}</datalist>
                </div>
              )}
            </section>
          )}

          {/* ================= PUSH SETTINGS ================= */}
          {tab === 'settings' && isSuperadmin && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              <form onSubmit={saveSettings} className="xl:col-span-7 bg-white rounded-xl border border-slate-200 p-6 space-y-5" id="push-settings-form">
                <div>
                  <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2"><KeyRound className="w-4 h-4 text-blue-600" /> Device admin credentials</h2>
                  <p className="text-[11px] text-slate-500 mt-1">The local admin account on each managed Windows PC and MacBook. WallpaperWizard uses it over SSH to set the wallpaper.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1" htmlFor="push-user">Username</label>
                    <input id="push-user" required autoComplete="off" className={inputClass} value={pushForm.username} onChange={e => setPushForm({ ...pushForm, username: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1" htmlFor="push-pass">
                      Password {settings?.hasPassword && <span className="text-emerald-700 font-normal">· saved</span>}
                    </label>
                    <input id="push-pass" type="password" autoComplete="new-password" className={inputClass} value={pushForm.password}
                      onChange={e => setPushForm({ ...pushForm, password: e.target.value })}
                      placeholder={settings?.hasPassword ? 'Leave blank to keep the saved password' : 'Required to push wallpapers'} />
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 -mt-2">The password is encrypted on the server and never shown again. It is only sent to devices you approved.</p>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1" htmlFor="push-ranges">
                    Network ranges to scan <InfoTip text="One per line: a single IP (10.0.0.25) or an IPv4 CIDR range up to /20 (192.168.1.0/24). The server probes each address on SSH port 22." />
                  </label>
                  <textarea id="push-ranges" rows={4} className={`${inputClass} font-mono`} value={pushForm.ranges}
                    onChange={e => setPushForm({ ...pushForm, ranges: e.target.value })} placeholder={'192.168.1.0/24\n10.20.0.0/22'} />
                </div>

                <div className="max-w-xs">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1" htmlFor="push-interval">Rescan and re-push every (minutes)</label>
                  <input id="push-interval" type="number" min={5} max={1440} required className={inputClass} value={pushForm.interval} onChange={e => setPushForm({ ...pushForm, interval: Number(e.target.value) })} />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400">{settings?.updatedAt && `Last saved ${fmt(settings.updatedAt)}`}</span>
                  <button type="submit" disabled={busy} className={btnPrimary} id="push-settings-save">
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save settings
                  </button>
                </div>
              </form>

              <aside className="xl:col-span-5 bg-white rounded-xl border border-slate-200 p-6 space-y-4 text-xs text-slate-600 self-start">
                <div>
                  <h2 className="font-bold text-slate-900 text-sm">One-line device setup</h2>
                  <p className="mt-1">Run the current command as administrator on each device, including devices you set up with an older script. The script enables SSH and adds the platform’s discovery marker.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-1.5"><Monitor className="w-3.5 h-3.5 text-blue-600" /> Windows 10/11 — elevated PowerShell</h3>
                  {setupScripts && <pre className="bg-slate-900 text-slate-100 rounded-lg p-2.5 text-[10px] overflow-x-auto whitespace-pre-wrap select-all">{`irm '${setupScripts.windows}' | iex`}</pre>}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-1.5"><Apple className="w-3.5 h-3.5" /> MacBook — Terminal</h3>
                  {setupScripts && <pre className="bg-slate-900 text-slate-100 rounded-lg p-2.5 text-[10px] overflow-x-auto whitespace-pre-wrap select-all">{`curl -fsSL '${setupScripts.macos}' | sudo bash`}</pre>}
                  <p className="mt-1">Follow the steps in Terminal if macOS asks you to enable Remote Login.</p>
                </div>
                {!setupScripts && <p role="status">Loading setup commands…</p>}
                <p>Save the network ranges, then select <strong>Devices → Scan now</strong>. Verify and approve each device before pushing.</p>
              </aside>
            </div>
          )}
        </div>
      </main>

      {modal === 'tour' && <OnboardingTour onClose={() => { setModal(null); markTutorialSeen(); }} />}
      {modal === 'account' && <AccountSecurityModal email={user?.email || ''} onClose={() => setModal(null)} />}
      {modal === 'users' && <UserManagementModal onClose={() => setModal(null)} />}
      {modal === 'security' && <SecurityModal onClose={() => setModal(null)} />}
      {modal === 'audit' && <AuditLogModal onClose={() => setModal(null)} />}
      {modal === 'about' && <AboutModal onClose={() => setModal(null)} />}
    </div>
  );
}
