import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Camera, Plus, Flame, Beef, Droplet, X, Loader2, CheckCircle2, 
  AlertCircle, Cloud, User, Settings, Pencil, 
  GlassWater, Minus, Image as ImageIcon, Calendar, ChevronDown, ChevronUp, 
  Users, KeyRound, LogOut, ShieldCheck, Menu, Dumbbell, BookOpen, 
  Trophy, Home, Crown, PlayCircle, Timer, Sparkles, ChefHat, BarChart3, Send, Heart, ExternalLink,
  Moon, Sun, Globe, Bot
} from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged, Auth } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, doc, setDoc, Firestore } from 'firebase/firestore';

// --- TYPES ---
interface Profile {
  id: string;
  name: string;
  age: number | string;
  gender: 'male' | 'female';
  weight: number | string;
  height: number | string;
  activity: string;
  calorieGoal?: number;
  waterGoal?: number;
  createdAt?: number;
  updatedAt?: number;
}

interface FoodLog {
  id: string;
  profileId: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  imageUrl?: string;
  timestamp?: string;
  dateString: string;
  createdAt: number;
}

interface WaterLog {
  id: string;
  profileId: string;
  amount: number;
  dateString: string;
  updatedAt: number;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

declare global {
  interface Window {
    __firebase_config?: string;
    __initial_auth_token?: string;
    __app_id?: string;
  }
}

// --- FIREBASE INITIALIZATION SAFE FALLBACK ---
let firebaseApp: any = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
const appId = typeof window !== 'undefined' && window.__app_id ? window.__app_id : 'dailycal-app';

try {
  const rawConfig = typeof window !== 'undefined' && window.__firebase_config;
  if (rawConfig) {
    const firebaseConfig = JSON.parse(rawConfig);
    if (firebaseConfig && firebaseConfig.apiKey) {
      firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
      auth = getAuth(firebaseApp);
      db = getFirestore(firebaseApp);
    }
  }
} catch (e) {
  console.warn("Firebase config parse error or missing options:", e);
}

// Fetch helper with retry
const fetchWithRetry = async (url: string, options: RequestInit, retries = 3) => {
  const delays = [1000, 2000, 4000];
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delays[i]));
    }
  }
};

const uiDict: Record<string, Record<string, string>> = {
  id: { appName: 'DailyCal', dash: 'Jurnal Harian', lead: 'Papan Peringkat', work: 'Program Olahraga', rec: 'Meal Plan Mingguan', anal: 'Analitik Keluarga', ask: 'Tanya AI', shop: 'Toko Sehat' },
  en: { appName: 'DailyCal', dash: 'Daily Journal', lead: 'Leaderboard', work: 'Workouts', rec: 'Weekly Meal Plan', anal: 'Family Analytics', ask: 'Ask AI', shop: 'Healthy Store' },
  zh: { appName: 'DailyCal', dash: '每日日记', lead: '排行榜', work: '锻炼', rec: '每周食谱', anal: '家庭分析', ask: '问AI', shop: '健康商店' },
  ja: { appName: 'DailyCal', dash: '毎日の日記', lead: 'リーダーボード', work: 'ワークアウト', rec: '食事プラン', anal: '家族分析', ask: 'AIに聞く', shop: '健康ストア' },
  de: { appName: 'DailyCal', dash: 'Tagebuch', lead: 'Bestenliste', work: 'Trainingsplan', rec: 'Wochenmenü', anal: 'Familienanalytik', ask: 'KI Fragen', shop: 'Gesundheitsshop' },
  fr: { appName: 'DailyCal', dash: 'Journal', lead: 'Classement', work: 'Programme', rec: 'Plan de Repas', anal: 'Analyse', ask: 'Demander à l\'IA', shop: 'Boutique Santé' },
  hi: { appName: 'DailyCal', dash: 'दैनिक पत्रिका', lead: 'लीडरबोर्ड', work: 'कसरत', rec: 'भोजन योजना', anal: 'परिवार एनालिटिक्स', ask: 'AI से पूछें', shop: 'स्वस्थ स्टोर' },
  ko: { appName: 'DailyCal', dash: '일일 저널', lead: '리더보드', work: '운동', rec: '주간 식단', anal: '가족 분석', ask: 'AI에게 묻기', shop: '건강 스토어' },
  pt: { appName: 'DailyCal', dash: 'Diário', lead: 'Classificação', work: 'Treino', rec: 'Plano de Refeições', anal: 'Análise', ask: 'Perguntar à IA', shop: 'Loja Saudável' },
  es: { appName: 'DailyCal', dash: 'Diario', lead: 'Clasificación', work: 'Entrenamiento', rec: 'Plan de Comidas', anal: 'Análisis', ask: 'Preguntar a la IA', shop: 'Tienda Saludable' }
};

const langNames: Record<string, string> = {
  id: 'Indonesia', en: 'English', zh: '中文', ja: '日本語', de: 'Deutsch',
  fr: 'Français', hi: 'हिन्दी', ko: '한국어', pt: 'Português', es: 'Español'
};

const darkThemeStyles = `
  .dark-theme { background-color: #0f172a !important; color: #f8fafc !important; }
  .dark-theme .bg-white { background-color: #1e293b !important; border-color: #334155 !important; color: #f8fafc !important; }
  .dark-theme .bg-gray-50, .dark-theme .bg-gray-100 { background-color: #0f172a !important; color: #f8fafc !important; }
  .dark-theme .text-gray-800 { color: #f8fafc !important; }
  .dark-theme .text-gray-700 { color: #e2e8f0 !important; }
  .dark-theme .text-gray-600 { color: #cbd5e1 !important; }
  .dark-theme .text-gray-500, .dark-theme .text-gray-400 { color: #94a3b8 !important; }
  .dark-theme .border-gray-100 { border-color: #334155 !important; }
  .dark-theme .border-gray-200 { border-color: #475569 !important; }
  .dark-theme .bg-green-50, .dark-theme .bg-green-100 { background-color: rgba(34, 197, 94, 0.15) !important; color: #4ade80 !important; }
  .dark-theme .bg-blue-50 { background-color: rgba(59, 130, 246, 0.15) !important; color: #60a5fa !important; }
  .dark-theme .bg-orange-50 { background-color: rgba(249, 115, 22, 0.15) !important; color: #fb923c !important; }
  .dark-theme .bg-yellow-50 { background-color: rgba(234, 179, 8, 0.15) !important; color: #facc15 !important; }
  .dark-theme .bg-purple-50 { background-color: rgba(168, 85, 247, 0.15) !important; color: #c084fc !important; }
  .dark-theme .bg-teal-100 { background-color: rgba(20, 184, 166, 0.15) !important; color: #2dd4bf !important; }
  .dark-theme .bg-rose-50 { background-color: rgba(244, 63, 94, 0.15) !important; color: #fb7185 !important; }
  .dark-theme .shadow-sm, .dark-theme .shadow-md, .dark-theme .shadow-xl { box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.3) !important; }
  .dark-theme input, .dark-theme select { background-color: #0f172a !important; color: white !important; border-color: #475569 !important; }
`;

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  
  // App State
  const [currentView, setCurrentView] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<'water' | 'calories'>('water'); 

  // Fitur Multibahasa & Mode Gelap
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [language, setLanguage] = useState('id');
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);

  // Family Code Auth State
  const [familyCode, setFamilyCode] = useState<string | null>(() => {
    return localStorage.getItem('dailycal_family_code') || null;
  });
  const [isCheckingFamily, setIsCheckingFamily] = useState(true);
  const [codeInput, setCodeInput] = useState('');

  // Data Mentah 
  const [allLogsRaw, setAllLogsRaw] = useState<FoodLog[]>(() => {
    const saved = localStorage.getItem('dailycal_food_logs');
    return saved ? JSON.parse(saved) : [];
  }); 
  const [allWaterLogsRaw, setAllWaterLogsRaw] = useState<WaterLog[]>(() => {
    const saved = localStorage.getItem('dailycal_water_logs');
    return saved ? JSON.parse(saved) : [];
  }); 
  
  // Multi-User Profile State
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    const saved = localStorage.getItem('dailycal_profiles');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
    return localStorage.getItem('dailycal_active_profile_id') || null;
  });

  // Modals & UI States
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false); 
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isUsersModalOpen, setIsUsersModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false); 
  const [isConfirmLeaveOpen, setIsConfirmLeaveOpen] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null); 

  // Form & Camera States
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState("");
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  
  const [profileForm, setProfileForm] = useState({
    name: '', age: '', gender: 'male' as 'male' | 'female', weight: '', height: '', activity: 'sedentary'
  });
  
  // --- AI Chat State ---
  const [aiChatHistory, setAiChatHistory] = useState<ChatMessage[]>([
    { role: 'model', text: 'Halo Ndoro! Saya Jarvis, asisten kesehatan AI pintar Anda. Ada yang bisa saya bantu tentang kalori, olahraga, atau resep makanan hari ini?' }
  ]);
  const [aiInput, setAiInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const [selectedRecipe, setSelectedRecipe] = useState<any>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const getTodayDateString = () => new Date().toLocaleDateString('id-ID').replace(/\//g, '-');

  // Firebase auth sync if auth is configured
  useEffect(() => {
    const initAuth = async () => {
      if (!auth) {
        setUser({ uid: 'local-user' });
        setAuthLoading(false);
        setIsCheckingFamily(false);
        return;
      }
      try {
        if (typeof window !== 'undefined' && window.__initial_auth_token) {
          await signInWithCustomToken(auth, window.__initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth failed:", error);
      }
    };
    initAuth();
    
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        setAuthLoading(false);
      });
      return () => unsubscribe();
    }
  }, []);

  // Firebase account document check
  useEffect(() => {
    if (!user || !db) {
      setIsCheckingFamily(false);
      return;
    }
    const accountRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'account');
    const unsubscribeAccount = onSnapshot(accountRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().familyCode) {
        const code = docSnap.data().familyCode;
        setFamilyCode(code);
        localStorage.setItem('dailycal_family_code', code);
      } else {
        // Fall back to local storage if present
        const localCode = localStorage.getItem('dailycal_family_code');
        if (localCode) {
          setFamilyCode(localCode);
        }
      }
      setIsCheckingFamily(false);
    }, (error) => {
      console.error("Account fetch error:", error);
      setIsCheckingFamily(false);
    });

    return () => unsubscribeAccount();
  }, [user]);

  // Sync with Firestore if available
  useEffect(() => {
    if (!user || !familyCode || !db) return;
    setIsCloudSyncing(true);

    const safeCode = familyCode.replace(/[^a-zA-Z0-9]/g, '_'); 

    const profilesRef = collection(db, 'artifacts', appId, 'public', 'data', `family_${safeCode}_profiles`);
    const unsubscribeProfiles = onSnapshot(profilesRef, (snapshot) => {
      const loadedProfiles: Profile[] = [];
      snapshot.forEach(docSnap => loadedProfiles.push({ id: docSnap.id, ...docSnap.data() } as Profile));
      
      if (loadedProfiles.length > 0) {
        setProfiles(loadedProfiles);
        localStorage.setItem('dailycal_profiles', JSON.stringify(loadedProfiles));
        setActiveProfileId(current => {
          if (!current || !loadedProfiles.find(p => p.id === current)) return loadedProfiles[0].id;
          return current;
        });
      }
    }, (error) => console.error("Profile error:", error));

    const logsRef = collection(db, 'artifacts', appId, 'public', 'data', `family_${safeCode}_food`);
    const unsubscribeLogs = onSnapshot(logsRef, (snapshot) => {
      const logs: FoodLog[] = [];
      snapshot.forEach(docSnap => logs.push({ id: docSnap.id, ...docSnap.data() } as FoodLog));
      logs.sort((a, b) => b.createdAt - a.createdAt);
      setAllLogsRaw(logs);
      localStorage.setItem('dailycal_food_logs', JSON.stringify(logs));
      setIsCloudSyncing(false);
    }, (error) => console.error("Food logs error:", error));

    const waterRef = collection(db, 'artifacts', appId, 'public', 'data', `family_${safeCode}_water`);
    const unsubscribeWater = onSnapshot(waterRef, (snapshot) => {
      const waters: WaterLog[] = [];
      snapshot.forEach(docSnap => waters.push({ id: docSnap.id, ...docSnap.data() } as WaterLog));
      setAllWaterLogsRaw(waters);
      localStorage.setItem('dailycal_water_logs', JSON.stringify(waters));
    }, (error) => console.error("Water logs error:", error));

    return () => {
      unsubscribeProfiles();
      unsubscribeLogs();
      unsubscribeWater();
    };
  }, [user, familyCode]);

  // Persist local profile ID
  useEffect(() => {
    if (activeProfileId) {
      localStorage.setItem('dailycal_active_profile_id', activeProfileId);
    }
  }, [activeProfileId]);

  const activeProfile = profiles.find(p => p.id === activeProfileId) || null;
  const activeFoodLogs = allLogsRaw.filter(log => log.profileId === activeProfileId);
  const activeWaterLogs = allWaterLogsRaw.filter(log => log.profileId === activeProfileId);
  
  const todayString = new Date().toLocaleDateString('id-ID');
  const foodLogsToday = activeFoodLogs.filter(log => log.dateString === todayString);
  const todayWaterLog = activeWaterLogs.find(log => log.dateString === getTodayDateString());
  const waterIntake = todayWaterLog ? todayWaterLog.amount : 0;

  const leaderboardData = useMemo(() => {
    const today = new Date().toLocaleDateString('id-ID');
    const todayDocString = getTodayDateString();

    const data = profiles.map(profile => {
      const userWaterLogs = allWaterLogsRaw.filter(log => log.profileId === profile.id && log.dateString === todayDocString);
      const waterAmount = userWaterLogs.reduce((sum, log) => sum + (log.amount || 0), 0);
      const waterGoal = profile.waterGoal || 2000;
      const waterProgress = Math.min((waterAmount / waterGoal) * 100, 100);

      const userFoodLogs = allLogsRaw.filter(log => log.profileId === profile.id && log.dateString === today);
      const totalCalories = userFoodLogs.reduce((sum, log) => sum + (log.calories || 0), 0);
      const calorieGoal = profile.calorieGoal || 2000;
      const calProgress = Math.min((totalCalories / calorieGoal) * 100, 100);

      return {
        ...profile,
        waterAmount,
        waterGoal,
        waterProgress,
        totalCalories,
        calorieGoal,
        calProgress
      };
    });

    const sortedByWater = [...data].sort((a, b) => b.waterProgress - a.waterProgress);
    const sortedByCalories = [...data].sort((a, b) => b.calProgress - a.calProgress);

    return { water: sortedByWater, calories: sortedByCalories };
  }, [profiles, allLogsRaw, allWaterLogsRaw]);

  const groupedHistory = useMemo(() => {
    if (!activeProfileId) return [];
    const groups: Record<string, { id: string; name: string; days: Record<string, { dateStr: string; cals: number; water: number; sortKey: number }>; totalCalories: number; daysArray?: any[] }> = {};
    const processDate = (timestamp: number) => {
      const d = new Date(timestamp);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthName = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      const dayKey = d.toLocaleDateString('id-ID');
      return { d, monthKey, monthName, dayKey };
    };

    activeFoodLogs.forEach(log => {
      if (!log.createdAt) return;
      const { d, monthKey, monthName, dayKey } = processDate(log.createdAt);
      if (!groups[monthKey]) groups[monthKey] = { id: monthKey, name: monthName, days: {}, totalCalories: 0 };
      if (!groups[monthKey].days[dayKey]) groups[monthKey].days[dayKey] = { dateStr: d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }), cals: 0, water: 0, sortKey: d.getTime() };
      groups[monthKey].days[dayKey].cals += (log.calories || 0);
      groups[monthKey].totalCalories += (log.calories || 0);
    });

    activeWaterLogs.forEach(wLog => {
      if (!wLog.updatedAt) return;
      const { d, monthKey, monthName, dayKey } = processDate(wLog.updatedAt);
      if (!groups[monthKey]) groups[monthKey] = { id: monthKey, name: monthName, days: {}, totalCalories: 0 };
      if (!groups[monthKey].days[dayKey]) groups[monthKey].days[dayKey] = { dateStr: d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }), cals: 0, water: 0, sortKey: d.getTime() };
      groups[monthKey].days[dayKey].water = wLog.amount || 0;
    });

    const result = Object.values(groups).sort((a, b) => b.id.localeCompare(a.id)).map(month => {
      month.daysArray = Object.values(month.days).sort((a, b) => b.sortKey - a.sortKey);
      return month;
    });

    if (result.length > 0 && !expandedMonth) setExpandedMonth(result[0].id);
    return result;
  }, [activeFoodLogs, activeWaterLogs, activeProfileId, expandedMonth]);

  const toggleMonth = (monthId: string) => setExpandedMonth(prev => prev === monthId ? null : monthId);

  const totalCalories = foodLogsToday.reduce((sum, log) => sum + (log.calories || 0), 0);
  const totalProtein = foodLogsToday.reduce((sum, log) => sum + (log.protein || 0), 0);
  const totalCarbs = foodLogsToday.reduce((sum, log) => sum + (log.carbs || 0), 0);
  const totalFat = foodLogsToday.reduce((sum, log) => sum + (log.fat || 0), 0);

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setProfileForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleJoinFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeInput.trim()) return;
    const cleanCode = codeInput.trim();
    setFamilyCode(cleanCode);
    localStorage.setItem('dailycal_family_code', cleanCode);

    if (user && db) {
      try {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'account'), {
          familyCode: cleanCode
        }, { merge: true });
      } catch (err) {
        console.error("Firestore family code save error:", err);
      }
    }
  };

  const handleLeaveFamilyRequest = () => {
    setIsConfirmLeaveOpen(true);
  };

  const confirmLeaveFamily = async () => {
    setFamilyCode(null);
    localStorage.removeItem('dailycal_family_code');
    if (user && db) {
      try {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'account'), { familyCode: null });
      } catch (err) { console.error(err); }
    }
    setIsConfirmLeaveOpen(false);
    setIsSidebarOpen(false);
    setCurrentView('dashboard');
  };

  const openNewProfile = () => {
    setProfileForm({ name: '', age: '', gender: 'male', weight: '', height: '', activity: 'sedentary' });
    setEditingProfileId(null);
    setProfileError("");
    setIsUsersModalOpen(false);
    setIsProfileModalOpen(true);
  };

  const openEditProfile = (profile: Profile | null) => {
    if (!profile) return;
    setProfileForm({ 
      name: profile.name, age: String(profile.age), gender: profile.gender, weight: String(profile.weight), height: String(profile.height), activity: profile.activity 
    });
    setEditingProfileId(profile.id);
    setProfileError("");
    setIsUsersModalOpen(false);
    setIsProfileModalOpen(true);
  };

  const calculateTargetsAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!familyCode) return;
    const name = profileForm.name.trim();
    const weight = parseFloat(profileForm.weight);
    const height = parseFloat(profileForm.height);
    const age = parseInt(profileForm.age);
    
    if (!name || isNaN(weight) || isNaN(height) || isNaN(age)) {
      setProfileError("Mohon isi semua data dengan benar.");
      return;
    }
    setProfileError("");

    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    bmr = profileForm.gender === 'male' ? bmr + 5 : bmr - 161;

    const multipliers: Record<string, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
    const calculatedCalorieGoal = Math.round(bmr * (multipliers[profileForm.activity] || 1.2));
    const calculatedWaterGoal = Math.round(weight * 35);

    setIsCloudSyncing(true);
    const profileDataToSave: Profile = {
      id: editingProfileId || `profile_${Date.now()}`,
      name,
      age,
      gender: profileForm.gender,
      weight,
      height,
      activity: profileForm.activity,
      calorieGoal: calculatedCalorieGoal,
      waterGoal: calculatedWaterGoal,
      updatedAt: Date.now()
    };

    // Save locally
    let updatedProfiles = [...profiles];
    if (editingProfileId) {
      updatedProfiles = updatedProfiles.map(p => p.id === editingProfileId ? profileDataToSave : p);
    } else {
      updatedProfiles.push(profileDataToSave);
      setActiveProfileId(profileDataToSave.id);
    }
    setProfiles(updatedProfiles);
    localStorage.setItem('dailycal_profiles', JSON.stringify(updatedProfiles));

    // Save to Firestore if connected
    if (user && db) {
      const safeCode = familyCode.replace(/[^a-zA-Z0-9]/g, '_');
      try {
        if (editingProfileId) {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', `family_${safeCode}_profiles`, editingProfileId), profileDataToSave, { merge: true });
        } else {
          const newDocRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', `family_${safeCode}_profiles`), {
            ...profileDataToSave, createdAt: Date.now()
          });
          setActiveProfileId(newDocRef.id);
        }
      } catch (err) { console.error("Firestore save profile error:", err); } 
    }
    setIsCloudSyncing(false);
    setIsProfileModalOpen(false);
  };

  const handleUpdateWater = async (amountToAdd: number) => {
    if (!activeProfileId || !familyCode) return;
    const newAmount = Math.max(0, waterIntake + amountToAdd);
    const todayDoc = getTodayDateString();
    const waterLogId = `${todayDoc}_${activeProfileId}`;

    const newWaterLog: WaterLog = {
      id: waterLogId,
      amount: newAmount,
      profileId: activeProfileId,
      dateString: todayDoc,
      updatedAt: Date.now()
    };

    // Save locally
    const existingIndex = allWaterLogsRaw.findIndex(w => w.id === waterLogId || (w.profileId === activeProfileId && w.dateString === todayDoc));
    let updatedWaterLogs = [...allWaterLogsRaw];
    if (existingIndex >= 0) {
      updatedWaterLogs[existingIndex] = newWaterLog;
    } else {
      updatedWaterLogs.push(newWaterLog);
    }
    setAllWaterLogsRaw(updatedWaterLogs);
    localStorage.setItem('dailycal_water_logs', JSON.stringify(updatedWaterLogs));

    // Firestore update if connected
    if (user && db) {
      const safeCode = familyCode.replace(/[^a-zA-Z0-9]/g, '_');
      try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', `family_${safeCode}_water`, waterLogId), newWaterLog, { merge: true });
      } catch (err) { console.error("Firestore water update error:", err); }
    }
  };

  const handleEditAnalysis = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.name === 'name' ? e.target.value : (parseInt(e.target.value) || 0);
    setAnalysisResult((prev: any) => ({ ...prev, [e.target.name]: val }));
  };

  const triggerCamera = () => { setIsSourceModalOpen(false); cameraInputRef.current?.click(); };
  const triggerGallery = () => { setIsSourceModalOpen(false); galleryInputRef.current?.click(); };

  const handleSendAiMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim() || isAiTyping) return;

    const newUserMsg: ChatMessage = { role: 'user', text: aiInput };
    setAiChatHistory(prev => [...prev, newUserMsg]);
    setAiInput('');
    setIsAiTyping(true);

    try {
      const data = await fetchWithRetry('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: aiChatHistory,
          message: newUserMsg.text,
          language
        })
      });

      const replyText = data.text || "Maaf, saya sedang tidak fokus. Bisa ulangi pertanyaannya?";
      setAiChatHistory(prev => [...prev, { role: 'model', text: replyText }]);
    } catch (err: any) {
      setAiChatHistory(prev => [...prev, { role: 'model', text: err.message || "Aduh, koneksi terputus. Coba periksa sinyal ya, Ndoro!" }]);
    } finally {
      setIsAiTyping(false);
    }
  };

  useEffect(() => {
    if (currentView === 'ask_ai') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiChatHistory, currentView, isAiTyping]);

  const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = 500 / img.width;
        canvas.width = 500;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6); 
        setCurrentImage(dataUrl);
        setIsCameraModalOpen(true);
        analyzeFood(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const analyzeFood = async (dataUrl: string) => {
    setIsAnalyzing(true); setError(null); setAnalysisResult(null);
    try {
      const data = await fetchWithRetry('/api/analyze-food', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: dataUrl })
      });
      if (data.isFood === false) {
        setError("Bukan makanan atau minuman. Coba foto ulang.");
      } else {
        setAnalysisResult(data);
      }
    } catch (err: any) { 
      setError(err.message || "Gagal menganalisis makanan. Coba lagi."); 
    } finally { 
      setIsAnalyzing(false); 
    }
  };

  const handleSaveToCloud = async () => {
    if (!analysisResult || !activeProfileId || !familyCode) return;
    setIsCloudSyncing(true);
    const now = new Date();
    const newLog: FoodLog = {
      id: `log_${Date.now()}`,
      profileId: activeProfileId,
      name: analysisResult.name,
      calories: analysisResult.calories || 0,
      protein: analysisResult.protein || 0,
      carbs: analysisResult.carbs || 0,
      fat: analysisResult.fat || 0,
      imageUrl: currentImage || undefined,
      timestamp: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      dateString: now.toLocaleDateString('id-ID'),
      createdAt: now.getTime()
    };

    // Save locally
    const updated = [newLog, ...allLogsRaw];
    setAllLogsRaw(updated);
    localStorage.setItem('dailycal_food_logs', JSON.stringify(updated));

    // Firestore sync if connected
    if (user && db) {
      const safeCode = familyCode.replace(/[^a-zA-Z0-9]/g, '_');
      try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', `family_${safeCode}_food`), {
          ...newLog
        });
      } catch (err) { setError("Gagal menyimpan ke Firestore."); }
    }
    setIsCloudSyncing(false);
    closeCameraModal();
  };

  const closeCameraModal = () => { setIsCameraModalOpen(false); setCurrentImage(null); setAnalysisResult(null); setError(null); };
  const navigateTo = (view: string) => { setCurrentView(view); setIsSidebarOpen(false); };

  if (authLoading || isCheckingFamily) return <div className="min-h-screen flex items-center justify-center text-gray-500 bg-gray-50 font-sans">Memuat data...</div>;

  if (!familyCode) {
    return (
      <div className="bg-gray-50 min-h-screen font-sans flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-xl text-center">
          <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldCheck className="w-8 h-8 text-green-600"/>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Kode Keluarga</h2>
          <p className="text-gray-500 text-sm mb-8">Buat kode rahasia baru atau masukkan kode keluarga Anda untuk sinkronisasi antar perangkat.</p>
          <form onSubmit={handleJoinFamily} className="space-y-4">
            <div className="relative">
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input type="text" required placeholder="Cth: KeluargaBudi123" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 pl-12 pr-4 text-gray-800 font-bold focus:outline-none focus:ring-2 focus:ring-green-500 transition-all"/>
            </div>
            <button type="submit" className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 rounded-2xl shadow-lg transition-transform active:scale-95">Mulai Sinkronisasi</button>
          </form>
        </div>
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="bg-gray-50 min-h-screen font-sans flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-xl text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Selamat Datang!</h2>
          <p className="text-gray-500 text-sm mb-8">Ruang <span className="font-bold text-green-600">{familyCode}</span> berhasil dibuat. Tambahkan anggota keluarga pertama.</p>
          <button onClick={openNewProfile} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 rounded-2xl shadow-lg flex justify-center gap-2 items-center"><Plus className="w-5 h-5"/> Buat Profil Anda</button>
          <button onClick={handleLeaveFamilyRequest} className="mt-4 text-gray-400 hover:text-red-500 text-sm font-medium">Keluar Ruangan</button>
        </div>
        {isProfileModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
            <div className="bg-white w-full max-w-md rounded-3xl flex flex-col shadow-2xl max-h-[90vh]">
              <div className="px-5 py-4 flex justify-between items-center border-b"><h3 className="font-bold text-lg">Profil Baru</h3><X className="w-6 h-6 text-gray-400 cursor-pointer" onClick={() => setIsProfileModalOpen(false)}/></div>
              <div className="p-5 overflow-y-auto">
                <form id="profForm" onSubmit={calculateTargetsAndSave} className="space-y-4">
                  <div><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Nama</label><input type="text" name="name" value={profileForm.name} onChange={handleProfileChange} className="border w-full p-3 rounded-xl focus:ring-2 focus:ring-green-500 bg-gray-50 font-bold"/></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Umur (Tahun)</label><input type="number" name="age" value={profileForm.age} onChange={handleProfileChange} className="border w-full p-3 rounded-xl focus:ring-2 focus:ring-green-500 bg-gray-50"/></div>
                    <div><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Gender</label><select name="gender" value={profileForm.gender} onChange={handleProfileChange} className="border w-full p-3 rounded-xl focus:ring-2 focus:ring-green-500 bg-gray-50"><option value="male">Pria</option><option value="female">Wanita</option></select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Berat (kg)</label><input type="number" name="weight" value={profileForm.weight} onChange={handleProfileChange} className="border w-full p-3 rounded-xl focus:ring-2 focus:ring-green-500 bg-gray-50"/></div>
                    <div><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Tinggi (cm)</label><input type="number" name="height" value={profileForm.height} onChange={handleProfileChange} className="border w-full p-3 rounded-xl focus:ring-2 focus:ring-green-500 bg-gray-50"/></div>
                  </div>
                  <div><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Aktivitas</label><select name="activity" value={profileForm.activity} onChange={handleProfileChange} className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-green-500 bg-gray-50"><option value="sedentary">Jarang Olahraga</option><option value="light">Olahraga Ringan</option><option value="moderate">Olahraga Sedang</option><option value="active">Olahraga Aktif</option></select></div>
                </form>
              </div>
              <div className="p-4 border-t bg-gray-50 rounded-b-3xl"><button type="submit" form="profForm" className="w-full bg-green-500 hover:bg-green-600 text-white py-3.5 rounded-xl font-bold shadow-sm">Simpan</button></div>
            </div>
          </div>
        )}
        
        {isConfirmLeaveOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Keluar Ruang Keluarga?</h3>
              <p className="text-gray-500 text-sm mb-6">Data Anda tidak akan terhapus, namun Anda akan keluar dari sinkronisasi ruang keluarga ini.</p>
              <div className="flex gap-3">
                <button onClick={() => setIsConfirmLeaveOpen(false)} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors">Batal</button>
                <button onClick={confirmLeaveFamily} className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors">Ya, Keluar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const menuItems = [
    { id: 'dashboard', label: uiDict[language]?.dash || 'Jurnal Harian', icon: Home, color: 'text-green-500' },
    { id: 'leaderboard', label: uiDict[language]?.lead || 'Papan Peringkat', icon: Trophy, color: 'text-yellow-500' },
    { id: 'workout', label: uiDict[language]?.work || 'Program Olahraga', icon: Dumbbell, color: 'text-orange-500' },
    { id: 'recipes', label: uiDict[language]?.rec || 'Meal Plan Mingguan', icon: ChefHat, color: 'text-blue-500' },
    { id: 'analytics', label: uiDict[language]?.anal || 'Analitik Keluarga', icon: BarChart3, color: 'text-purple-500' },
    { id: 'ask_ai', label: uiDict[language]?.ask || 'Tanya AI', icon: Bot, color: 'text-teal-500' },
    { id: 'market', label: uiDict[language]?.shop || 'Toko Sehat', icon: BookOpen, color: 'text-rose-500' },
  ];
  
  const weeklyPlan = [
    { day: 'Senin', cal: 1400, 
      b: { name: 'Oatmeal Pisang & Madu', ingredients: ['4 sdm Oatmeal', '1 buah Pisang iris', '1 sdm Madu', '150ml Susu Cair'], steps: ['Campur oatmeal dan susu, panaskan atau rendam semalaman.', 'Tambahkan irisan pisang dan tuang madu di atasnya.'] }, 
      l: { name: 'Dada Ayam Panggang & Quinoa', ingredients: ['150g Dada Ayam Fillet', '50g Quinoa matang', 'Lada, Garam, Bawang Putih', 'Sayuran kukus'], steps: ['Marinasi ayam, lalu panggang di teflon tanpa minyak.', 'Sajikan dengan quinoa dan sayuran kukus.'] }, 
      d: { name: 'Salad Sayur Telur Rebus', ingredients: ['2 butir Telur Rebus', 'Selada, Tomat Ceri, Timun', '1 sdm Minyak Zaitun', 'Perasan Lemon'], steps: ['Potong semua sayur dan telur.', 'Campur di mangkuk, siram dressing minyak zaitun & lemon.'] }
    },
    { day: 'Selasa', cal: 1550, 
      b: { name: 'Roti Gandum Alpukat', ingredients: ['2 lbr Roti Gandum', '1/2 buah Alpukat', 'Garam & Lada', '1 Telur Ceplok'], steps: ['Panggang roti gandum.', 'Lumatkan alpukat dan oles ke atas roti.', 'Tambahkan telur ceplok di atasnya.'] }, 
      l: { name: 'Sup Kacang Merah & Daging', ingredients: ['50g Kacang Merah', '100g Daging Sapi dadu', 'Wortel & Kentang', 'Bumbu Sup'], steps: ['Presto daging dan kacang merah hingga empuk.', 'Masukkan wortel, kentang, dan bumbu sup.', 'Masak hingga matang.'] }, 
      d: { name: 'Ikan Bakar & Tumis Kangkung', ingredients: ['1 ekor Ikan Nila/Bawal', 'Bumbu Kuning', 'Kangkung 1 ikat', 'Bawang putih & saus tiram'], steps: ['Olesi ikan dengan bumbu kuning lalu bakar.', 'Tumis bawang putih, masukkan kangkung dan saus tiram.'] }
    },
    { day: 'Rabu', cal: 1350, 
      b: { name: 'Smoothie Bayam Berry', ingredients: ['1 genggam Bayam', '1/2 cup Strawberry/Blueberry', '1 buah Pisang', 'Susu Almond'], steps: ['Masukkan semua bahan ke dalam blender.', 'Blender hingga halus.'] }, 
      l: { name: 'Nasi Merah & Sate Ayam Taichan', ingredients: ['100g Nasi Merah', '150g Dada Ayam', 'Bawang putih & Jeruk nipis', 'Sambal'], steps: ['Potong ayam dadu, marinasi dengan bawang putih & jeruk nipis.', 'Tusuk dan bakar hingga matang, sajikan dengan sambal.'] }, 
      d: { name: 'Tahu Tempe Bacem & Lalapan', ingredients: ['2 ptg Tahu & Tempe', 'Bumbu Bacem', 'Kecap Manis', 'Lalapan mentah'], steps: ['Rebus tahu tempe bersama bumbu bacem hingga air menyusut.', 'Panggang sebentar di teflon (opsional).'] }
    },
    { day: 'Kamis', cal: 1450, 
      b: { name: 'Omelet 2 Telur & Jamur', ingredients: ['2 butir Telur', '50g Jamur Kancing iris', 'Bawang bombay', 'Garam & Lada'], steps: ['Tumis jamur dan bawang bombay hingga layu.', 'Kocok telur dan tuangkan ke tumisan jamur.', 'Masak hingga matang.'] }, 
      l: { name: 'Soto Ayam Kuah Bening', ingredients: ['150g Suwiran Ayam', 'Tauge & Soun', 'Kuah Kaldu Soto', 'Nasi putih/merah secukupnya'], steps: ['Rebus kaldu soto dengan bumbu halus.', 'Tata soun, tauge, dan ayam di mangkuk, siram kuah soto panas.'] }, 
      d: { name: 'Tumis Brokoli Udang', ingredients: ['100g Udang kupas', '1 bonggol Brokoli', 'Bawang Putih', 'Saus Tiram'], steps: ['Tumis bawang putih, masukkan udang hingga berubah warna.', 'Masukkan brokoli dan saus tiram, beri sedikit air, masak sebentar.'] }
    },
    { day: 'Jumat', cal: 1500, 
      b: { name: 'Yogurt & Chia Seeds', ingredients: ['150ml Greek Yogurt', '1 sdm Chia Seeds', 'Potongan buah (mangga/kiwi)'], steps: ['Tuang yogurt ke dalam mangkuk.', 'Taburkan chia seeds dan potongan buah.'] }, 
      l: { name: 'Gado-Gado', ingredients: ['Sayuran rebus (kangkung, kacang panjang, kol)', 'Tahu & Tempe goreng', 'Bumbu Kacang', 'Telur Rebus'], steps: ['Tata sayuran, tahu, tempe, dan telur di piring.', 'Siram dengan bumbu kacang.'] }, 
      d: { name: 'Ayam Suwir Sambal Matah', ingredients: ['150g Ayam Dada rebus', 'Bawang merah, Serai, Daun Jeruk', 'Cabai rawit', 'Minyak kelapa panas'], steps: ['Suwir ayam rebus.', 'Iris tipis bahan sambal matah, siram minyak panas, campur dengan ayam.'] }
    },
    { day: 'Sabtu', cal: 1600, 
      b: { name: 'Pancake Pisang Oat', ingredients: ['1 buah Pisang lumat', '4 sdm Oat halus', '1 butir Telur', 'Sedikit kayu manis'], steps: ['Campur semua bahan menjadi adonan.', 'Panggang di teflon dengan sedikit mentega hingga kecoklatan.'] }, 
      l: { name: 'Spaghetti Gandum Bolognese', ingredients: ['80g Spaghetti Gandum (mentah)', '50g Daging Cincang', 'Saus Tomat / Bolognese', 'Bawang bombay'], steps: ['Rebus spaghetti hingga al dente.', 'Tumis bawang bombay, masukkan daging dan saus tomat, campurkan dengan pasta.'] }, 
      d: { name: 'Steak Tempe Saus Lada Hitam', ingredients: ['1 balok Tempe', 'Tepung Bumbu (sedikit)', 'Saus Lada Hitam instan', 'Sayuran rebus'], steps: ['Kukus tempe, lumatkan, dan bentuk seperti patty.', 'Panggang patty tempe, siram saus lada hitam.'] }
    },
    { day: 'Minggu', cal: 1700, 
      b: { name: 'Bubur Ayam Kuah Kuning', ingredients: ['1 mangkuk Bubur (Nasi dimasak banyak air)', 'Ayam Suwir', 'Kuah Kuning (kaldu & kunyit)', 'Kecap & Sambal'], steps: ['Masak bubur.', 'Sajikan bubur dengan kuah kuning dan taburan ayam suwir.'] }, 
      l: { name: 'Ikan Pepes & Nasi Jagung', ingredients: ['1 ekor Ikan (Kembung/Nila)', 'Bumbu Pepes (kunyit, kemiri, kemangi)', 'Daun Pisang', 'Nasi Jagung'], steps: ['Balur ikan dengan bumbu, bungkus daun pisang.', 'Kukus hingga matang, lalu panggang sebentar.'] }, 
      d: { name: 'Sop Buntut (Porsi Sedang)', ingredients: ['150g Buntut Sapi', 'Wortel & Kentang', 'Pala, Cengkeh, Kayu Manis', 'Daun Bawang & Seledri'], steps: ['Presto buntut sapi hingga empuk.', 'Masak bersama sayuran dan bumbu rempah hingga matang meresap.'] }
    },
  ];

  const darebeeRoutines = [
    { id: 'db1', title: 'Beginner Abs', focus: 'Fokus Otot Perut & Inti', cal: '~150 kkal', time: '15 Min', img: 'https://darebee.com/images/workouts/beginner-abs-workout.jpg' },
    { id: 'db2', title: 'Cardio Light', focus: 'Kardio Ringan & Kelenturan', cal: '~120 kkal', time: '15 Min', img: 'https://darebee.com/images/workouts/cardio-light-workout.jpg' },
    { id: 'db3', title: 'Easy Core', focus: 'Kekuatan Inti Dasar', cal: '~100 kkal', time: '15 Min', img: 'https://darebee.com/images/workouts/easy-core-workout.jpg' },
    { id: 'db4', title: 'Epic Workout', focus: 'Kardio & Ketahanan Intens', cal: '~300 kkal', time: '30 Min', img: 'https://darebee.com/images/workouts/epic-workout.jpg' },
    { id: 'db5', title: 'Fullbody Render', focus: 'Bakar Lemak Menyeluruh', cal: '~250 kkal', time: '20 Min', img: 'https://darebee.com/images/workouts/fullbody-render-workout.jpg' }
  ];

  return (
    <div className={`bg-gray-50 min-h-screen text-gray-800 font-sans pb-24 md:pb-0 md:flex md:justify-center ${isDarkMode ? 'dark-theme' : ''}`}>
      <style>{isDarkMode ? darkThemeStyles : ''}</style>
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onClick={() => setIsSidebarOpen(false)} />
          <div className="relative w-4/5 max-w-sm bg-white h-full shadow-2xl flex flex-col transform transition-transform duration-300">
            <div className="p-6 bg-green-50 border-b border-green-100 flex flex-col justify-end min-h-[140px]">
              <div className="w-14 h-14 bg-white rounded-full border-4 border-green-500 flex items-center justify-center mb-3 shadow-sm">
                <User className="w-6 h-6 text-green-600" />
              </div>
              <h2 className="font-bold text-xl text-gray-800 capitalize">{activeProfile?.name || 'User'}</h2>
              <div className="flex items-center gap-2 mt-1">
                <ShieldCheck className="w-4 h-4 text-green-600" />
                <span className="text-xs text-green-700 font-medium bg-green-100 px-2 py-0.5 rounded-full">Ruang: {familyCode}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
              {menuItems.map(item => (
                <button 
                  key={item.id} 
                  onClick={() => navigateTo(item.id)}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-colors ${currentView === item.id ? 'bg-green-500 text-white shadow-md' : 'hover:bg-gray-50 text-gray-600'}`}
                >
                  <item.icon className={`w-6 h-6 ${currentView === item.id ? 'text-white' : item.color}`} />
                  <span className="font-bold">{item.label}</span>
                  {(item.id === 'market') && (
                    <span className="ml-auto text-[9px] font-bold uppercase tracking-wider bg-gray-100 text-gray-400 px-2 py-1 rounded-lg">Segera</span>
                  )}
                </button>
              ))}
            </div>

            <div className="p-4 border-t border-gray-100 space-y-2">
              <button onClick={() => { setIsHistoryModalOpen(true); setIsSidebarOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-2xl transition-colors font-medium">
                <Calendar className="w-5 h-5 text-gray-400" /> Lihat Riwayat
              </button>
              <button onClick={() => { setIsUsersModalOpen(true); setIsSidebarOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-2xl transition-colors font-medium">
                <Users className="w-5 h-5 text-gray-400" /> Ganti Anggota Keluarga
              </button>
              <button onClick={handleLeaveFamilyRequest} className="w-full flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 rounded-2xl transition-colors font-medium">
                <LogOut className="w-5 h-5" /> Keluar Ruangan
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-md bg-white min-h-screen shadow-xl relative flex flex-col">
        <header className="px-5 py-4 border-b border-gray-100 flex justify-between items-center sticky top-0 z-10 bg-white">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 bg-white hover:bg-gray-100 rounded-full transition-colors">
              <Menu className="w-6 h-6 text-gray-700" />
            </button>
            <h1 className="text-xl font-bold text-green-600 flex items-center gap-1.5">
              {uiDict[language]?.appName || 'DailyCal'}
            </h1>
          </div>
          <div className="flex gap-2 items-center">
            
            {/* Mode Gelap/Terang Toggle */}
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 bg-gray-100 hover:bg-gray-200 transition-colors rounded-full text-gray-600 shrink-0">
              {isDarkMode ? <Sun className="w-4 h-4"/> : <Moon className="w-4 h-4"/>}
            </button>
            
            {/* Bahasa Dropdown Toggle */}
            <div className="relative shrink-0">
              <button onClick={() => setIsLangMenuOpen(!isLangMenuOpen)} className="p-2 bg-gray-100 hover:bg-gray-200 transition-colors rounded-full text-gray-600">
                <Globe className="w-4 h-4"/>
              </button>
              {isLangMenuOpen && (
                <div className="absolute right-0 mt-2 w-36 bg-white border border-gray-100 rounded-xl shadow-lg z-50 overflow-hidden">
                  {Object.keys(langNames).map(langKey => (
                    <button key={langKey} onClick={() => { setLanguage(langKey); setIsLangMenuOpen(false); }} className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${language === langKey ? 'font-bold text-green-600 bg-green-50' : 'text-gray-700'}`}>
                      {langNames[langKey]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <a href="https://sociabuzz.com/kenzkha/donate" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 transition-all text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-md shrink-0 transform hover:scale-105">
              <Heart className="w-4 h-4 fill-current animate-pulse"/>
              <span className="hidden sm:inline-block">Donate</span>
            </a>
            {isCloudSyncing ? <Cloud className="text-blue-500 animate-pulse w-5 h-5 shrink-0"/> : <Cloud className="text-green-500 w-5 h-5 shrink-0"/>}
            <button onClick={() => setIsUsersModalOpen(true)} className="flex items-center gap-1.5 bg-green-50 hover:bg-green-100 transition-colors text-green-700 px-3 py-1.5 rounded-full text-sm font-bold border border-green-100 shrink-0">
              <Users className="w-4 h-4"/> 
              <span className="max-w-[50px] truncate">{activeProfile?.name || 'Profile'}</span>
            </button>
          </div>
        </header>

        {currentView === 'dashboard' && (
          <main className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10"><User className="w-24 h-24"/></div>
              
              <div className="flex justify-between items-start mb-6 relative z-10">
                <div>
                  <p className="font-medium text-green-100 text-sm">Kalori Harian {activeProfile?.name}</p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-4xl font-extrabold">{totalCalories}</span>
                    <span className="text-lg text-green-100">/ {activeProfile?.calorieGoal || 2000}</span>
                  </div>
                </div>
                <button onClick={() => openEditProfile(activeProfile)} className="bg-white/20 hover:bg-white/30 transition-colors p-2 rounded-xl text-xs flex flex-col items-center">
                  <Settings className="w-5 h-5"/>Target
                </button>
              </div>
              
              <div className="grid grid-cols-3 gap-4 bg-white/10 rounded-2xl p-4 relative z-10">
                <div className="text-center"><span className="text-xs uppercase text-blue-200">Pro</span><p className="font-bold text-lg">{totalProtein}g</p></div>
                <div className="text-center border-x border-white/20"><span className="text-xs uppercase text-yellow-200">Karbo</span><p className="font-bold text-lg">{totalCarbs}g</p></div>
                <div className="text-center"><span className="text-xs uppercase text-red-200">Lemak</span><p className="font-bold text-lg">{totalFat}g</p></div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-gray-100 flex justify-between items-center shadow-sm">
              <div className="flex gap-4 items-center">
                <div className="bg-blue-50 p-3 rounded-2xl"><GlassWater className="text-blue-500 w-7 h-7"/></div>
                <div>
                  <h3 className="font-bold text-gray-800">Minum Air</h3>
                  <p className="text-sm text-blue-500 font-medium">{waterIntake} <span className="text-gray-400">/ {activeProfile?.waterGoal || 2000} ml</span></p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={() => handleUpdateWater(250)} className="bg-blue-50 hover:bg-blue-100 transition-colors text-blue-600 px-3 py-1.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1"><Plus className="w-4 h-4"/> 250ml</button>
                <button onClick={() => handleUpdateWater(-250)} disabled={waterIntake===0} className="bg-gray-50 hover:bg-gray-100 transition-colors text-gray-500 px-3 py-1.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1 disabled:opacity-50"><Minus className="w-4 h-4"/> Batal</button>
              </div>
            </div>

            <div>
              <h2 className="font-bold mb-4 text-gray-800">Jurnal Makanan (Hari Ini)</h2>
              {foodLogsToday.length === 0 ? (
                <div className="bg-gray-50 p-8 rounded-2xl text-center border-2 border-dashed border-gray-200">
                  <Camera className="w-8 h-8 mx-auto text-gray-400 mb-2"/>
                  <p className="text-gray-500 text-sm">Belum ada asupan tercatat untuk {activeProfile?.name}.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {foodLogsToday.map(log => (
                    <div key={log.id} className="bg-white p-4 rounded-2xl border flex gap-4 items-center shadow-sm">
                      {log.imageUrl ? (
                        <img src={log.imageUrl} alt={log.name} className="w-16 h-16 rounded-xl object-cover border border-gray-100" />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-green-50 flex items-center justify-center text-green-600 font-bold border border-gray-100">
                          <ChefHat className="w-8 h-8"/>
                        </div>
                      )}
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-800 capitalize">{log.name}</h3>
                        <p className="text-xs text-gray-400">{log.timestamp}</p>
                        <div className="text-xs mt-2 flex gap-2">
                          <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-medium">P:{log.protein}</span>
                          <span className="text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded font-medium">K:{log.carbs}</span>
                          <span className="text-red-600 bg-red-50 px-1.5 py-0.5 rounded font-medium">L:{log.fat}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-green-600 text-lg">{log.calories}</span><p className="text-[10px] text-gray-400 uppercase font-medium">kkal</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>
        )}

        {currentView === 'leaderboard' && (
          <main className="flex-1 overflow-y-auto bg-gray-50 flex flex-col">
            <div className="bg-white px-6 pt-6 pb-4 rounded-b-3xl shadow-sm z-10 relative">
              <div className="flex items-center justify-center gap-2 mb-6">
                <Trophy className="w-8 h-8 text-yellow-500"/>
                <h2 className="text-2xl font-bold text-gray-800">Papan Peringkat</h2>
              </div>
              
              <div className="flex bg-gray-100 p-1.5 rounded-2xl">
                <button 
                  onClick={() => setLeaderboardTab('water')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${leaderboardTab === 'water' ? 'bg-white text-blue-600 shadow' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <GlassWater className="w-4 h-4"/> Raja/Ratu Air
                </button>
                <button 
                  onClick={() => setLeaderboardTab('calories')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${leaderboardTab === 'calories' ? 'bg-white text-orange-500 shadow' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <Flame className="w-4 h-4"/> Pejuang Kalori
                </button>
              </div>
            </div>

            <div className="p-6 flex-1">
              {profiles.length < 2 ? (
                 <div className="bg-white p-8 rounded-3xl border border-gray-100 text-center">
                   <div className="bg-yellow-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                     <Users className="w-8 h-8 text-yellow-500"/>
                   </div>
                   <h3 className="font-bold text-gray-800 mb-2">Ajak Keluarga!</h3>
                   <p className="text-sm text-gray-500">Papan peringkat akan seru jika dimainkan bersama. Tambahkan anggota keluarga lain untuk mulai bersaing sehat.</p>
                 </div>
              ) : (
                <div className="space-y-4">
                  {leaderboardData[leaderboardTab].map((member, index) => {
                    const isFirst = index === 0;
                    const isSecond = index === 1;
                    const isThird = index === 2;
                    const valAmount = leaderboardTab === 'water' ? member.waterAmount : member.totalCalories;
                    const valGoal = leaderboardTab === 'water' ? member.waterGoal : member.calorieGoal;
                    const valUnit = leaderboardTab === 'water' ? 'ml' : 'kkal';
                    const progress = leaderboardTab === 'water' ? member.waterProgress : member.calProgress;

                    return (
                      <div 
                        key={member.id} 
                        className={`relative overflow-hidden flex items-center gap-4 p-4 rounded-3xl transition-all shadow-sm
                          ${isFirst ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-400 scale-[1.02]' : 
                            isSecond ? 'bg-white border-2 border-gray-200' : 
                            isThird ? 'bg-white border-2 border-orange-200' : 'bg-white border border-gray-100'}`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-lg shrink-0
                          ${isFirst ? 'bg-yellow-400 text-white shadow-md' : 
                            isSecond ? 'bg-gray-200 text-gray-600' : 
                            isThird ? 'bg-orange-200 text-orange-700' : 'bg-gray-50 text-gray-400'}`}
                        >
                          {isFirst ? <Crown className="w-5 h-5"/> : index + 1}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-800 capitalize flex items-center gap-2">
                            {member.name}
                            {member.id === activeProfileId && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full uppercase tracking-wider">Anda</span>}
                          </h3>
                          <div className="mt-2 h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-1000 ${leaderboardTab === 'water' ? 'bg-blue-500' : 'bg-orange-500'}`} style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`font-black text-xl block ${leaderboardTab === 'water' ? 'text-blue-600' : 'text-orange-500'}`}>
                            {valAmount}
                          </span>
                          <span className="text-[10px] text-gray-400 font-bold">/ {valGoal} {valUnit}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </main>
        )}

        {currentView === 'workout' && (
          <main className="flex-1 overflow-y-auto bg-gray-50 flex flex-col pb-6">
            <div className="bg-white px-6 pt-6 pb-6 rounded-b-3xl shadow-sm z-10 relative">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Dumbbell className="w-8 h-8 text-orange-500"/>
                <h2 className="text-2xl font-bold text-gray-800">Program Olahraga</h2>
              </div>
              <p className="text-center text-gray-500 text-sm">Tetap aktif dan bugar, mulai dari rumah.</p>
            </div>

            <div className="px-5 mt-6 space-y-6">
              <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex items-start gap-3 shadow-sm">
                <ExternalLink className="w-6 h-6 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-blue-800 text-sm">Powered by Darebee</h4>
                  <p className="text-xs text-blue-600 mt-1">Program latihan di bawah ini diambil langsung dari koleksi publik <a href="https://darebee.com" target="_blank" rel="noopener noreferrer" className="underline font-bold">darebee.com</a>. Ketuk gambar untuk memperbesar poster latihan.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5">
                {darebeeRoutines.map((routine) => (
                  <div key={routine.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedWorkout(routine)}>
                    <div className="h-40 bg-gray-100 relative overflow-hidden">
                      <img src={routine.img} alt={routine.title} className="w-full h-full object-cover object-top opacity-90 hover:opacity-100 transition-opacity" loading="lazy" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                      <div className="absolute bottom-3 left-4 right-4 text-white">
                        <h4 className="font-bold text-lg">{routine.title}</h4>
                        <p className="text-xs text-gray-200">{routine.focus}</p>
                      </div>
                    </div>
                    <div className="p-4 flex justify-between items-center bg-white">
                      <div className="flex gap-3">
                        <span className="flex items-center gap-1 text-xs font-bold text-gray-500 bg-gray-100 px-2.5 py-1.5 rounded-lg"><Timer className="w-3.5 h-3.5"/> {routine.time}</span>
                        <span className="flex items-center gap-1 text-xs font-bold text-orange-500 bg-orange-50 px-2.5 py-1.5 rounded-lg"><Flame className="w-3.5 h-3.5"/> {routine.cal}</span>
                      </div>
                      <button className="bg-orange-500 text-white p-2 rounded-xl shadow-sm hover:bg-orange-600 transition-colors">
                        <PlayCircle className="w-5 h-5"/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </main>
        )}

        {currentView === 'recipes' && (
          <main className="flex-1 overflow-y-auto bg-gray-50 flex flex-col pb-6">
            <div className="bg-white px-6 pt-6 pb-6 rounded-b-3xl shadow-sm z-10 relative">
              <div className="flex items-center justify-center gap-2 mb-2">
                <ChefHat className="w-8 h-8 text-blue-500"/>
                <h2 className="text-2xl font-bold text-gray-800">Meal Plan Mingguan</h2>
              </div>
              <p className="text-center text-gray-500 text-sm">Pola makan sehat, praktis, dan kaya nutrisi.</p>
            </div>
            
            <div className="px-5 mt-6 space-y-4">
              <p className="text-xs text-gray-500 text-center bg-gray-100 py-2 rounded-xl border border-gray-200 border-dashed">💡 Ketuk nama makanan untuk melihat resep</p>
              {weeklyPlan.map((plan, idx) => (
                <div key={idx} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
                  <div className="flex justify-between items-center mb-4 border-b border-gray-50 pb-3">
                    <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2"><Calendar className="w-5 h-5 text-blue-500"/> {plan.day}</h3>
                    <span className="bg-orange-100 text-orange-600 text-xs font-bold px-2 py-1 rounded-lg">~{plan.cal} kkal</span>
                  </div>
                  <div className="space-y-3">
                    <div onClick={() => setSelectedRecipe(plan.b)} className="flex items-start gap-3 cursor-pointer group hover:bg-gray-50 p-2 -ml-2 rounded-xl transition-colors">
                      <div className="bg-yellow-50 p-2 rounded-xl group-hover:bg-yellow-100 transition-colors"><Sparkles className="w-4 h-4 text-yellow-500"/></div>
                      <div className="flex-1">
                        <p className="text-[10px] uppercase font-bold text-gray-400">Sarapan</p>
                        <p className="text-sm font-bold text-gray-700 group-hover:text-blue-600 transition-colors">{plan.b.name}</p>
                      </div>
                    </div>
                    <div onClick={() => setSelectedRecipe(plan.l)} className="flex items-start gap-3 cursor-pointer group hover:bg-gray-50 p-2 -ml-2 rounded-xl transition-colors">
                      <div className="bg-green-50 p-2 rounded-xl group-hover:bg-green-100 transition-colors"><Beef className="w-4 h-4 text-green-500"/></div>
                      <div className="flex-1">
                        <p className="text-[10px] uppercase font-bold text-gray-400">Makan Siang</p>
                        <p className="text-sm font-bold text-gray-700 group-hover:text-blue-600 transition-colors">{plan.l.name}</p>
                      </div>
                    </div>
                    <div onClick={() => setSelectedRecipe(plan.d)} className="flex items-start gap-3 cursor-pointer group hover:bg-gray-50 p-2 -ml-2 rounded-xl transition-colors">
                      <div className="bg-purple-50 p-2 rounded-xl group-hover:bg-purple-100 transition-colors"><Droplet className="w-4 h-4 text-purple-500"/></div>
                      <div className="flex-1">
                        <p className="text-[10px] uppercase font-bold text-gray-400">Makan Malam</p>
                        <p className="text-sm font-bold text-gray-700 group-hover:text-blue-600 transition-colors">{plan.d.name}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </main>
        )}

        {currentView === 'analytics' && (
          <main className="flex-1 overflow-y-auto bg-gray-50 flex flex-col pb-6">
            <div className="bg-white px-6 pt-6 pb-6 rounded-b-3xl shadow-sm z-10 relative">
              <div className="flex items-center justify-center gap-2 mb-2">
                <BarChart3 className="w-8 h-8 text-purple-500"/>
                <h2 className="text-2xl font-bold text-gray-800">Analitik Keluarga</h2>
              </div>
              <p className="text-center text-gray-500 text-sm">Pantau pencapaian kesehatan bersama.</p>
            </div>

            <div className="px-5 mt-6 space-y-6">
              <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
                <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2"><Flame className="w-5 h-5 text-orange-500"/> Pemenuhan Kalori (Hari Ini)</h3>
                <div className="space-y-5">
                  {leaderboardData.calories.map(member => (
                    <div key={member.id}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700">{member.name}</span>
                        <span className="font-bold text-gray-500">{member.totalCalories} / {member.calorieGoal}</span>
                      </div>
                      <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-1000 ${member.calProgress > 100 ? 'bg-red-500' : 'bg-orange-500'}`} style={{ width: `${Math.min(member.calProgress, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
                <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2"><GlassWater className="w-5 h-5 text-blue-500"/> Konsumsi Air (Hari Ini)</h3>
                <div className="space-y-5">
                  {leaderboardData.water.map(member => (
                    <div key={member.id}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700">{member.name}</span>
                        <span className="font-bold text-gray-500">{member.waterAmount} / {member.waterGoal} ml</span>
                      </div>
                      <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-1000 bg-blue-500" style={{ width: `${member.waterProgress}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </main>
        )}

        {currentView === 'ask_ai' && (
          <main className="flex-1 flex flex-col bg-gray-50 h-full overflow-hidden relative">
            <div className="bg-white px-6 pt-4 pb-4 border-b border-gray-100 shadow-sm z-10 flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center shrink-0">
                <Bot className="w-6 h-6 text-teal-600"/>
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800 leading-tight">Jarvis AI</h2>
                <p className="text-xs text-teal-600 font-medium flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-500 inline-block animate-pulse"></span> Online</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {aiChatHistory.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-teal-500 text-white rounded-tr-sm' : 'bg-white text-gray-700 border border-gray-100 rounded-tl-sm'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isAiTyping && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-100 p-4 rounded-2xl rounded-tl-sm flex gap-1 items-center shadow-sm">
                    <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-4 bg-white border-t border-gray-100">
              <form onSubmit={handleSendAiMessage} className="flex gap-2 relative">
                <input 
                  type="text" 
                  value={aiInput} 
                  onChange={(e) => setAiInput(e.target.value)} 
                  placeholder="Tanya soal kalori, resep, atau workout..." 
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-full py-3.5 pl-5 pr-12 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
                  disabled={isAiTyping}
                />
                <button 
                  type="submit" 
                  disabled={!aiInput.trim() || isAiTyping}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-teal-500 text-white rounded-full hover:bg-teal-600 disabled:opacity-50 disabled:hover:bg-teal-500 transition-colors"
                >
                  <Send className="w-4 h-4"/>
                </button>
              </form>
            </div>
          </main>
        )}

        {(currentView === 'market') && (
          <main className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-50">
            {(() => {
               const viewDetails = menuItems.find(i => i.id === currentView);
               const Icon = viewDetails?.icon || BookOpen;
               return (
                 <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-w-xs w-full">
                   <div className={`w-20 h-20 mx-auto rounded-full bg-gray-50 flex items-center justify-center mb-6`}>
                     <Icon className={`w-10 h-10 ${viewDetails?.color}`} />
                   </div>
                   <h2 className="text-xl font-bold text-gray-800 mb-2">{viewDetails?.label}</h2>
                   <p className="text-gray-500 text-sm mb-6">Fitur ini sedang dalam tahap pengembangan untuk menjadikan aplikasi ini "Super App" kesehatan Anda.</p>
                   <button onClick={() => setCurrentView('dashboard')} className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl transition-colors">
                     Kembali ke Jurnal
                   </button>
                 </div>
               );
            })()}
          </main>
        )}

        {currentView === 'dashboard' && (
          <div className="fixed md:absolute bottom-6 left-0 right-0 flex justify-center z-20 pointer-events-none">
            <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} onChange={handleImageSelected} className="hidden" />
            <input type="file" accept="image/*" ref={galleryInputRef} onChange={handleImageSelected} className="hidden" />
            <button onClick={() => setIsSourceModalOpen(true)} className="pointer-events-auto bg-green-500 text-white p-4 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.2)] hover:bg-green-600 transition-transform active:scale-95">
              <Plus className="w-8 h-8"/>
            </button>
          </div>
        )}

        {isUsersModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
            <div className="bg-white w-full max-w-md rounded-3xl flex flex-col shadow-2xl">
              <div className="px-5 py-4 flex justify-between items-center border-b">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg flex items-center gap-2"><Users className="w-5 h-5 text-green-600"/> Anggota</h3>
                  <span className="text-xs bg-gray-100 px-2 py-1 rounded font-mono text-gray-500">{familyCode}</span>
                </div>
                <X className="w-6 h-6 text-gray-400 hover:text-gray-600 cursor-pointer" onClick={() => setIsUsersModalOpen(false)}/>
              </div>
              <div className="p-5 max-h-[60vh] overflow-y-auto">
                <div className="space-y-3">
                  {profiles.map(p => (
                    <div key={p.id} className={`flex justify-between items-center p-4 border-2 rounded-2xl transition-all ${p.id === activeProfileId ? 'border-green-500 bg-green-50/50' : 'border-gray-100 hover:border-gray-300'}`}>
                      <div onClick={() => { setActiveProfileId(p.id); setIsUsersModalOpen(false); }} className="flex-1 cursor-pointer font-bold flex items-center gap-3">
                        {p.id === activeProfileId ? <CheckCircle2 className="text-green-500 w-6 h-6"/> : <div className="w-6 h-6 rounded-full border-2 border-gray-300"/>}
                        <div>
                          <p className="text-gray-800">{p.name}</p>
                          <p className="text-xs text-gray-500 font-normal">Target: {p.calorieGoal} kkal</p>
                        </div>
                      </div>
                      <button onClick={() => openEditProfile(p)} className="p-2 bg-white rounded-xl border shadow-sm hover:bg-gray-50">
                        <Pencil className="w-4 h-4 text-gray-500"/>
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={openNewProfile} className="w-full mt-4 flex items-center justify-center gap-2 py-4 bg-gray-50 hover:bg-gray-100 border-2 border-dashed border-gray-300 rounded-2xl text-gray-600 font-bold transition-colors">
                  <Plus className="w-5 h-5"/> Tambah Anggota
                </button>
              </div>
            </div>
          </div>
        )}

        {isSourceModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-gray-900/60 p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl mb-24 md:mb-0">
              <h3 className="font-bold mb-4 text-lg">Tambah Makanan untuk {activeProfile?.name}</h3>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={triggerCamera} className="bg-green-50 hover:bg-green-100 transition-colors p-4 rounded-2xl border border-green-100 flex flex-col items-center gap-2"><Camera className="text-green-500 w-8 h-8"/><span className="font-medium text-green-700">Kamera</span></button>
                <button onClick={triggerGallery} className="bg-blue-50 hover:bg-blue-100 transition-colors p-4 rounded-2xl border border-blue-100 flex flex-col items-center gap-2"><ImageIcon className="text-blue-500 w-8 h-8"/><span className="font-medium text-blue-700">Galeri</span></button>
              </div>
              <button onClick={() => setIsSourceModalOpen(false)} className="mt-6 w-full py-3 bg-gray-100 hover:bg-gray-200 transition-colors rounded-xl font-bold text-gray-600">Batal</button>
            </div>
          </div>
        )}

        {isCameraModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
            <div className="bg-white w-full max-w-md rounded-3xl flex flex-col max-h-[90vh] shadow-2xl">
              <div className="px-5 py-4 flex justify-between items-center border-b"><h3 className="font-bold text-lg">Analisis Makanan</h3><X className="w-6 h-6 text-gray-400 hover:text-gray-600 cursor-pointer" onClick={closeCameraModal}/></div>
              <div className="overflow-y-auto p-5 space-y-4">
                <div className="relative rounded-2xl overflow-hidden shadow-sm border border-gray-100">
                  <img src={currentImage || ''} className="w-full h-48 object-cover" alt="Captured food" />
                  {isAnalyzing && <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-white"><Loader2 className="animate-spin w-10 h-10 mb-3"/><span className="font-medium">Memindai Nutrisi...</span></div>}
                </div>
                {error && <div className="text-red-600 bg-red-50 p-4 rounded-xl text-sm border border-red-100 flex items-start gap-2"><AlertCircle className="w-5 h-5 shrink-0"/> {error}</div>}
                {analysisResult && (
                  <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
                    <input type="text" name="name" value={analysisResult.name || ''} onChange={handleEditAnalysis} className="w-full text-xl font-bold text-gray-800 bg-transparent border-b-2 border-dashed border-gray-300 mb-5 focus:outline-none focus:border-green-500 pb-1 capitalize" />
                    <div className="flex justify-between items-center mb-5 bg-white p-3 rounded-xl border shadow-sm">
                      <span className="font-medium text-gray-600 flex items-center gap-2"><Flame className="w-5 h-5 text-orange-500"/>Total Kalori</span>
                      <div className="flex items-center gap-1">
                        <input type="number" name="calories" value={analysisResult.calories || 0} onChange={handleEditAnalysis} className="text-xl font-bold text-green-600 bg-transparent w-20 text-right focus:outline-none" />
                        <span className="text-xs text-gray-400 font-bold uppercase">kkal</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center text-sm">
                      <div className="bg-white p-3 rounded-xl border shadow-sm flex flex-col items-center">
                        <span className="text-gray-500 text-xs mb-1 font-medium">Protein</span>
                        <div className="flex items-center"><input type="number" name="protein" value={analysisResult.protein || 0} onChange={handleEditAnalysis} className="w-10 bg-transparent text-center font-bold text-blue-600 text-lg focus:outline-none"/>g</div>
                      </div>
                      <div className="bg-white p-3 rounded-xl border shadow-sm flex flex-col items-center">
                        <span className="text-gray-500 text-xs mb-1 font-medium">Karbo</span>
                        <div className="flex items-center"><input type="number" name="carbs" value={analysisResult.carbs || 0} onChange={handleEditAnalysis} className="w-10 bg-transparent text-center font-bold text-yellow-600 text-lg focus:outline-none"/>g</div>
                      </div>
                      <div className="bg-white p-3 rounded-xl border shadow-sm flex flex-col items-center">
                        <span className="text-gray-500 text-xs mb-1 font-medium">Lemak</span>
                        <div className="flex items-center"><input type="number" name="fat" value={analysisResult.fat || 0} onChange={handleEditAnalysis} className="w-10 bg-transparent text-center font-bold text-red-600 text-lg focus:outline-none"/>g</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-4 border-t bg-gray-50 rounded-b-3xl">
                <button onClick={handleSaveToCloud} disabled={!analysisResult || isAnalyzing} className="w-full bg-green-500 hover:bg-green-600 text-white py-3.5 rounded-xl font-bold text-lg disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm">
                  Simpan untuk {activeProfile?.name}
                </button>
              </div>
            </div>
          </div>
        )}

        {isProfileModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
            <div className="bg-white w-full max-w-md rounded-3xl flex flex-col shadow-2xl max-h-[90vh]">
              <div className="px-5 py-4 flex justify-between items-center border-b">
                <h3 className="font-bold text-lg">{editingProfileId ? 'Edit Profil' : 'Profil Baru'}</h3>
                <X className="w-6 h-6 text-gray-400 hover:text-gray-600 cursor-pointer" onClick={() => setIsProfileModalOpen(false)}/>
              </div>
              <div className="p-5 overflow-y-auto">
                {profileError && <div className="bg-red-50 text-red-600 border border-red-100 p-3 rounded-xl mb-4 text-sm font-medium flex gap-2 items-start"><AlertCircle className="w-5 h-5 shrink-0" /> {profileError}</div>}
                
                <form id="profForm" onSubmit={calculateTargetsAndSave} className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Nama Panggilan</label>
                    <input type="text" name="name" value={profileForm.name} onChange={handleProfileChange} placeholder="Contoh: Ayah, Ibu, Budi" className="border w-full p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:outline-none bg-gray-50 font-bold"/>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Umur (Tahun)</label>
                      <input type="number" name="age" value={profileForm.age} onChange={handleProfileChange} placeholder="Contoh: 25" className="border w-full p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:outline-none bg-gray-50"/>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Jenis Kelamin</label>
                      <select name="gender" value={profileForm.gender} onChange={handleProfileChange} className="border w-full p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:outline-none bg-gray-50">
                        <option value="male">Pria</option>
                        <option value="female">Wanita</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Berat (kg)</label>
                      <input type="number" name="weight" value={profileForm.weight} onChange={handleProfileChange} placeholder="Contoh: 70" className="border w-full p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:outline-none bg-gray-50"/>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Tinggi (cm)</label>
                      <input type="number" name="height" value={profileForm.height} onChange={handleProfileChange} placeholder="Contoh: 175" className="border w-full p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:outline-none bg-gray-50"/>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Level Aktivitas Fisik</label>
                    <select name="activity" value={profileForm.activity} onChange={handleProfileChange} className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:outline-none bg-gray-50">
                      <option value="sedentary">Jarang Olahraga / Kerah Putih</option>
                      <option value="light">Olahraga Ringan (1-3 hari/minggu)</option>
                      <option value="moderate">Olahraga Sedang (3-5 hari/minggu)</option>
                      <option value="active">Olahraga Aktif (6-7 hari/minggu)</option>
                    </select>
                  </div>
                </form>
              </div>
              <div className="p-4 border-t bg-gray-50 rounded-b-3xl">
                <button type="submit" form="profForm" className="w-full bg-green-500 hover:bg-green-600 text-white py-3.5 rounded-xl font-bold text-lg shadow-sm transition-colors">
                  Simpan & Hitung Target
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedRecipe && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
            <div className="bg-white w-full max-w-md rounded-3xl flex flex-col max-h-[90vh] shadow-2xl">
              <div className="px-5 py-4 flex justify-between items-center border-b">
                <h3 className="font-bold text-lg text-gray-800 pr-4">{selectedRecipe.name}</h3>
                <X className="w-6 h-6 text-gray-400 hover:text-gray-600 cursor-pointer shrink-0" onClick={() => setSelectedRecipe(null)}/>
              </div>
              <div className="p-5 overflow-y-auto space-y-6">
                <div>
                  <h4 className="font-bold text-sm text-blue-600 mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4"/> Bahan-bahan</h4>
                  <ul className="space-y-2">
                    {selectedRecipe.ingredients.map((ing: string, i: number) => (
                      <li key={i} className="text-sm text-gray-700 flex items-start gap-2 before:content-['•'] before:text-gray-300">{ing}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold text-sm text-orange-500 mb-3 flex items-center gap-2"><Flame className="w-4 h-4"/> Cara Membuat</h4>
                  <ol className="space-y-3">
                    {selectedRecipe.steps.map((step: string, i: number) => (
                      <li key={i} className="text-sm text-gray-700 flex items-start gap-3">
                        <span className="font-bold text-orange-200 shrink-0">{i + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedWorkout && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/80 p-2 md:p-4">
            <div className="bg-white w-full max-w-lg rounded-3xl flex flex-col max-h-[95vh] shadow-2xl overflow-hidden relative">
              <button onClick={() => setSelectedWorkout(null)} className="absolute top-4 right-4 z-10 bg-white/80 backdrop-blur p-2 rounded-full shadow-md hover:bg-white text-gray-800">
                <X className="w-5 h-5"/>
              </button>
              <div className="overflow-y-auto w-full h-full p-2 bg-gray-100 flex justify-center">
                <img src={selectedWorkout.img} alt={selectedWorkout.title} className="w-full h-auto object-contain rounded-xl" referrerPolicy="no-referrer" />
              </div>
              <div className="p-4 bg-white border-t border-gray-100 flex justify-between items-center">
                <div>
                  <h4 className="font-bold text-gray-800">{selectedWorkout.title}</h4>
                  <p className="text-xs text-gray-500">Sumber: darebee.com</p>
                </div>
                <a href={selectedWorkout.img} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-blue-600 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">
                  <ExternalLink className="w-4 h-4"/> Buka Penuh
                </a>
              </div>
            </div>
          </div>
        )}

        {isHistoryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
            <div className="bg-gray-50 w-full max-w-md rounded-3xl flex flex-col max-h-[90vh] shadow-2xl">
              <div className="px-5 py-4 flex justify-between items-center border-b bg-white rounded-t-3xl"><h3 className="font-bold text-lg">Riwayat {activeProfile?.name}</h3><X className="w-6 h-6 text-gray-400 hover:text-gray-600 cursor-pointer" onClick={() => setIsHistoryModalOpen(false)}/></div>
              <div className="overflow-y-auto p-5 space-y-4">
                {groupedHistory.length === 0 ? (
                  <div className="text-center p-8 text-gray-400">Belum ada riwayat tercatat.</div>
                ) : (
                  groupedHistory.map(month => (
                    <div key={month.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                      <button onClick={() => toggleMonth(month.id)} className="w-full px-5 py-4 flex justify-between items-center hover:bg-gray-50 transition-colors">
                        <span className="font-bold text-gray-800">{month.name} <span className="text-gray-400 font-normal text-sm ml-1">({month.totalCalories} kkal)</span></span>
                        {expandedMonth === month.id ? <ChevronUp className="w-5 h-5 text-gray-400"/> : <ChevronDown className="w-5 h-5 text-gray-400"/>}
                      </button>
                      {expandedMonth === month.id && (
                        <div className="bg-gray-50 px-5 py-2 border-t border-gray-100 text-sm">
                          {month.daysArray?.map((day: any, idx: number) => (
                            <div key={idx} className="flex justify-between py-3 border-b border-gray-200 last:border-0 items-center">
                              <span className="font-medium text-gray-600">{day.dateStr}</span>
                              <div className="flex gap-4">
                                <span className="flex items-center gap-1 font-bold"><Flame className="w-4 h-4 text-orange-500"/>{day.cals}</span>
                                <span className="flex items-center gap-1 font-bold w-16 justify-end"><GlassWater className="w-4 h-4 text-blue-500"/>{day.water}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
        
        {isConfirmLeaveOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Keluar Ruang Keluarga?</h3>
              <p className="text-gray-500 text-sm mb-6">Data Anda tidak akan terhapus, namun Anda akan keluar dari sinkronisasi ruang keluarga ini.</p>
              <div className="flex gap-3">
                <button onClick={() => setIsConfirmLeaveOpen(false)} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors">Batal</button>
                <button onClick={confirmLeaveFamily} className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors">Ya, Keluar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
