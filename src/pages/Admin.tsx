/**
 * ==========================================
 * File: src/pages/Admin.tsx
 * Project: AdBoard V3
 * Purpose:
 * Centralised workspace dashboard for uploading advertisements,
 * updating scheduling coordinates, managing slide orders, and configuring display variables.
 * ==========================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useFirebase } from '../contexts/FirebaseContext';
import { useTheme, ThemeName } from '../contexts/ThemeContext';
import { FirebaseService } from '../services/firebaseService';
import { MediaService } from '../services/mediaService';
import { DeviceService } from '../services/deviceService';
import { isSupabaseBackend } from '../supabase/config';
import { isPlaceholder } from '../firebase/config';
import { AdMedia, DisplaySettings } from '../types';
import InfoTip from '../components/InfoTip';
import OnboardingTour from '../components/OnboardingTour';
import AccountSecurityModal from '../components/AccountSecurityModal';
import {
  LogOut, 
  UploadCloud, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Trash2, 
  Eye, 
  Settings as SettingsIcon, 
  Search, 
  Grid, 
  List, 
  Save, 
  Check, 
  X, 
  Sliders, 
  Calendar, 
  Clock, 
  CheckCircle, 
  XCircle,
  AlertCircle,
  Clock3,
  Sparkles,
  Lock as LockIcon,
  HelpCircle,
  Activity,
  Sun,
  Moon,
  Scroll,
  UserCog,
  MonitorPlay,
  GraduationCap,
  Users as UsersIcon,
  ShieldCheck,
  ScrollText,
  MessageSquarePlus,
  Info as InfoIcon
} from 'lucide-react';
import UserManagementModal from '../components/UserManagementModal';
import SecurityModal from '../components/SecurityModal';
import AuditLogModal from '../components/AuditLogModal';
import ViewersModal from '../components/ViewersModal';
import FeedbackModal from '../components/FeedbackModal';
import AboutModal from '../components/AboutModal';
import { usePageTitle } from '../hooks/usePageTitle';

const isLocalBackend = (import.meta as any).env?.VITE_LOCAL_BACKEND === 'true';

/**
 * Resolves which backend this deployment is actually connected to,
 * so the header badge reflects reality instead of always "Firebase".
 */
function getBackendInfo(): { label: string; live: boolean } {
  if (isSupabaseBackend) return { label: 'Supabase Live', live: true };
  if (isLocalBackend) return { label: 'Self-Hosted Live', live: true };
  if (isPlaceholder) return { label: 'Sandbox (Offline)', live: false };
  return { label: 'Firebase Live', live: true };
}

/** Formats accumulated display seconds as "3h 24m", "12m", or "45s". */
function formatWatchTime(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Converts an ISO/UTC timestamp to the local-time string a
 * datetime-local input expects. Using substring(0, 16) on the ISO
 * string showed UTC in a local-time field, shifting the schedule by
 * the timezone offset on every edit.
 */
function toLocalDatetimeInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Admin() {
  const navigate = useNavigate();
  usePageTitle('Admin Controls');
  const { user, isInitialising, logoutAdmin, isSuperadmin, tutorialSeen, markTutorialSeen } = useFirebase();

  // Authentication gate
  useEffect(() => {
    if (!isInitialising && !user) {
      navigate('/login');
    }
  }, [user, isInitialising, navigate]);

  // Reactive state management
  const [mediaItems, setMediaItems] = useState<AdMedia[]>([]);
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings | null>(null);
  const [playtimeStats, setPlaytimeStats] = useState<Record<string, { totalSeconds: number; screenCount: number }>>({});
  const [loading, setLoading] = useState(true);

  // Search, Filters & Organization
  const [searchQuery, setSearchQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState<'all' | 'image' | 'video'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'scheduled'>('all');
  const [sortBy, setSortBy] = useState<'sortOrder' | 'title' | 'createdAt'>('sortOrder');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Input bindings for uploading/creating
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFileName, setUploadFileName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDuration, setNewDuration] = useState<number>(8);
  const [newIsActive, setNewIsActive] = useState<boolean>(true);
  const [newSortOrder, setNewSortOrder] = useState<number>(1);
  const [newSchedStart, setNewSchedStart] = useState<string>('');
  const [newSchedEnd, setNewSchedEnd] = useState<string>('');
  
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Inline details editing mapping
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDuration, setEditDuration] = useState<number>(8);
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [editSortOrder, setEditSortOrder] = useState<number>(1);
  const [editSchedStart, setEditSchedStart] = useState<string>('');
  const [editSchedEnd, setEditSchedEnd] = useState<string>('');

  // Previews & Settings State
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'image' | 'video' | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // Theme, tutorial, account security & fallback slide state
  const { theme, setTheme } = useTheme();
  const [showTour, setShowTour] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showViewersModal, setShowViewersModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [uploadingFallback, setUploadingFallback] = useState(false);
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  const backendInfo = getBackendInfo();

  // Offer the walkthrough once per account. tutorialSeen is persisted in the
  // user's database record, so it does not reappear on a new browser/session.
  useEffect(() => {
    if (!loading && !isInitialising && user && !tutorialSeen) {
      setShowTour(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isInitialising, user, tutorialSeen]);

  const closeTour = () => {
    setShowTour(false);
    markTutorialSeen();
  };

  /**
   * Uploads the default fallback slide shown when no media is active.
   * Stored in display settings; remember to press "Sync Board settings".
   */
  const handleFallbackFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !displaySettings) return;
    setErrorMessage('');
    setUploadingFallback(true);
    try {
      MediaService.validateFile(file);
      const url = await MediaService.uploadMedia(file, user.uid);
      const type: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
      const updated = { ...displaySettings, fallbackUrl: url, fallbackType: type };
      setDisplaySettings(updated);
      await FirebaseService.updateDisplaySettings(updated, user.uid);
      setSuccessMessage("Default slide saved. It appears whenever no advertisement is active.");
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not upload the default slide.');
    } finally {
      setUploadingFallback(false);
      if (fallbackInputRef.current) fallbackInputRef.current.value = '';
    }
  };

  const handleRemoveFallback = async () => {
    if (!user || !displaySettings) return;
    const updated = { ...displaySettings, fallbackUrl: null, fallbackType: null };
    setDisplaySettings(updated);
    try {
      await FirebaseService.updateDisplaySettings(updated, user.uid);
      setSuccessMessage("Default slide removed.");
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not remove the default slide.');
    }
  };

  // Initialize data layers
  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const dbMedia = await FirebaseService.getMediaItems();
      const dbSettings = await FirebaseService.getDisplaySettings();
      setMediaItems(dbMedia);
      setDisplaySettings(dbSettings);
      // Playtime stats are best-effort decoration; never block the dashboard
      DeviceService.getPlaytimeStats().then(setPlaytimeStats).catch(() => {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user]);

  /**
   * Triggers file verification and prepares metadata
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage('');
    const file = e.target.files?.[0];
    if (file) {
      try {
        MediaService.validateFile(file);
        setSelectedFile(file);
        setUploadFileName(file.name);
        
        // Auto-assign slide name if text field is empty
        const cleanName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        if (!newTitle) {
          setNewTitle(cleanName);
        }
        
        // Auto-assign high priority sort order
        const maxOrder = mediaItems.reduce((max, item) => item.sortOrder > max ? item.sortOrder : max, 0);
        setNewSortOrder(maxOrder + 1);
      } catch (err: any) {
        setErrorMessage(err.message);
        setSelectedFile(null);
        setUploadFileName('');
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  /**
   * Handles complex multiple-state media asset compilation & uploads
   */
  const handleAdUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!selectedFile || !user) {
      setErrorMessage("Please select a valid image or video file to proceed.");
      return;
    }
    if (!newTitle.trim()) {
      setErrorMessage("Please assign an advertisement title.");
      return;
    }

    setUploadProgress(20);
    try {
      // 1. Upload bytes and fetch public URLs
      const fileUrl = await MediaService.uploadMedia(selectedFile, user.uid);
      setUploadProgress(70);

      // 2. Synthesize complete Slide Item block
      const formatType: 'image' | 'video' = selectedFile.type.startsWith('video/') ? 'video' : 'image';
      
      const newMediaNode: AdMedia = {
        id: `slide_${Date.now()}`,
        title: newTitle.trim(),
        url: fileUrl,
        type: formatType,
        mimeType: selectedFile.type,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        duration: Number(newDuration),
        isActive: newIsActive,
        sortOrder: Number(newSortOrder),
        scheduledStart: newSchedStart ? new Date(newSchedStart).toISOString() : null,
        scheduledEnd: newSchedEnd ? new Date(newSchedEnd).toISOString() : null,
        ownerId: user.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      setUploadProgress(90);

      // 3. Write structured document into database
      await FirebaseService.saveMediaItem(newMediaNode);

      // Finish state
      if (fileUrl.startsWith('blob:') || fileUrl.startsWith('data:')) {
        setSuccessMessage("Slide registered with local memory-cache URL. ⚠️ Cloud storage upload failed: please make sure the Supabase Storage bucket 'adboard-assets' exists, is marked 'Public', and has access policies configured. This slide's media will expire upon refreshing the browser.");
      } else {
        setSuccessMessage("Advertisement slide registered and published successfully!");
      }
      
      // Flush fields
      setSelectedFile(null);
      setUploadFileName('');
      setNewTitle('');
      setNewDuration(8);
      setNewIsActive(true);
      setNewSortOrder(1);
      setNewSchedStart('');
      setNewSchedEnd('');
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Reload sets
      await loadDashboardData();
    } catch (err: any) {
      setErrorMessage(err.message || 'File upload pipeline crashed. Check system permissions.');
    } finally {
      setUploadProgress(null);
    }
  };

  /**
   * Initializes edit state values
   */
  const openEditMode = (item: AdMedia) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditDuration(item.duration);
    setEditIsActive(item.isActive);
    setEditSortOrder(item.sortOrder);
    setEditSchedStart(item.scheduledStart ? toLocalDatetimeInput(item.scheduledStart) : '');
    setEditSchedEnd(item.scheduledEnd ? toLocalDatetimeInput(item.scheduledEnd) : '');
  };

  const cancelEditMode = () => {
    setEditingId(null);
  };

  /**
   * Commits media details update to Firestore
   */
  const handleSaveEdit = async (item: AdMedia) => {
    if (!editTitle.trim()) {
      alert("Title is required.");
      return;
    }

    const updatedNode: AdMedia = {
      ...item,
      title: editTitle.trim(),
      duration: Number(editDuration),
      isActive: editIsActive,
      sortOrder: Number(editSortOrder),
      scheduledStart: editSchedStart ? new Date(editSchedStart).toISOString() : null,
      scheduledEnd: editSchedEnd ? new Date(editSchedEnd).toISOString() : null,
      updatedAt: new Date().toISOString()
    };

    try {
      await FirebaseService.saveMediaItem(updatedNode);
      await loadDashboardData();
      setEditingId(null);
      setSuccessMessage("Slide preferences synchronized.");
    } catch (err: any) {
      alert(err.message || 'Update failed.');
    }
  };

  /**
   * Deletes a media asset safely
   */
  const handleDeleteAd = async (item: AdMedia) => {
    if (window.confirm(`Are you sure you want to permanently delete advertisement slide "${item.title}"?`)) {
      setSuccessMessage('');
      setErrorMessage('');
      try {
        // 1. Prune file bytes from Storage
        await MediaService.deleteMedia(item.url);
        // 2. Remove document from Firestore
        await FirebaseService.deleteMediaItem(item.id);
        
        await loadDashboardData();
        setSuccessMessage("Advertisement deleted from repository.");
      } catch (err: any) {
        setErrorMessage(err.message || 'Pruning operation blocked.');
      }
    }
  };

  /**
   * Updates display configuration properties
   */
  const handleSettingsSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displaySettings || !user) return;

    setSavingSettings(true);
    setSuccessMessage('');
    try {
      await FirebaseService.updateDisplaySettings(displaySettings, user.uid);
      setSuccessMessage("Kiosk presentation settings synchronized.");
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save configuration settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  // Sign out handler
  const handleExit = async () => {
    await logoutAdmin();
    navigate('/login');
  };

  // Search & Filter Operations
  const processedMedia = mediaItems
    .filter(item => {
      // 1. Keywords check
      const queryLower = searchQuery.toLowerCase();
      const matchesSearch = item.title.toLowerCase().includes(queryLower) || 
                            item.fileName.toLowerCase().includes(queryLower);
      
      // 2. Media Type Check
      const matchesFormat = formatFilter === 'all' || item.type === formatFilter;

      // 3. Status checks
      let matchesStatus = true;
      if (statusFilter === 'active') {
        matchesStatus = item.isActive;
      } else if (statusFilter === 'inactive') {
        matchesStatus = !item.isActive;
      } else if (statusFilter === 'scheduled') {
        matchesStatus = !!(item.scheduledStart || item.scheduledEnd);
      }

      return matchesSearch && matchesFormat && matchesStatus;
    })
    .sort((a, b) => {
      // Sort Order
      if (sortBy === 'sortOrder') {
        return a.sortOrder - b.sortOrder;
      } else if (sortBy === 'title') {
        return a.title.localeCompare(b.title);
      } else {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

  const totalAdsCount = mediaItems.length;
  const activeAdsCount = mediaItems.filter(i => i.isActive).length;
  const videoAdsCount = mediaItems.filter(i => i.type === 'video').length;

  const displayInitials = user?.email 
    ? user.email.split('@')[0].substring(0, 2).toUpperCase() 
    : 'AD';
  const displayUserName = user?.email ? user.email.split('@')[0] : 'Administrator';

  if (isInitialising || !displaySettings) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-mono text-slate-500">Synchronizing workspace console...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#F8FAFC] flex overflow-hidden font-sans text-slate-800" id="enterprise-workspace-frame">
      
      {/* Sidebar Navigation - Professional Dark Blue Slate */}
      <aside className="w-64 bg-[#0F172A] flex flex-col border-r border-slate-200 shadow-xl shrink-0">
        
        {/* Brand header panel */}
        <div className="p-6 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center font-extrabold text-white shadow-lg text-base">A3</div>
            <span className="text-white font-black text-xl tracking-tight">AdBoard V3</span>
          </div>
          <p className="text-slate-500 text-[10px] mt-1 font-bold uppercase tracking-widest leading-none">Enterprise Media Suite</p>
        </div>

        {/* Operational Indicators and links lists */}
        <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
          <div>
            <div className="text-slate-500 text-[10px] px-3 mb-2.5 font-bold uppercase tracking-wider">Management Console</div>
            <div className="space-y-1">
              <span className="flex items-center gap-3 px-3 py-2 bg-blue-600 text-white rounded-md text-sm font-medium cursor-default shadow-md shadow-blue-900/40">
                <Sliders className="w-4 h-4" />
                <span>Dashboard Admin</span>
              </span>
              <button 
                onClick={() => window.open('/', '_blank')}
                className="w-full flex items-center justify-between px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-white rounded-md text-sm font-medium transition-all text-left"
              >
                <span className="flex items-center gap-3">
                  <Eye className="w-4 h-4" />
                  <span>Interactive Board</span>
                </span>
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
              </button>
            </div>
          </div>

          {isSuperadmin && (
            <div>
              <div className="text-slate-500 text-[10px] px-3 mb-2.5 font-bold uppercase tracking-wider">Administration</div>
              <div className="space-y-1">
                <button
                  id="manage-users-btn"
                  onClick={() => setShowUsersModal(true)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-white rounded-md text-sm font-medium transition-all text-left cursor-pointer"
                >
                  <UsersIcon className="w-4 h-4" />
                  <span>Manage Users</span>
                </button>
                <button
                  id="manage-viewers-btn"
                  onClick={() => setShowViewersModal(true)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-white rounded-md text-sm font-medium transition-all text-left cursor-pointer"
                >
                  <MonitorPlay className="w-4 h-4" />
                  <span>Display Viewers</span>
                </button>
                <button
                  id="ip-security-btn"
                  onClick={() => setShowSecurityModal(true)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-white rounded-md text-sm font-medium transition-all text-left cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Access Restrictions</span>
                  <span className="ml-auto text-[8px] font-bold text-amber-300 bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 rounded uppercase tracking-wide">Beta</span>
                </button>
                <button
                  id="audit-log-btn"
                  onClick={() => setShowAuditModal(true)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-white rounded-md text-sm font-medium transition-all text-left cursor-pointer"
                >
                  <ScrollText className="w-4 h-4" />
                  <span>Audit Log</span>
                </button>
              </div>
            </div>
          )}

          <div>
            <div className="text-slate-500 text-[10px] px-3 mb-2.5 font-bold uppercase tracking-wider">Account</div>
            <div className="space-y-1">
              <button
                id="account-security-btn"
                onClick={() => setShowAccountModal(true)}
                className="w-full flex items-center gap-3 px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-white rounded-md text-sm font-medium transition-all text-left cursor-pointer"
              >
                <UserCog className="w-4 h-4" />
                <span>Account &amp; Security</span>
              </button>
              <button
                id="show-tutorial-btn"
                onClick={() => setShowTour(true)}
                className="w-full flex items-center gap-3 px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-white rounded-md text-sm font-medium transition-all text-left cursor-pointer"
              >
                <GraduationCap className="w-4 h-4" />
                <span>Show Tutorial</span>
              </button>
              <button
                id="send-feedback-btn"
                onClick={() => setShowFeedbackModal(true)}
                className="w-full flex items-center gap-3 px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-white rounded-md text-sm font-medium transition-all text-left cursor-pointer"
              >
                <MessageSquarePlus className="w-4 h-4" />
                <span>Send Feedback</span>
                <span className="ml-auto text-[8px] font-bold text-amber-300 bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 rounded uppercase tracking-wide">Beta</span>
              </button>
              <button
                id="about-btn"
                onClick={() => setShowAboutModal(true)}
                className="w-full flex items-center gap-3 px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-white rounded-md text-sm font-medium transition-all text-left cursor-pointer"
              >
                <InfoIcon className="w-4 h-4" />
                <span>About AdBoard</span>
              </button>
            </div>
          </div>
        </nav>

        {/* User context card anchor */}
        <div className="p-4 border-t border-slate-800 bg-[#1E293B] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500 text-white font-extrabold flex items-center justify-center border border-slate-700 shadow-md">
              {displayInitials}
            </div>
            <div className="truncate flex-1">
              <div className="text-xs font-bold text-white truncate max-w-[140px]" title={user?.email || ''}>
                {displayUserName}
              </div>
              <div className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">Master Admin</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Workspace Frame */}
      <main className="flex-1 flex flex-col overflow-hidden">
        
        {/* Top Header Panel */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-4">
            <div className="text-xs text-slate-400 font-mono flex items-center gap-2">
              <span className="hover:text-blue-600 transition-colors cursor-pointer font-bold uppercase">Console</span>
              <span className="text-slate-300 italic">/</span>
              <span className="text-slate-900 font-bold uppercase tracking-tight">Enterprise Dashboard</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Theme switcher */}
            <div className="flex items-center gap-0.5 bg-slate-100 border border-slate-200 rounded-full p-0.5" id="theme-switcher">
              {([
                { name: 'light' as ThemeName, icon: <Sun className="w-3.5 h-3.5" />, hint: 'Light theme' },
                { name: 'dark' as ThemeName, icon: <Moon className="w-3.5 h-3.5" />, hint: 'Dark theme' },
                { name: 'paper' as ThemeName, icon: <Scroll className="w-3.5 h-3.5" />, hint: 'Paper theme' }
              ]).map(({ name, icon, hint }) => (
                <button
                  key={name}
                  onClick={() => setTheme(name)}
                  title={hint}
                  className={`p-1.5 rounded-full cursor-pointer transition-colors ${
                    theme === name ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                  id={`theme-${name}-btn`}
                >
                  {icon}
                </button>
              ))}
            </div>

            {/* Live backend badge (senses the active hosting mode automatically) */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${
              backendInfo.live
                ? 'bg-emerald-50 border-emerald-100'
                : 'bg-amber-50 border-amber-200'
            }`} id="backend-badge">
              <div className={`w-2 h-2 rounded-full animate-pulse ${backendInfo.live ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${backendInfo.live ? 'text-emerald-800' : 'text-amber-900'}`}>
                {backendInfo.label}
              </span>
              <InfoTip text={
                backendInfo.live
                  ? `This deployment is connected to ${backendInfo.label.replace(' Live', '')} for storage and sign-in. Changes you save here are published to the live display.`
                  : 'No cloud backend is configured, so everything is stored only in this browser. Connect Firebase, Supabase, or run the Docker server to go live.'
              } />
            </div>

            {/* Logout Action */}
            <button
              id="logout-btn"
              onClick={handleExit}
              className="bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-650 hover:text-red-700 px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        {/* Content canvas container */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">

          {/* Quick Stats Metrics Bars */}
          <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs transition-transform duration-250 hover:scale-[1.01]">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                Registered Items
                <InfoTip text="Total number of slides uploaded to this board, whether they are currently shown or not." />
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 font-display">{totalAdsCount}</span>
                <span className="text-[11px] font-semibold text-blue-600">{activeAdsCount} active</span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono mt-1">Ready for public rotation</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs transition-transform duration-250 hover:scale-[1.01]">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                Rotation Speed
                <InfoTip text="How long each slide stays on screen when it has no duration of its own. Change it in Kiosk Display Parameters." />
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 font-display">
                  {displaySettings.autoplaySeconds} <span className="text-sm font-semibold">sec</span>
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full"
                  style={{ width: `${Math.min((displaySettings.autoplaySeconds / 60) * 100, 100)}%` }}
                />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs transition-transform duration-250 hover:scale-[1.01]">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                Video Portions
                <InfoTip text="Number of video slides. A video plays to its end and then advances automatically, ignoring the rotation timer." />
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 font-display">{videoAdsCount}</span>
                <span className="text-[11px] font-bold text-indigo-600 uppercase">Self-Guided</span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono mt-1">Ends advance slide trigger</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs transition-transform duration-250 hover:scale-[1.01]">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                Backend Mode
                <InfoTip text="Where this deployment stores its data and accounts. Detected automatically from the build configuration." />
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-black text-slate-900 font-display">{backendInfo.label.replace(' Live', '').replace(' (Offline)', '')}</span>
                <span className={`text-[10px] font-semibold uppercase flex items-center gap-0.5 ${backendInfo.live ? 'text-emerald-600' : 'text-amber-600'}`}>
                  <Activity className="w-3 h-3 animate-pulse" /> {backendInfo.live ? 'Connected' : 'Offline'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                {backendInfo.live ? 'Changes publish to the live display' : 'Data stays in this browser only'}
              </p>
            </div>

          </section>

          {/* Big Content Splitting Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Box: Active Media Gallery List/Grid (Large block) */}
            <div className="lg:col-span-8 flex flex-col space-y-4">
              
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
                
                {/* Search Bar & Layout Toggle */}
                <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-center gap-3 justify-between">
                  <div className="mb-2 md:mb-0">
                    <h3 className="font-bold text-slate-900 text-sm tracking-tight">Primary Media Gallery</h3>
                    <p className="text-[11px] text-slate-500">View, manipulate, sequence, or edit active signage resources.</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
                    
                    {/* Filter Mode selection dropdown */}
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-1">
                      <button
                        onClick={() => setFormatFilter('all')}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer transition-colors ${formatFilter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setFormatFilter('image')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${formatFilter === 'image' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        <ImageIcon className="w-3 h-3 text-blue-500" />
                        Images
                      </button>
                      <button
                        onClick={() => setFormatFilter('video')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${formatFilter === 'video' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        <VideoIcon className="w-3 h-3 text-purple-500" />
                        Videos
                      </button>
                    </div>

                    {/* Sorting criteria */}
                    <select
                      className="bg-white border border-slate-200 text-[10px] text-slate-700 px-2.5 py-1.5 rounded-lg focus:outline-none cursor-pointer font-bold shadow-xs"
                      value={sortBy}
                      onChange={(e: any) => setSortBy(e.target.value)}
                    >
                      <option value="sortOrder">Sort Priority Index</option>
                      <option value="title">Alphabetical (A-Z)</option>
                      <option value="createdAt">Date Uploaded</option>
                    </select>

                    {/* View Modes Toggle */}
                    <div className="border border-slate-200 rounded-lg p-1 bg-white flex shadow-xs">
                      <button
                        onClick={() => setViewMode('grid')}
                        className={`p-1 rounded cursor-pointer ${viewMode === 'grid' ? 'bg-slate-100 text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'}`}
                        title="Grid View Mode"
                      >
                        <Grid className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setViewMode('list')}
                        className={`p-1 rounded cursor-pointer ${viewMode === 'list' ? 'bg-slate-100 text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'}`}
                        title="List View Mode"
                      >
                        <List className="w-3.5 h-3.5" />
                      </button>
                    </div>

                  </div>
                </div>

                {/* Second tier filters / query row */}
                <div className="px-5 py-3 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between gap-3 bg-white">
                  <div className="relative w-full md:w-80 shrink-0">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                      <Search className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="text"
                      placeholder="Search advertisements by title or raw filename..."
                      className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 placeholder-slate-400 transition-colors shadow-xs"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <div className="flex gap-1.5 items-center flex-wrap justify-end">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mr-1 font-mono">Status check:</span>
                    {(['all', 'active', 'inactive', 'scheduled'] as const).map(tag => (
                      <button
                        key={tag}
                        onClick={() => setStatusFilter(tag)}
                        className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider cursor-pointer border transition-all ${
                          statusFilter === tag 
                            ? 'bg-blue-600 text-white border-blue-500 shadow-xs' 
                            : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Media representation block */}
                <div className="p-6 bg-slate-50/30">
                  {processedMedia.length === 0 ? (
                    <div className="border border-dashed border-slate-200 bg-white rounded-xl py-12 px-6 text-center text-slate-400 max-w-lg mx-auto">
                      <ImageIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <h4 className="font-bold text-slate-800 text-sm mb-1">No Signage Matches Found</h4>
                      <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                        Verify query parameters, active status toggles, or drop a new visual file using the uploader form.
                      </p>
                    </div>
                  ) : viewMode === 'grid' ? (
                    
                    /* GRID LAYOUT */
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {processedMedia.map((item) => {
                        const isEditing = editingId === item.id;
                        
                        return (
                          <div 
                            key={item.id} 
                            className={`bg-white border rounded-xl overflow-hidden shadow-xs transition-all flex flex-col ${
                              isEditing ? 'border-blue-500 ring-2 ring-blue-50' : 'border-slate-200 hover:border-slate-350 hover:shadow-md'
                            }`}
                          >
                            {/* Thumbnail overlay */}
                            <div className="h-36 bg-[#090D16] flex items-center justify-center relative overflow-hidden group shrink-0">
                              {item.type === 'video' ? (
                                <div className="relative w-full h-full">
                                  <video 
                                    src={item.url} 
                                    muted 
                                    playsInline 
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                    <VideoIcon className="w-8 h-8 text-white/90" />
                                  </div>
                                </div>
                              ) : (
                                <img 
                                  src={item.url} 
                                  alt={item.title} 
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              )}

                              {/* Hover to quick inspect trigger */}
                              <button
                                onClick={() => {
                                  setPreviewUrl(item.url);
                                  setPreviewType(item.type);
                                }}
                                className="absolute top-2 right-2 bg-[#0F172A]/90 border border-slate-700/80 p-1.5 rounded-lg text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity hover:text-white cursor-pointer"
                                title="Enlarge item"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {/* Bottom labels */}
                              <div className="absolute bottom-2 left-2 flex gap-1.5 items-center">
                                <span className="bg-slate-950/80 text-[10px] font-mono text-slate-300 px-2 py-0.5 rounded-md flex items-center gap-1 font-semibold">
                                  {item.type === 'video' ? <VideoIcon className="w-2.5 h-2.5 text-blue-400" /> : <ImageIcon className="w-2.5 h-2.5 text-blue-400" />}
                                  {item.type.toUpperCase()}
                                </span>
                                
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md uppercase font-bold flex items-center gap-1 ${
                                  item.isActive 
                                    ? 'bg-emerald-950/95 text-emerald-300 border border-emerald-800' 
                                    : 'bg-red-950/95 text-red-300 border border-red-800'
                                }`}>
                                  {item.isActive ? <Check className="w-2.5 h-2.5 stroke-[3px]" /> : <X className="w-2.5 h-2.5" />}
                                  {item.isActive ? 'Active' : 'Muted'}
                                </span>
                              </div>
                            </div>

                            {/* Details text panel */}
                            <div className="p-4 flex-1 flex flex-col justify-between bg-white text-slate-800">
                              {isEditing ? (
                                /* EDIT COMPONENT FORM IN GRID */
                                <div className="space-y-3 flex-1">
                                  <div>
                                    <label className="block text-[10px] text-slate-500 font-bold mb-1 uppercase font-mono">Title</label>
                                    <input
                                      type="text"
                                      className="w-full bg-white border border-blue-500 rounded px-2.5 py-1 text-xs font-semibold text-slate-900 focus:outline-none"
                                      value={editTitle}
                                      onChange={(e) => setEditTitle(e.target.value)}
                                    />
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-[10px] text-slate-500 font-bold mb-0.5 uppercase font-mono">Sec Duration</label>
                                      <input
                                        type="number"
                                        className="w-full bg-white border border-slate-250 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:border-blue-500"
                                        value={editDuration}
                                        onChange={(e) => setEditDuration(Number(e.target.value))}
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] text-slate-500 font-bold mb-0.5 uppercase font-mono">Sort Priority</label>
                                      <input
                                        type="number"
                                        className="w-full bg-white border border-slate-250 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:border-blue-500"
                                        value={editSortOrder}
                                        onChange={(e) => setEditSortOrder(Number(e.target.value))}
                                      />
                                    </div>
                                  </div>

                                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/60 space-y-2">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono flex items-center gap-1">
                                      <Calendar className="w-2.5 h-2.5" /> Temporal Schedules
                                      <InfoTip text="Times are in your local timezone. The slide only plays between the start and end moments; clear both fields to show it continuously." />
                                    </span>
                                    <div className="grid grid-cols-2 gap-1 px-1">
                                      <div>
                                        <label className="block text-[8px] text-slate-450 uppercase font-bold">Start Time</label>
                                        <input
                                          type="datetime-local"
                                          className="w-full bg-white border border-slate-200 rounded text-[9px] px-1 py-0.5"
                                          value={editSchedStart}
                                          onChange={(e) => setEditSchedStart(e.target.value)}
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[8px] text-slate-450 uppercase font-bold text-slate-450">End Expiry</label>
                                        <input
                                          type="datetime-local"
                                          className="w-full bg-white border border-slate-200 rounded text-[9px] px-1 py-0.5"
                                          value={editSchedEnd}
                                          onChange={(e) => setEditSchedEnd(e.target.value)}
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between py-1 border-t border-slate-100">
                                    <span className="text-[10px] text-slate-600 font-bold uppercase font-mono">Active Slide status</span>
                                    <button
                                      type="button"
                                      onClick={() => setEditIsActive(!editIsActive)}
                                      className={`w-8 h-4.5 rounded-full p-0.5 transition-colors cursor-pointer ${editIsActive ? 'bg-blue-600' : 'bg-slate-300'}`}
                                    >
                                      <div className={`bg-white w-3.5 h-3.5 rounded-full shadow-sm transition-transform ${editIsActive ? 'translate-x-3.5' : 'translate-x-0'}`} />
                                    </button>
                                  </div>

                                  <div className="flex gap-2 pt-2 border-t border-slate-105">
                                    <button
                                      onClick={() => handleSaveEdit(item)}
                                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 rounded-lg text-xs flex items-center justify-center gap-1 cursor-pointer"
                                    >
                                      <Check className="w-3.5 h-3.5 stroke-[2.5px]" />
                                      <span>Apply Update</span>
                                    </button>
                                    <button
                                      onClick={cancelEditMode}
                                      className="px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 rounded-lg text-xs flex items-center justify-center cursor-pointer font-bold"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                /* STANDARD PREVIEW CARD GRID */
                                <div className="space-y-4 flex-1 flex flex-col justify-between text-slate-800">
                                  <div>
                                    <div className="flex justify-between items-start gap-1">
                                      <h4 className="text-xs font-bold text-slate-900 tracking-tight truncate max-w-[190px]" title={item.title}>
                                        {item.title}
                                      </h4>
                                      <span className="text-[9px] font-mono text-slate-400 font-bold bg-slate-100 px-1.5 py-0.5 rounded">Priority Index: #{item.sortOrder}</span>
                                    </div>
                                    <p className="text-[9px] text-slate-400 font-mono truncate mt-0.5" title={item.fileName}>
                                      {item.fileName}
                                    </p>
                                  </div>

                                  <div className="space-y-1.5 border-t border-b border-slate-100 py-2.5">
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-slate-500 font-medium flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-blue-500" /> Airtime Duration
                                      </span>
                                      <span className="font-bold text-slate-800">{item.duration}s</span>
                                    </div>

                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-slate-500 font-medium">Bytes Sizing</span>
                                      <span className="font-mono text-slate-600 text-[9px]">{(item.fileSize / (1024 * 1024)).toFixed(2)} MB</span>
                                    </div>

                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-slate-500 font-medium flex items-center gap-1">
                                        <Activity className="w-3 h-3 text-emerald-500" /> Air Time
                                        <InfoTip text="Total time this slide has actually been on screen, and on how many different displays. Updates about once a minute." />
                                      </span>
                                      <span className="font-bold text-slate-800">
                                        {playtimeStats[item.id]
                                          ? `${formatWatchTime(playtimeStats[item.id].totalSeconds)} · ${playtimeStats[item.id].screenCount} screen${playtimeStats[item.id].screenCount === 1 ? '' : 's'}`
                                          : 'Not shown yet'}
                                      </span>
                                    </div>

                                    {(item.scheduledStart || item.scheduledEnd) && (
                                      <div className="mt-1.5 bg-blue-50/50 border border-blue-100 rounded-lg p-2 text-[9px] leading-relaxed text-blue-700">
                                        <span className="font-bold flex items-center gap-1 text-[8px] font-mono uppercase tracking-wider mb-0.5">
                                          <Calendar className="w-2.5 h-2.5" /> Conditional Airtime Window
                                        </span>
                                        {item.scheduledStart && <p>Start: {new Date(item.scheduledStart).toLocaleDateString()} {new Date(item.scheduledStart).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>}
                                        {item.scheduledEnd && <p>End: {new Date(item.scheduledEnd).toLocaleDateString()} {new Date(item.scheduledEnd).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>}
                                      </div>
                                    )}
                                  </div>

                                  {/* Bottom controls */}
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => openEditMode(item)}
                                      className="flex-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-350 rounded-lg py-1.5 text-[10px] font-bold text-slate-700 flex items-center justify-center gap-1 transition-all cursor-pointer"
                                    >
                                      <SettingsIcon className="w-3 h-3" />
                                      <span>Adjust Settings</span>
                                    </button>
                                    
                                    <button
                                      onClick={() => handleDeleteAd(item)}
                                      className="px-2.5 bg-red-50 hover:bg-red-100 border border-red-100 hover:border-red-200 rounded-lg py-1.5 text-red-650 hover:text-red-700 transition-colors cursor-pointer"
                                      title="Prune Advertisement"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 stroke-[2px]" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    
                    /* LIST LAYOUT (CRISP TABULAR ROWS) */
                    <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-xs">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-150 text-slate-500 font-bold font-mono">
                            <th className="px-5 py-3 tracking-wider text-[10px] uppercase">Index</th>
                            <th className="px-5 py-3 tracking-wider text-[10px] uppercase">Advertisement Details</th>
                            <th className="px-5 py-3 tracking-wider text-[10px] uppercase">Format</th>
                            <th className="px-5 py-3 tracking-wider text-[10px] uppercase">Duration</th>
                            <th className="px-5 py-3 tracking-wider text-[10px] uppercase">Sizing</th>
                            <th className="px-5 py-3 tracking-wider text-[10px] uppercase">Timing Schedule</th>
                            <th className="px-5 py-3 tracking-wider text-[10px] uppercase text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {processedMedia.map((item) => {
                            const isEditing = editingId === item.id;
                            
                            return (
                              <tr key={item.id} className="hover:bg-slate-50/70 transition-colors font-sans">
                                
                                {/* Priority order index */}
                                <td className="px-5 py-4 font-black text-blue-600 font-mono text-xs">
                                  {isEditing ? (
                                    <input 
                                      type="number" 
                                      className="w-12 bg-white border border-blue-500 rounded px-1.5 py-0.5 text-xs font-bold focus:outline-none" 
                                      value={editSortOrder}
                                      onChange={(e) => setEditSortOrder(Number(e.target.value))}
                                    />
                                  ) : (
                                    `#${item.sortOrder}`
                                  )}
                                </td>
                                
                                {/* Title and identifier */}
                                <td className="px-5 py-4 max-w-xs">
                                  {isEditing ? (
                                    <input 
                                      type="text" 
                                      className="w-full bg-white border border-blue-500 rounded px-2.5 py-1 text-xs font-semibold focus:outline-none" 
                                      value={editTitle}
                                      onChange={(e) => setEditTitle(e.target.value)}
                                    />
                                  ) : (
                                    <div>
                                      <p className="font-bold text-slate-900 tracking-tight">{item.title}</p>
                                      <p className="text-[10px] text-slate-400 font-mono truncate max-w-xs">{item.fileName}</p>
                                      {playtimeStats[item.id] && (
                                        <p className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                                          Aired {formatWatchTime(playtimeStats[item.id].totalSeconds)} on {playtimeStats[item.id].screenCount} screen{playtimeStats[item.id].screenCount === 1 ? '' : 's'}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </td>

                                {/* Classification type */}
                                <td className="px-5 py-4">
                                  <span className={`px-2 py-0.5 inline-flex items-center gap-1 rounded text-[10px] uppercase font-mono font-bold border ${
                                    item.type === 'video' 
                                      ? 'bg-purple-50 text-purple-700 border-purple-100' 
                                      : 'bg-blue-50 text-blue-700 border-blue-100'
                                  }`}>
                                    {item.type === 'video' ? <VideoIcon className="w-2.5 h-2.5" /> : <ImageIcon className="w-2.5 h-2.5" />}
                                    {item.type}
                                  </span>
                                </td>

                                {/* Duration */}
                                <td className="px-5 py-4">
                                  {isEditing ? (
                                    <input 
                                      type="number" 
                                      className="w-16 bg-white border border-blue-500 rounded px-1.5 py-0.5 text-xs font-bold focus:outline-none" 
                                      value={editDuration}
                                      onChange={(e) => setEditDuration(Number(e.target.value))}
                                    />
                                  ) : (
                                    <span className="font-bold text-slate-800">{item.duration}s</span>
                                  )}
                                </td>

                                {/* File size MB */}
                                <td className="px-5 py-4 text-slate-500 font-mono text-[10px]">
                                  {(item.fileSize / (1024 * 1024)).toFixed(2)} MB
                                </td>

                                {/* Temporal scheduler check */}
                                <td className="px-5 py-4">
                                  {isEditing ? (
                                    <div className="flex flex-col gap-1 w-32 bg-slate-50 p-1 rounded border">
                                      <input type="datetime-local" className="bg-white border rounded text-[9px] px-1" value={editSchedStart} onChange={(e) => setEditSchedStart(e.target.value)} />
                                      <input type="datetime-local" className="bg-white border rounded text-[9px] px-1" value={editSchedEnd} onChange={(e) => setEditSchedEnd(e.target.value)} />
                                    </div>
                                  ) : (
                                    item.scheduledStart || item.scheduledEnd ? (
                                      <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100 text-[10px] font-bold flex items-center gap-1 w-max">
                                        <Calendar className="w-3 h-3" /> Scheduled
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 text-[10px] font-medium italic">Continuous deployment</span>
                                    )
                                  )}
                                </td>

                                {/* Sub actions */}
                                <td className="px-5 py-4 text-right">
                                  {isEditing ? (
                                    <div className="flex gap-1.5 justify-end">
                                      <button onClick={() => handleSaveEdit(item)} className="p-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-xs cursor-pointer">
                                        <Check className="w-3.5 h-3.5 stroke-[2.5px]" />
                                      </button>
                                      <button onClick={cancelEditMode} className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg border border-slate-200 cursor-pointer">
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex gap-2 justify-end">
                                      <button onClick={() => { setPreviewUrl(item.url); setPreviewType(item.type); }} className="p-1.5 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 rounded-lg border border-slate-200 shadow-xs cursor-pointer" title="Preview advertisement larger">
                                        <Eye className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={() => openEditMode(item)} className="p-1.5 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-850 rounded-lg border border-slate-200 shadow-xs cursor-pointer" title="Adjust properties">
                                        <SettingsIcon className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={() => handleDeleteAd(item)} className="p-1.5 bg-red-50 hover:bg-red-100 text-red-650 hover:text-red-700 rounded-lg border border-red-100 cursor-pointer" title="Prune row">
                                        <Trash2 className="w-3.5 h-3.5 stroke-[2px]" />
                                      </button>
                                    </div>
                                  )}
                                </td>

                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>

            </div>

            {/* Right Box: Setup Form & Kiosk Settings Panel (Columns setup) */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* Upload Panel */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
                <h3 className="font-bold text-slate-900 text-sm tracking-tight border-b border-slate-100 pb-3 mb-4 flex items-center gap-2">
                  <UploadCloud className="w-4 h-4 text-blue-600" />
                  Publish advertisement
                </h3>

                {errorMessage && (
                  <div className="mb-4 bg-red-50 border border-red-100 text-red-700 text-xs rounded-lg p-3 flex items-start gap-2 font-medium" id="upload-err">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {successMessage && (
                  <div className="mb-4 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs rounded-lg p-3 flex items-start gap-2 font-medium" id="upload-ok">
                    <Check className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
                    <span>{successMessage}</span>
                  </div>
                )}

                <form onSubmit={handleAdUpload} className="space-y-4">
                  
                  {/* File zone uploader */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 font-mono">Media Source File</label>
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-200 hover:border-blue-500 rounded-lg p-4 text-center cursor-pointer bg-slate-50 hover:bg-[#F8FAFC] transition-colors group"
                    >
                      <input 
                        type="file" 
                        className="hidden" 
                        ref={fileInputRef} 
                        accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.webm" 
                        onChange={handleFileChange}
                      />
                      <UploadCloud className="w-8 h-8 text-slate-400 group-hover:text-blue-500 mx-auto mb-2 transition-colors" />
                      {uploadFileName ? (
                        <div className="space-y-1">
                          <p className="text-xs text-blue-600 font-mono font-bold truncate max-w-[220px] mx-auto">
                            {uploadFileName}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            Click to change source media
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-xs font-bold text-slate-700">Drag or click to choose resource file</p>
                          <p className="text-[9px] text-slate-400 mt-1 leading-normal font-mono">
                            Supports JPEGs, PNGs, GIFs, WEBPs (&lt;20MB)<br />
                            And MP4s, MOVs, WEBM videos (&lt;500MB)
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Title field */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 font-mono" htmlFor="ad-title">
                      Signage Title
                    </label>
                    <input
                      id="ad-title"
                      type="text"
                      placeholder="e.g. Winter Break Announcement"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 font-semibold focus:outline-none focus:border-blue-500 placeholder-slate-400 transition-colors shadow-xs"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                    />
                  </div>

                  {/* Settings grids */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1 font-mono" htmlFor="ad-duration">
                        Rotation (sec)
                        <InfoTip text="How many seconds this slide stays on screen before the next one appears. Videos ignore this and play to the end." />
                      </label>
                      <input
                        id="ad-duration"
                        type="number"
                        min="1"
                        max="120"
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-850 font-bold focus:outline-none focus:border-blue-500 shadow-xs"
                        value={newDuration}
                        onChange={(e) => setNewDuration(Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1 font-mono" htmlFor="ad-sort">
                        Sort Priority
                        <InfoTip text="The playback order. Slides run from the lowest number to the highest, then loop." />
                      </label>
                      <input
                        id="ad-sort"
                        type="number"
                        min="1"
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-850 font-bold focus:outline-none focus:border-blue-500 shadow-xs"
                        value={newSortOrder}
                        onChange={(e) => setNewSortOrder(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  {/* Temporal Scheduler Inputs */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-150 space-y-3">
                    <span className="text-[10px] font-mono text-blue-600 font-bold uppercase block flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" /> Configure Airtime Ranges
                      <InfoTip text="Optional campaign window in your local time. The slide only appears between the start and end moments; leave both blank to show it always." />
                    </span>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-450 uppercase mb-1 font-mono" htmlFor="sched-start">Range Start</label>
                        <input
                          id="sched-start"
                          type="datetime-local"
                          className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[10px] font-semibold text-slate-700 focus:outline-none"
                          value={newSchedStart}
                          onChange={(e) => setNewSchedStart(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-450 uppercase mb-1 font-mono" htmlFor="sched-end">Range End</label>
                        <input
                          id="sched-end"
                          type="datetime-local"
                          className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[10px] font-semibold text-slate-700 focus:outline-none"
                          value={newSchedEnd}
                          onChange={(e) => setNewSchedEnd(e.target.value)}
                        />
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-400 leading-normal font-sans">
                      Leave dates blank dry-runs continuously. If specified, this slide is excluded dynamically checkout times outside ranges.
                    </p>
                  </div>

                  {/* Immediate Switch activator */}
                  <div className="flex items-center justify-between py-1 border-t border-slate-100">
                    <span className="text-xs font-semibold text-slate-700">
                      Set active immediately
                      <InfoTip text="On: the slide joins the display rotation as soon as it is uploaded. Off: it is saved as Muted so you can publish it later." />
                    </span>
                    <button
                      type="button"
                      id="ad-active-toggle"
                      onClick={() => setNewIsActive(!newIsActive)}
                      className={`w-10 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${newIsActive ? 'bg-blue-600' : 'bg-slate-300'}`}
                    >
                      <div className={`bg-white w-4 h-4 rounded-full shadow-md transition-transform ${newIsActive ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {uploadProgress !== null ? (
                    <div className="space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200 font-mono text-[10px]">
                      <div className="flex justify-between text-blue-600 font-bold">
                        <span>Uploading byte payload...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                      </div>
                    </div>
                  ) : (
                    <button
                      id="upload-submit-btn"
                      type="submit"
                      disabled={!selectedFile}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold py-2 rounded-lg transition-colors text-xs flex items-center justify-center gap-1.5 shadow-sm shadow-blue-100 cursor-pointer"
                    >
                      <UploadCloud className="w-4 h-4" />
                      <span>Register Visual Resource</span>
                    </button>
                  )}
                </form>

              </div>

              {/* Configuration Settings Panel */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
                <h3 className="font-bold text-slate-900 text-sm tracking-tight border-b border-slate-100 pb-3 mb-4 flex items-center gap-2">
                  <SettingsIcon className="w-4 h-4 text-blue-600" />
                  Kiosk Display Parameters
                </h3>

                <form onSubmit={handleSettingsSave} className="space-y-4">
                  
                  {/* Default Timing Autoplay view */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1 font-mono" htmlFor="autoplay-seconds">
                      Fallback Interval (sec)
                      <InfoTip text="Default on-screen time for slides that do not set their own duration." />
                    </label>
                    <input
                      id="autoplay-seconds"
                      type="number"
                      min="2"
                      max="300"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-850 font-bold focus:outline-none focus:border-blue-500 shadow-xs"
                      value={displaySettings.autoplaySeconds}
                      onChange={(e) => setDisplaySettings({
                        ...displaySettings,
                        autoplaySeconds: Number(e.target.value)
                      })}
                    />
                  </div>

                  {/* Animations types */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 font-mono">
                      Carousel Transition Animation
                      <InfoTip text="The visual effect used when the display switches from one slide to the next." />
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['fade', 'slide', 'zoom'] as const).map((effect) => (
                        <button
                          type="button"
                          key={effect}
                          onClick={() => setDisplaySettings({
                            ...displaySettings,
                            transitionEffect: effect
                          })}
                          className={`py-1.5 rounded-lg text-xs font-bold border capitalize cursor-pointer transition-colors ${
                            displaySettings.transitionEffect === effect 
                              ? 'bg-blue-600 border-blue-650 text-white shadow-xs' 
                              : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {effect}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Default fallback slide (shown when nothing is scheduled) */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                    <span className="text-[10px] font-mono text-blue-600 font-bold uppercase flex items-center gap-1">
                      <MonitorPlay className="w-3.5 h-3.5" /> Default Slide
                      <InfoTip text="A standby image or video the display shows whenever no advertisement is active — instead of the 'no advertisements' notice." />
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      ref={fallbackInputRef}
                      accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.webm"
                      onChange={handleFallbackFileChange}
                    />
                    {displaySettings.fallbackUrl ? (
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-10 bg-black rounded-md overflow-hidden border border-slate-200 shrink-0">
                          {displaySettings.fallbackType === 'video' ? (
                            <video src={displaySettings.fallbackUrl} muted playsInline className="w-full h-full object-cover" />
                          ) : (
                            <img src={displaySettings.fallbackUrl} alt="Default slide" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-bold text-slate-700 block">Standby {displaySettings.fallbackType} set</span>
                          <span className="text-[9px] text-slate-400 font-mono block truncate">{displaySettings.fallbackUrl}</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemoveFallback}
                          className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-100 rounded-lg cursor-pointer shrink-0"
                          title="Remove default slide"
                          id="remove-fallback-btn"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fallbackInputRef.current?.click()}
                        disabled={uploadingFallback}
                        className="w-full border border-dashed border-slate-300 hover:border-blue-500 text-slate-500 hover:text-blue-600 rounded-lg py-2 text-[10px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors bg-white"
                        id="upload-fallback-btn"
                      >
                        <UploadCloud className="w-3.5 h-3.5" />
                        {uploadingFallback ? 'Uploading default slide...' : 'Upload a default slide'}
                      </button>
                    )}
                  </div>

                  {/* Kiosk Mode lockdown checkbox */}
                  <div className="flex items-center justify-between py-2.5 border-t border-b border-slate-100">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        Kiosk Lockout Enforcement
                        <InfoTip text="On: the public display hides its admin shortcuts and controls. A hidden hotspot in the top-left corner still lets you reach the login page." />
                      </span>
                      <span className="text-[10px] text-slate-400 block leading-tight">Hides navigation HUD unless hovered</span>
                    </div>
                    <button
                      type="button"
                      id="kiosk-lock-toggle"
                      onClick={() => setDisplaySettings({
                        ...displaySettings,
                        kioskMode: !displaySettings.kioskMode
                      })}
                      className={`w-10 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${displaySettings.kioskMode ? 'bg-blue-600' : 'bg-slate-300'}`}
                    >
                      <div className={`bg-white w-4 h-4 rounded-full shadow-md transition-transform ${displaySettings.kioskMode ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <button
                    id="save-settings-btn"
                    type="submit"
                    disabled={savingSettings}
                    className="w-full bg-[#0F172A] hover:bg-black text-white font-bold py-2 rounded-lg transition-all text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                  >
                    {savingSettings ? (
                      <span>Syncing configurations...</span>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Sync Board settings</span>
                      </>
                    )}
                  </button>

                </form>

              </div>

            </div>

          </div>

        </div>

      </main>

      {/* Slide Visual Lightbox Portal Modal */}
      {previewUrl && (
        <div className="fixed inset-0 bg-slate-950/95 p-8 flex flex-col items-center justify-center z-50 animate-fade-in font-sans">
          
          {/* Close button */}
          <button
            onClick={() => { setPreviewUrl(null); setPreviewType(null); }}
            className="absolute top-4 right-4 bg-slate-900 border border-slate-700 hover:border-slate-500 p-2 rounded-full text-slate-300 hover:text-white transition-colors cursor-pointer shadow-lg"
          >
            <X className="w-6 h-6 stroke-[2.5px]" />
          </button>

          <div className="max-w-4xl max-h-[80vh] w-full h-full flex items-center justify-center rounded-2xl overflow-hidden bg-black border border-slate-800">
            {previewType === 'video' ? (
              <video 
                src={previewUrl} 
                className="max-w-full max-h-full" 
                controls 
                autoPlay 
              />
            ) : (
              <img 
                src={previewUrl} 
                className="max-w-full max-h-full object-contain" 
                alt="Enlarged Signage Advertisement"
                referrerPolicy="no-referrer"
              />
            )}
          </div>
          <p className="text-slate-400 text-[10px] font-mono mt-4 select-all">
            Media reference link: <span className="text-blue-400 underline">{previewUrl}</span>
          </p>
        </div>
      )}

      {/* First-run walkthrough (skippable, replayable from the sidebar).
          Closing it persists the "seen" flag to the user's account. */}
      {showTour && <OnboardingTour onClose={closeTour} />}

      {/* Profile & security controls */}
      {showAccountModal && (
        <AccountSecurityModal
          email={user?.email || ''}
          onClose={() => setShowAccountModal(false)}
        />
      )}

      {/* Superadmin-only administration surfaces */}
      {showUsersModal && isSuperadmin && (
        <UserManagementModal onClose={() => setShowUsersModal(false)} />
      )}
      {showSecurityModal && isSuperadmin && (
        <SecurityModal userId={user?.uid || ''} onClose={() => setShowSecurityModal(false)} />
      )}
      {showViewersModal && isSuperadmin && (
        <ViewersModal userId={user?.uid || ''} onClose={() => setShowViewersModal(false)} />
      )}
      {showAuditModal && isSuperadmin && (
        <AuditLogModal onClose={() => setShowAuditModal(false)} />
      )}

      {/* Feedback → GitHub issue (available to any admin) */}
      {showFeedbackModal && (
        <FeedbackModal defaultEmail={user?.email || ''} onClose={() => setShowFeedbackModal(false)} />
      )}

      {/* About: license, open-source profile, usage & privacy */}
      {showAboutModal && <AboutModal onClose={() => setShowAboutModal(false)} />}

    </div>
  );
}
