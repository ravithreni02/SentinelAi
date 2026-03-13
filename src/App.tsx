/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  Camera, 
  AlertTriangle, 
  Users, 
  Activity, 
  Map as MapIcon, 
  Settings, 
  Bell, 
  Eye,
  EyeOff,
  Lock,
  Database,
  Smartphone,
  ChevronRight,
  History,
  ShieldCheck,
  Plus,
  Edit,
  Trash2,
  Mail,
  UserPlus,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeFrame, AnalysisResult } from './services/gemini';

// --- Types ---
interface Suspect {
  id: number;
  name: string;
  risk_level: 'Low' | 'Medium' | 'High' | 'Critical';
  category: string;
  description: string;
  status: string;
}

interface Alert {
  id: number;
  timestamp: string;
  camera_id: string;
  location: string;
  suspect_id: number;
  suspect_name?: string;
  risk_level?: string;
  confidence: number;
  behavior_flag: string;
  status: string;
}

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
      active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
    }`}
  >
    <Icon size={20} />
    <span className="font-medium">{label}</span>
  </button>
);

const StatusBadge = ({ level }: { level: string }) => {
  const colors = {
    Low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    Medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    High: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    Critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${colors[level as keyof typeof colors] || 'bg-zinc-500/20 text-zinc-400'}`}>
      {level}
    </span>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'suspects' | 'alerts' | 'map' | 'mobile'>('dashboard');
  const [isPrivacyMode, setIsPrivacyMode] = useState(true);
  const [suspects, setSuspects] = useState<Suspect[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState<AnalysisResult | null>(null);
  
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // Modals State
  const [showSignup, setShowSignup] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [showSuspectModal, setShowSuspectModal] = useState(false);
  const [editingSuspect, setEditingSuspect] = useState<Suspect | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  
  const [suspectFormData, setSuspectFormData] = useState({
    name: '',
    risk_level: 'Low',
    category: 'Suspect',
    description: '',
    status: 'Active'
  });

  const [signupFormData, setSignupFormData] = useState({
    name: '',
    email: '',
    post: '',
    role: ''
  });

  const [contactFormData, setContactFormData] = useState({
    name: '',
    email: '',
    message: ''
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError("Camera API not supported in this browser. Please use a modern browser like Chrome or Firefox.");
        return;
      }

      // Check permission status if possible
      if (navigator.permissions && (navigator.permissions as any).query) {
        try {
          const status = await (navigator.permissions as any).query({ name: 'camera' });
          if (status.state === 'denied') {
            setCameraError("Camera access is blocked by your browser. Please click the camera icon in your address bar to allow access.");
            return;
          }
        } catch (e) {
          // Ignore if permission query fails
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        } 
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Ensure video plays
        try {
          await videoRef.current.play();
        } catch (e) {
          console.error("Video play failed:", e);
        }
      }
    } catch (err: any) {
      console.error("Camera access denied:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError("Camera permission denied. To fix this:\n1. Click the lock/camera icon in the address bar\n2. Change 'Camera' to 'Allow'\n3. Refresh the page or click 'Retry'");
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError("No camera device found. Please ensure your camera is connected.");
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraError("Camera is already in use by another application.");
      } else {
        setCameraError(`Camera error: ${err.message || 'Unknown error'}`);
      }
    }
  };

  const fetchSuspects = async () => {
    const res = await fetch('/api/suspects');
    const data = await res.json();
    setSuspects(data);
  };

  const handleSuspectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingSuspect ? `/api/suspects/${editingSuspect.id}` : '/api/suspects';
    const method = editingSuspect ? 'PUT' : 'POST';
    
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(suspectFormData)
    });
    
    setShowSuspectModal(false);
    setEditingSuspect(null);
    setSuspectFormData({ name: '', risk_level: 'Low', category: 'Suspect', description: '', status: 'Active' });
    fetchSuspects();
  };

  const handleDeleteSuspect = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this suspect?')) {
      await fetch(`/api/suspects/${id}`, { method: 'DELETE' });
      fetchSuspects();
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('https://formspree.io/f/mqeybvgr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signupFormData)
      });
      if (response.ok) {
        setIsRegistered(true);
        setTimeout(() => {
          setIsRegistered(false);
          setShowSignup(false);
          setSignupFormData({ name: '', email: '', post: '', role: '' });
        }, 3000);
      }
    } catch (err) {
      console.error("Signup failed:", err);
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('https://formspree.io/f/mqeybvgr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactFormData)
      });
      if (response.ok) {
        alert('Message sent successfully!');
        setShowContact(false);
        setContactFormData({ name: '', email: '', message: '' });
      }
    } catch (err) {
      console.error("Contact failed:", err);
    }
  };

  // Fetch initial data
  useEffect(() => {
    fetch('/api/suspects').then(res => res.json()).then(setSuspects);
    fetch('/api/alerts').then(res => res.json()).then(setAlerts);
    
    startCamera();
  }, []);

  // Analysis Loop
  useEffect(() => {
    let interval: any;
    if (activeTab === 'dashboard') {
      interval = setInterval(async () => {
        if (videoRef.current && canvasRef.current && !isAnalyzing) {
          const canvas = canvasRef.current;
          const context = canvas.getContext('2d');
          if (context) {
            context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            const base64 = canvas.toDataURL('image/jpeg', 0.8);
            
            setIsAnalyzing(true);
            try {
              const result = await analyzeFrame(base64, suspects);
              setLastAnalysis(result);

              if (result.isSuspectMatch || result.isSuspicious) {
                const locations = ['Main Entrance', 'North Corridor', 'Parking Lot B', 'Loading Dock', 'Server Room Hallway'];
                const randomLocation = locations[Math.floor(Math.random() * locations.length)];
                
                const newAlert = {
                  camera_id: `CAM-0${Math.floor(Math.random() * 5) + 1}`,
                  location: randomLocation,
                  suspect_id: result.suspectId || null,
                  confidence: result.confidence,
                  behavior_flag: result.behavior
                };
                
                await fetch('/api/alerts', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(newAlert)
                });
                const updatedAlerts = await fetch('/api/alerts').then(res => res.json());
                setAlerts(updatedAlerts);
              }
            } catch (err) {
              console.error("Analysis failed:", err);
            } finally {
              setIsAnalyzing(false);
            }
          }
        }
      }, 5000); // Analyze every 5 seconds
    }
    return () => clearInterval(interval);
  }, [activeTab, suspects, isAnalyzing]);

  // Draw Overlays (Blurring/Boxes)
  useEffect(() => {
    if (overlayCanvasRef.current && lastAnalysis) {
      const ctx = overlayCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
        
        lastAnalysis.faces.forEach(face => {
          const { x, y, w, h, isSuspect } = face;
          const scaleX = overlayCanvasRef.current!.width / 1000;
          const scaleY = overlayCanvasRef.current!.height / 1000;
          
          if (isPrivacyMode && !isSuspect) {
            ctx.fillStyle = 'rgba(0,0,0,0.95)';
            ctx.fillRect(x * scaleX, y * scaleY, w * scaleX, h * scaleY);
          } else {
            ctx.strokeStyle = isSuspect ? '#ef4444' : '#10b981';
            ctx.lineWidth = 3;
            ctx.strokeRect(x * scaleX, y * scaleY, w * scaleX, h * scaleY);
            
            if (isSuspect) {
              ctx.fillStyle = '#ef4444';
              ctx.font = 'bold 14px Inter';
              ctx.fillText(`SUSPECT MATCH: ${Math.round(lastAnalysis.confidence * 100)}%`, x * scaleX, (y * scaleY) - 8);
            }
          }
        });
      }
    }
  }, [lastAnalysis, isPrivacyMode]);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Top Navigation */}
      <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-950/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Shield className="text-zinc-950" size={24} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight leading-none">SentinelAI</h1>
            <p className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase mt-1">secure intelligence surveillance network</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-full border border-zinc-800">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs font-medium text-zinc-400">SYSTEM ONLINE</span>
          </div>
          <button className="p-2 text-zinc-400 hover:text-zinc-100 transition-colors relative">
            <Bell size={20} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-zinc-950" />
          </button>
          <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold">
            JD
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 border-r border-zinc-800 h-[calc(100vh-64px)] sticky top-16 p-4 flex flex-col gap-2 bg-zinc-950/20">
          <div className="mb-4 px-2">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Main Operations</p>
          </div>
          <SidebarItem icon={Camera} label="Live Monitoring" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <SidebarItem icon={Users} label="Suspect Database" active={activeTab === 'suspects'} onClick={() => setActiveTab('suspects')} />
          <SidebarItem icon={AlertTriangle} label="Alert History" active={activeTab === 'alerts'} onClick={() => setActiveTab('alerts')} />
          <SidebarItem icon={MapIcon} label="Tactical Map" active={activeTab === 'map'} onClick={() => setActiveTab('map')} />
          
          <div className="mt-8 mb-4 px-2">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">System</p>
          </div>
          <SidebarItem icon={Smartphone} label="Mobile Link" active={activeTab === 'mobile'} onClick={() => setActiveTab('mobile')} />
          <SidebarItem icon={Mail} label="Contact Us" onClick={() => setShowContact(true)} />
          <SidebarItem icon={UserPlus} label="Agent Signup" onClick={() => setShowSignup(true)} />
          <SidebarItem icon={Settings} label="Configuration" onClick={() => {}} />
          
          <div className="mt-auto p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-2 mb-2">
              <Lock size={14} className="text-emerald-400" />
              <span className="text-xs font-bold text-zinc-300 uppercase">Privacy Guard</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-500">Auto-Blur Active</span>
              <button 
                onClick={() => setIsPrivacyMode(!isPrivacyMode)}
                className={`w-8 h-4 rounded-full transition-colors relative ${isPrivacyMode ? 'bg-emerald-500' : 'bg-zinc-700'}`}
              >
                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${isPrivacyMode ? 'left-4.5' : 'left-0.5'}`} />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-y-auto h-[calc(100vh-64px)]">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-12 gap-6"
              >
                {/* Live Feed Section */}
                <div className="col-span-12 lg:col-span-8 space-y-6">
                  <div className="relative aspect-video bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl group">
                    {cameraError ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-zinc-950/80 backdrop-blur-sm z-20">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
                          <Camera className="text-red-500" size={32} />
                        </div>
                        <h3 className="text-lg font-bold text-zinc-100 mb-2">Camera Access Required</h3>
                        <div className="text-sm text-zinc-400 max-w-md mb-6 whitespace-pre-line">
                          {cameraError}
                        </div>
                        <div className="flex gap-3">
                          <button 
                            onClick={startCamera}
                            className="px-6 py-2 bg-emerald-500 text-zinc-950 rounded-lg font-bold text-sm hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
                          >
                            Retry Access
                          </button>
                          <a 
                            href="https://support.google.com/chrome/answer/2693767" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="px-6 py-2 bg-zinc-800 text-zinc-300 rounded-lg font-bold text-sm hover:bg-zinc-700 transition-all border border-zinc-700"
                          >
                            Help Guide
                          </a>
                        </div>
                      </div>
                    ) : (
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        muted 
                        playsInline 
                        className="w-full h-full object-cover grayscale brightness-75"
                      />
                    )}
                    <canvas ref={canvasRef} className="hidden" width={1280} height={720} />
                    <canvas 
                      ref={overlayCanvasRef} 
                      className="absolute top-0 left-0 w-full h-full pointer-events-none" 
                      width={1280} 
                      height={720} 
                    />
                    
                    {/* HUD Overlays */}
                    <div className="absolute top-4 left-4 flex flex-col gap-2">
                      <div className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-mono font-bold tracking-wider">REC • CAM-01 (MAIN_ENTRANCE)</span>
                      </div>
                      <div className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-lg border border-white/10">
                        <span className="text-[10px] font-mono font-bold tracking-wider text-zinc-400">
                          {new Date().toLocaleTimeString()} • 2026-02-19
                        </span>
                      </div>
                    </div>

                    <div className="absolute bottom-4 right-4 flex gap-2">
                      <button className="p-2 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 hover:bg-white/10 transition-colors">
                        <Eye size={18} />
                      </button>
                      <button className="p-2 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 hover:bg-white/10 transition-colors">
                        <Activity size={18} />
                      </button>
                    </div>

                    {isAnalyzing && (
                      <div className="absolute inset-0 bg-emerald-500/5 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                          <span className="text-xs font-bold tracking-widest text-emerald-400 uppercase">AI Analyzing Frame...</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Analysis Info */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Behavior Detection</p>
                      <p className="text-sm font-medium text-zinc-200">{lastAnalysis?.behavior || 'Monitoring...'}</p>
                    </div>
                    <div className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Object Classification</p>
                      <div className="flex flex-wrap gap-1">
                        {lastAnalysis?.detectedObjects.map((obj, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-zinc-800 rounded text-[10px] text-zinc-400 border border-zinc-700">{obj}</span>
                        )) || <span className="text-sm text-zinc-600 italic">None detected</span>}
                      </div>
                    </div>
                    <div className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Confidence Score</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 transition-all duration-500" 
                            style={{ width: `${(lastAnalysis?.confidence || 0) * 100}%` }} 
                          />
                        </div>
                        <span className="text-xs font-bold text-emerald-400">{Math.round((lastAnalysis?.confidence || 0) * 100)}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Real-time Alerts Sidebar */}
                <div className="col-span-12 lg:col-span-4 space-y-6">
                  <div className="p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800 h-full flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="text-orange-400" size={18} />
                        <h2 className="font-bold text-sm uppercase tracking-wider">Live Alerts</h2>
                      </div>
                      <span className="text-[10px] font-bold text-zinc-500">{alerts.length} Total</span>
                    </div>

                    <div className="space-y-3 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
                      {alerts.map((alert) => (
                        <motion.div 
                          initial={{ x: 20, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          key={alert.id} 
                          className={`p-3 rounded-xl border transition-all cursor-pointer hover:scale-[1.02] ${
                            alert.risk_level === 'Critical' ? 'bg-red-500/10 border-red-500/20' : 
                            alert.risk_level === 'High' ? 'bg-orange-500/10 border-orange-500/20' : 
                            'bg-zinc-800/50 border-zinc-700'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <StatusBadge level={alert.risk_level || 'Low'} />
                            <span className="text-[10px] font-mono text-zinc-500">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <h3 className="text-sm font-bold text-zinc-100 mb-1">
                            {alert.suspect_name ? `MATCH: ${alert.suspect_name}` : 'SUSPICIOUS BEHAVIOR'}
                          </h3>
                          <p className="text-[11px] text-zinc-400 line-clamp-2 mb-2">
                            {alert.behavior_flag}
                          </p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                              <Camera size={10} />
                              <span>{alert.camera_id}</span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                              <ShieldCheck size={10} />
                              <span>{Math.round(alert.confidence * 100)}% Match</span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                      {alerts.length === 0 && (
                        <div className="py-12 flex flex-col items-center gap-3 text-zinc-600">
                          <EyeOff size={32} />
                          <p className="text-xs font-medium">No active threats detected</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'suspects' && (
              <motion.div 
                key="suspects"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">Criminal Database</h2>
                    <p className="text-sm text-zinc-500">Manage and track high-risk individuals in the system.</p>
                  </div>
                  <button 
                    onClick={() => {
                      setEditingSuspect(null);
                      setSuspectFormData({ name: '', risk_level: 'Low', category: 'Suspect', description: '', status: 'Active' });
                      setShowSuspectModal(true);
                    }}
                    className="px-4 py-2 bg-emerald-500 text-zinc-950 rounded-lg font-bold text-sm hover:bg-emerald-400 transition-colors flex items-center gap-2"
                  >
                    <Plus size={16} />
                    Add New Suspect
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {suspects.map(suspect => (
                    <div key={suspect.id} className="bg-zinc-900/50 rounded-2xl border border-zinc-800 overflow-hidden hover:border-zinc-700 transition-all group relative">
                      <div className="absolute top-2 left-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => {
                            setEditingSuspect(suspect);
                            setSuspectFormData({
                              name: suspect.name,
                              risk_level: suspect.risk_level,
                              category: suspect.category,
                              description: suspect.description,
                              status: suspect.status
                            });
                            setShowSuspectModal(true);
                          }}
                          className="p-1.5 bg-zinc-900/80 rounded-lg text-emerald-400 hover:text-emerald-300 border border-white/10"
                        >
                          <Edit size={14} />
                        </button>
                        <button 
                          onClick={() => handleDeleteSuspect(suspect.id)}
                          className="p-1.5 bg-zinc-900/80 rounded-lg text-red-400 hover:text-red-300 border border-white/10"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="aspect-square bg-zinc-800 relative">
                        <img 
                          src={`https://picsum.photos/seed/${suspect.id}/400/400`} 
                          alt={suspect.name} 
                          className="w-full h-full object-cover grayscale opacity-50 group-hover:opacity-80 transition-opacity"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
                          <StatusBadge level={suspect.risk_level} />
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                            suspect.category === 'Missing Person' 
                              ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' 
                              : 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
                          }`}>
                            {suspect.category}
                          </span>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-zinc-950 to-transparent">
                          <h3 className="text-lg font-bold">{suspect.name}</h3>
                          <p className="text-xs text-zinc-400 font-mono">ID: AEGIS-{suspect.id.toString().padStart(4, '0')}</p>
                        </div>
                      </div>
                      <div className="p-4 space-y-4">
                        <div>
                          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Profile Description</p>
                          <p className="text-xs text-zinc-300 leading-relaxed">{suspect.description}</p>
                        </div>
                        <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Status: {suspect.status}</span>
                          </div>
                          <button className="text-emerald-400 hover:text-emerald-300 transition-colors">
                            <ChevronRight size={20} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'mobile' && (
              <motion.div 
                key="mobile"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center justify-center py-12"
              >
                <div className="w-[320px] h-[640px] bg-zinc-950 rounded-[3rem] border-[8px] border-zinc-800 shadow-2xl relative overflow-hidden flex flex-col">
                  {/* Mobile Notch */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-zinc-800 rounded-b-2xl z-10" />
                  
                  {/* Mobile Content */}
                  <div className="flex-1 p-6 pt-10 bg-zinc-900 flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                      <Shield className="text-emerald-500" size={24} />
                      <div className="flex gap-1">
                        <div className="w-4 h-1 bg-zinc-700 rounded-full" />
                        <div className="w-2 h-1 bg-zinc-700 rounded-full" />
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-xl font-bold">Sentinel Mobile</h3>
                      <p className="text-xs text-zinc-500">Field Agent Interface v2.4</p>
                    </div>

                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="text-red-500" size={16} />
                        <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Urgent Alert</span>
                      </div>
                      <p className="text-sm font-bold mb-1">Suspect Match: CAM-01</p>
                      <p className="text-[10px] text-zinc-400 mb-4">Main Entrance • 98% Confidence</p>
                      <div className="flex gap-2">
                        <button className="flex-1 py-2 bg-red-500 text-white rounded-lg text-[10px] font-bold uppercase">Dispatch</button>
                        <button className="flex-1 py-2 bg-zinc-800 text-zinc-400 rounded-lg text-[10px] font-bold uppercase">Ignore</button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Nearby Units</p>
                      {[1, 2, 3].map(i => (
                        <div key={i} className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl border border-zinc-700">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                              <Users size={14} />
                            </div>
                            <div>
                              <p className="text-xs font-bold">Unit {i}0{i}</p>
                              <p className="text-[10px] text-zinc-500">0.4km away</p>
                            </div>
                          </div>
                          <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Mobile Nav */}
                  <div className="h-16 bg-zinc-950 border-t border-zinc-800 flex items-center justify-around px-4">
                    <Camera size={20} className="text-emerald-500" />
                    <History size={20} className="text-zinc-600" />
                    <MapIcon size={20} className="text-zinc-600" />
                    <Settings size={20} className="text-zinc-600" />
                  </div>
                </div>
                <p className="mt-8 text-zinc-500 text-sm">Scan QR to link field device</p>
                <div className="mt-4 w-32 h-32 bg-white p-2 rounded-xl">
                  <div className="w-full h-full bg-zinc-950 rounded-lg flex items-center justify-center">
                     <Lock className="text-white" />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Footer / System Status */}
      <footer className="h-8 border-t border-zinc-800 bg-zinc-950 px-6 flex items-center justify-between text-[10px] font-mono text-zinc-500">
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <Database size={12} />
            <span>DB: surveillance.db [CONNECTED]</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock size={12} />
            <span>ENCRYPTION: AES-256 [ACTIVE]</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span>UPTIME: 142:12:05</span>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
            <span>API: STABLE</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <AnimatePresence>
        {showSignup && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <UserPlus className="text-emerald-500" size={20} />
                  Agent Registration
                </h2>
                <button onClick={() => setShowSignup(false)} className="text-zinc-500 hover:text-zinc-100">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6">
                {isRegistered ? (
                  <div className="py-8 text-center space-y-4">
                    <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
                      <ShieldCheck className="text-emerald-500" size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-emerald-400">Registered Successfully</h3>
                    <p className="text-sm text-zinc-400">Your credentials have been submitted for verification.</p>
                  </div>
                ) : (
                  <form onSubmit={handleSignupSubmit} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Full Name</label>
                      <input 
                        required
                        type="text" 
                        value={signupFormData.name}
                        onChange={(e) => setSignupFormData({...signupFormData, name: e.target.value})}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                        placeholder="Agent Name"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Email Address</label>
                      <input 
                        required
                        type="email" 
                        value={signupFormData.email}
                        onChange={(e) => setSignupFormData({...signupFormData, email: e.target.value})}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                        placeholder="agent@sentinel.ai"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Post</label>
                        <input 
                          required
                          type="text" 
                          value={signupFormData.post}
                          onChange={(e) => setSignupFormData({...signupFormData, post: e.target.value})}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                          placeholder="e.g. Field Agent"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Role</label>
                        <input 
                          required
                          type="text" 
                          value={signupFormData.role}
                          onChange={(e) => setSignupFormData({...signupFormData, role: e.target.value})}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                          placeholder="e.g. Surveillance"
                        />
                      </div>
                    </div>
                    <button 
                      type="submit"
                      className="w-full py-3 bg-emerald-500 text-zinc-950 rounded-lg font-bold text-sm hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 mt-4"
                    >
                      Complete Registration
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {showContact && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Mail className="text-emerald-500" size={20} />
                  Contact Headquarters
                </h2>
                <button onClick={() => setShowContact(false)} className="text-zinc-500 hover:text-zinc-100">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6">
                <form onSubmit={handleContactSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Name</label>
                    <input 
                      required
                      type="text" 
                      value={contactFormData.name}
                      onChange={(e) => setContactFormData({...contactFormData, name: e.target.value})}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Email</label>
                    <input 
                      required
                      type="email" 
                      value={contactFormData.email}
                      onChange={(e) => setContactFormData({...contactFormData, email: e.target.value})}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Message</label>
                    <textarea 
                      required
                      rows={4}
                      value={contactFormData.message}
                      onChange={(e) => setContactFormData({...contactFormData, message: e.target.value})}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors resize-none"
                    />
                  </div>
                  <button 
                    type="submit"
                    className="w-full py-3 bg-emerald-500 text-zinc-950 rounded-lg font-bold text-sm hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 mt-4"
                  >
                    Send Message
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}

        {showSuspectModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Database className="text-emerald-500" size={20} />
                  {editingSuspect ? 'Modify Record' : 'Add New Record'}
                </h2>
                <button onClick={() => setShowSuspectModal(false)} className="text-zinc-500 hover:text-zinc-100">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6">
                <form onSubmit={handleSuspectSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Full Name</label>
                    <input 
                      required
                      type="text" 
                      value={suspectFormData.name}
                      onChange={(e) => setSuspectFormData({...suspectFormData, name: e.target.value})}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Risk Level</label>
                      <select 
                        value={suspectFormData.risk_level}
                        onChange={(e) => setSuspectFormData({...suspectFormData, risk_level: e.target.value as any})}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Critical">Critical</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Category</label>
                      <select 
                        value={suspectFormData.category}
                        onChange={(e) => setSuspectFormData({...suspectFormData, category: e.target.value})}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                      >
                        <option value="Suspect">Suspect</option>
                        <option value="Missing Person">Missing Person</option>
                        <option value="Person of Interest">Person of Interest</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Description</label>
                    <textarea 
                      required
                      rows={3}
                      value={suspectFormData.description}
                      onChange={(e) => setSuspectFormData({...suspectFormData, description: e.target.value})}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors resize-none"
                    />
                  </div>
                  <button 
                    type="submit"
                    className="w-full py-3 bg-emerald-500 text-zinc-950 rounded-lg font-bold text-sm hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 mt-4"
                  >
                    {editingSuspect ? 'Update Record' : 'Save Record'}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

