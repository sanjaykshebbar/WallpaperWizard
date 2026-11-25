/**
 * ==========================================
 * File: src/pages/DisplayBoard.tsx
 * Project: AdBoard V3
 * Purpose:
 * Clean, immersive public presentation kiosk rendering active advertisements,
 * validating timing intervals, and autoplaying videos.
 * ==========================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FirebaseService } from '../services/firebaseService';
import { DeviceService } from '../services/deviceService';
import { usePageTitle } from '../hooks/usePageTitle';
import { AdMedia, DisplaySettings, ViewerStatus } from '../types';
import { BUILT_IN_DEFAULT_SLIDE_URL } from '../shared/defaultSlide';
import { Maximize2, Minimize2, Sliders, Play, VolumeX, Volume2, ShieldAlert, Clock3 } from 'lucide-react';

export default function DisplayBoard() {
  const navigate = useNavigate();
  usePageTitle('AdBoard');

  // Load datasets
  const [activeMedia, setActiveMedia] = useState<AdMedia[]>([]);
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  // Viewer approval status (device registry). 'approved' unless the admin
  // has denied this screen or requires approval for new devices.
  const [viewerStatus, setViewerStatus] = useState<ViewerStatus>('approved');

  // Screen layout states
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const boardContainerRef = useRef<HTMLDivElement>(null);
  
  // Timer handles
  const slideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const videoErrorTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Full media list from the last fetch; the schedule filter re-runs against
  // it locally so airtime windows open and close between network polls.
  const allMediaRef = useRef<AdMedia[]>([]);

  // Filters out disabled or timing-inactive advertisements as of "now"
  const filterActiveMedia = (items: AdMedia[]): AdMedia[] => {
    const now = new Date();
    return items.filter(item => {
      if (!item.isActive) return false;
      if (item.scheduledStart && now < new Date(item.scheduledStart)) return false;
      if (item.scheduledEnd && now > new Date(item.scheduledEnd)) return false;
      return true;
    });
  };

  // Stable content signature. State must only change when the content truly
  // changed: replacing the array every poll reset the slide timer, freezing
  // any slide whose duration exceeded the 30s polling interval.
  const mediaSignature = (items: AdMedia[]) =>
    items.map(i => `${i.id}|${i.url}|${i.duration}|${i.updatedAt}`).join('~');

  const syncActiveMedia = () => {
    const valid = filterActiveMedia(allMediaRef.current);
    setActiveMedia(prev => (mediaSignature(prev) === mediaSignature(valid) ? prev : valid));
    setActiveIdx(prev => (valid.length > 0 ? prev % valid.length : 0));
  };

  // Fetch current kiosk settings and media from the backend
  const fetchKioskPayload = async () => {
    try {
      const dbSettings = await FirebaseService.getDisplaySettings();
      const allMedia = await FirebaseService.getMediaItems();

      allMediaRef.current = allMedia;
      syncActiveMedia();
      // Keep the previous settings object when nothing changed (same reason:
      // a fresh reference restarts the slide timer effect)
      setDisplaySettings(prev =>
        prev && JSON.stringify(prev) === JSON.stringify(dbSettings) ? prev : dbSettings
      );
    } catch (err) {
      console.error("Display board failed to query remote database. Serving local state caches:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKioskPayload();

    // Auto-refresh the board parameters every 30 seconds to fetch newly published slides!
    const pollingInterval = setInterval(() => {
      fetchKioskPayload();
    }, 30000);

    // Re-evaluate schedule windows locally every 5 seconds so slides appear
    // the moment their airtime starts and disappear when it expires
    const scheduleTick = setInterval(() => {
      syncActiveMedia();
    }, 5000);

    // Register this screen and heartbeat every 20s so the admin sees it as an
    // active viewer and can approve/deny it.
    let cancelled = false;
    const beat = async () => {
      try {
        const status = await DeviceService.heartbeat();
        if (!cancelled) setViewerStatus(status);
      } catch { /* best-effort */ }
    };
    beat();
    const heartbeatInterval = setInterval(beat, 20000);

    return () => {
      cancelled = true;
      clearInterval(pollingInterval);
      clearInterval(scheduleTick);
      clearInterval(heartbeatInterval);
    };
  }, []);

  // Monitor standard Fullscreen events triggered by native browser actions (like escape key)
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, []);

  /**
   * Advances slideshow pointer
   */
  const handleNextSlide = () => {
    if (activeMedia.length <= 1) return;
    setActiveIdx((prev) => (prev + 1) % activeMedia.length);
  };

  /**
   * Slideshow timing orchestrator hook
   */
  useEffect(() => {
    if (slideTimerRef.current) {
      clearTimeout(slideTimerRef.current);
    }
    if (videoErrorTimerRef.current) {
      clearTimeout(videoErrorTimerRef.current);
    }

    if (activeMedia.length === 0 || !displaySettings) return;

    const currentSlide = activeMedia[activeIdx];

    // For a video slide the onEnded event normally drives the transition, but
    // a stalled or unplayable source (e.g. an expired blob URL) never fires it.
    // Guard with a generous safety timeout so the carousel can never freeze.
    if (currentSlide && currentSlide.type === 'video') {
      const safetyMs = Math.max((currentSlide.duration || 0), 60) * 1000;
      videoErrorTimerRef.current = setTimeout(() => {
        handleNextSlide();
      }, safetyMs);
      return () => {
        if (videoErrorTimerRef.current) {
          clearTimeout(videoErrorTimerRef.current);
        }
      };
    }

    // Determine airtime duration (prefers ad-specific duration overrides, fallback to kiosk default)
    const viewDurationMs = (currentSlide?.duration || displaySettings.autoplaySeconds) * 1000;

    slideTimerRef.current = setTimeout(() => {
      handleNextSlide();
    }, viewDurationMs);

    return () => {
      if (slideTimerRef.current) {
        clearTimeout(slideTimerRef.current);
      }
    };
  }, [activeIdx, activeMedia, displaySettings]);

  /**
   * Requests Full Screen coverage of target Container element
   */
  const toggleKioskFullscreen = async () => {
    if (!boardContainerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await boardContainerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error("Fullscreen Request Blocked by Browser sandbox constraints:", err);
    }
  };

  // --- Playtime accounting -------------------------------------------------
  // Accumulates how long each slide is actually on screen and flushes the
  // buffer to the backend every minute, powering the "watched Xh Ym on N
  // screens" stats in the admin gallery.
  const playtimeBufferRef = useRef<Record<string, number>>({});
  const currentPlayRef = useRef<{ id: string | null; since: number }>({ id: null, since: Date.now() });

  const settlePlaytime = () => {
    const cur = currentPlayRef.current;
    if (cur.id) {
      const elapsed = (Date.now() - cur.since) / 1000;
      if (elapsed >= 1) {
        playtimeBufferRef.current[cur.id] = (playtimeBufferRef.current[cur.id] || 0) + elapsed;
      }
    }
    currentPlayRef.current = { ...currentPlayRef.current, since: Date.now() };
  };

  // Track which slide is on screen (null when blocked or nothing to show)
  const playingId = viewerStatus === 'approved' && activeMedia.length > 0
    ? activeMedia[activeIdx]?.id ?? null
    : null;
  useEffect(() => {
    settlePlaytime();
    currentPlayRef.current = { id: playingId, since: Date.now() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingId]);

  useEffect(() => {
    const flush = setInterval(() => {
      settlePlaytime();
      const entries = Object.entries(playtimeBufferRef.current)
        .map(([mediaId, seconds]) => ({ mediaId, seconds: seconds as number }));
      playtimeBufferRef.current = {};
      if (entries.length > 0) {
        DeviceService.logPlaytime(entries);
      }
    }, 60000);
    return () => clearInterval(flush);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // -------------------------------------------------------------------------

  // Video playback completion handler
  const handleVideoFinished = () => {
    handleNextSlide();
  };

  // A slide whose source cannot load (expired blob URL, deleted file, network
  // error) must not freeze the board — skip to the next one instead.
  const handleBrokenSlide = () => {
    console.warn("A slide failed to load; advancing to the next.");
    handleNextSlide();
  };

  // A video that stalls mid-buffer gets a short grace period, then advances
  const handleVideoStalled = () => {
    if (videoErrorTimerRef.current) {
      clearTimeout(videoErrorTimerRef.current);
    }
    videoErrorTimerRef.current = setTimeout(() => {
      handleNextSlide();
    }, 10000);
  };

  if (loading || !displaySettings) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center font-sans text-slate-400">
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-mono text-slate-500">Launching Presentation Feed...</p>
        </div>
      </div>
    );
  }

  // This screen was denied, or is awaiting approval, by the administrator.
  if (viewerStatus === 'denied' || viewerStatus === 'pending') {
    const denied = viewerStatus === 'denied';
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center font-sans p-6" id="viewer-blocked">
        <div className="max-w-md text-center space-y-4">
          {denied
            ? <ShieldAlert className="w-16 h-16 text-red-400 mx-auto" />
            : <Clock3 className="w-16 h-16 text-amber-400 mx-auto animate-pulse" />}
          <h2 className="text-2xl font-display font-medium text-slate-100">
            {denied ? 'Display Access Revoked' : 'Awaiting Approval'}
          </h2>
          <p className="text-xs text-slate-500 font-mono leading-relaxed bg-slate-950 p-4 border border-slate-900 rounded-lg">
            {denied
              ? 'This screen has been denied access to the AdBoard display feed by the administrator.'
              : 'This screen is registered and waiting for the administrator to approve it. Content will appear automatically once approved.'}
          </p>
        </div>
      </div>
    );
  }

  const currentSlide = activeMedia[activeIdx];

  // Animation Transition Styles Map
  const getTransitionStyle = () => {
    const effect = displaySettings.transitionEffect;
    if (effect === 'slide') {
      return 'transition-all duration-700 ease-in-out transform'; // standard sliding animation fallback
    } else if (effect === 'zoom') {
      return 'transition-all duration-700 ease-out scale-105 filter blur-xs md:blur-none'; 
    }
    return 'transition-all duration-700 ease-in-out opacity-100 animate-fade-in'; // default smooth fade
  };

  return (
    <div 
      ref={boardContainerRef}
      className="h-screen w-screen bg-black text-white relative font-sans select-none overflow-hidden flex flex-col justify-between"
      id="display-board-frame"
    >
      
      {/* Immersive Slide Renderer Canvas */}
      <div className="absolute inset-0 z-0 flex items-center justify-center bg-black">
        {activeMedia.length === 0 ? (
          /* No active advertisement: show the custom default slide if set,
             otherwise the built-in standby image. The bare text notice is gone. */
          displaySettings.fallbackType === 'video' && displaySettings.fallbackUrl ? (
            <video
              key="fallback-slide"
              src={displaySettings.fallbackUrl}
              className="w-full h-full object-contain bg-black"
              autoPlay
              playsInline
              muted
              loop
              onError={handleBrokenSlide}
              id="kiosk-fallback-video"
            />
          ) : (
            <img
              key="fallback-slide"
              src={displaySettings.fallbackUrl || BUILT_IN_DEFAULT_SLIDE_URL}
              alt="Default display slide"
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
              id="kiosk-fallback-image"
            />
          )
        ) : currentSlide ? (
          <div className="relative w-full h-full overflow-hidden flex items-center justify-center">
            {currentSlide.type === 'video' ? (
              <video
                key={currentSlide.id}
                src={currentSlide.url}
                className="w-full h-full object-contain bg-black"
                autoPlay
                playsInline
                muted={isMuted}
                loop={activeMedia.length === 1}
                onEnded={handleVideoFinished}
                onError={handleBrokenSlide}
                onStalled={handleVideoStalled}
                id={`kiosk-video-${currentSlide.id}`}
              />
            ) : (
              <img
                key={currentSlide.id}
                src={currentSlide.url}
                alt={currentSlide.title}
                className={`w-full h-full object-contain ${getTransitionStyle()}`}
                referrerPolicy="no-referrer"
                onError={handleBrokenSlide}
                id={`kiosk-image-${currentSlide.id}`}
              />
            )}
          </div>
        ) : null}
      </div>

      {/* Floating Kiosk Controls HUD Overlay (Hides on Kiosk lockdown mode from settings) */}
      {!displaySettings.kioskMode && (
        <div className="absolute bottom-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none group px-4 py-2 bg-slate-950/80 border border-slate-900 backdrop-blur-md rounded-xl opacity-0 hover:opacity-100 transition-opacity duration-300">
          <div className="flex items-center gap-3 text-xs pointer-events-auto">
            <Link 
              to="/admin" 
              className="bg-slate-900/95 border border-slate-800 hover:border-indigo-500 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span>Dashboard Terminal</span>
            </Link>
            
            {currentSlide?.type === 'video' && (
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="bg-slate-900/95 border border-slate-800 hover:border-indigo-500 text-slate-300 hover:text-white p-1.5 rounded-lg transition-colors cursor-pointer"
                title={isMuted ? "Unmute video feed" : "Mute video feed"}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400">
            {activeMedia.length > 0 && (
              <span>
                Slide {activeIdx + 1} of {activeMedia.length} — &ldquo;{currentSlide?.title}&rdquo;
              </span>
            )}
            <button
              onClick={toggleKioskFullscreen}
              className="pointer-events-auto bg-slate-900 border border-slate-800 hover:text-white p-2 rounded-lg text-slate-400 hover:border-slate-500 cursor-pointer transition-colors"
              title="Toggle Fullscreen view"
              id="fullscreen-hud-toggle"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* Hidden touch/click corner trigger allowing Admins to escape Kiosk lockdown mode */}
      {displaySettings.kioskMode && (
        <Link 
          to="/login"
          id="kiosk-esc-corner"
          className="absolute top-0 left-0 w-8 h-8 opacity-0 hover:opacity-10 hover:bg-white cursor-help z-50 transition-opacity"
          title="Admin Access Escape Valve"
        />
      )}

    </div>
  );
}
