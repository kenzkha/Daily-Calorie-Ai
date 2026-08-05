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
        let rawErr = errorData.error;
        if (typeof rawErr === "object" && rawErr !== null) {
          rawErr = rawErr.message || JSON.stringify(rawErr);
        }
        let errMsg = rawErr || `HTTP error! status: ${response.status}`;
        if (typeof errMsg === "string" && (errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("Quota exceeded") || errMsg.includes("429"))) {
          errMsg = "⚠️ Batas kuota gratis Gemini AI terlampaui (Rate Limit / Quota Exceeded). Silakan tunggu 30 - 60 detik sebelum mencoba lagi.";
        }
        throw new Error(errMsg);
      }
      return await response.json();
    } catch (err: any) {
      if (err?.message?.includes("Batas kuota gratis")) throw err;
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delays[i]));
    }
  }
};

const uiDict: Record<string, Record<string, string>> = {
  id: {
    appName: 'DailyCal', dash: 'Jurnal Harian', lead: 'Papan Peringkat', work: 'Program Olahraga', rec: 'Meal Plan Mingguan', anal: 'Analitik Keluarga', ask: 'Tanya AI', shop: 'Toko Sehat',
    room: 'Ruang', soon: 'Segera', viewHistory: 'Lihat Riwayat', switchUser: 'Ganti Anggota Keluarga', leaveRoom: 'Keluar Ruangan', donate: 'Donate',
    dailyCalFor: 'Kalori Harian', target: 'Target', pro: 'Pro', carbs: 'Karbo', fat: 'Lemak', waterIntake: 'Minum Air', undo: 'Batal',
    foodJournalToday: 'Jurnal Makanan (Hari Ini)', noIntakeRecorded: 'Belum ada asupan tercatat untuk', kcal: 'kkal',
    waterKing: 'Raja/Ratu Air', calorieWarrior: 'Pejuang Kalori', inviteFamily: 'Ajak Keluarga!', inviteDesc: 'Papan peringkat akan seru jika dimainkan bersama. Tambahkan anggota keluarga lain untuk mulai bersaing sehat.', you: 'Anda',
    workoutSubtitle: 'Tetap aktif dan bugar, mulai dari rumah.', workoutPowered: 'Powered by Darebee', workoutInfo: 'Program latihan di bawah ini diambil langsung dari koleksi publik darebee.com. Ketuk gambar untuk memperbesar poster latihan.', openFull: 'Buka Penuh',
    recipesSubtitle: 'Pola makan sehat, praktis, dan kaya nutrisi.', tapRecipeTip: '💡 Ketuk nama makanan untuk melihat resep', breakfast: 'Sarapan', lunch: 'Makan Siang', dinner: 'Makan Malam', ingredients: 'Bahan-bahan', instructions: 'Cara Membuat',
    analyticsSubtitle: 'Pantau pencapaian kesehatan bersama.', calFulfillment: 'Pemenuhan Kalori (Hari Ini)', waterFulfillment: 'Konsumsi Air (Hari Ini)', askAiPlaceholder: 'Tanya soal kalori, resep, atau workout...',
    addFoodFor: 'Tambah Makanan untuk', camera: 'Kamera', gallery: 'Galeri', cancelBtn: 'Batal', foodAnalysis: 'Analisis Makanan', scanning: 'Memindai Nutrisi...', totalCalories: 'Total Kalori', saveFor: 'Simpan untuk',
    editProfile: 'Edit Profil', newProfile: 'Profil Baru', nickname: 'Nama Panggilan', age: 'Umur (Tahun)', gender: 'Jenis Kelamin', male: 'Pria', female: 'Wanita', weight: 'Berat (kg)', height: 'Tinggi (cm)', activityLevel: 'Level Aktivitas Fisik', saveAndCalculate: 'Simpan & Hitung Target',
    historyTitle: 'Riwayat', noHistory: 'Belum ada riwayat tercatat.', leaveTitle: 'Keluar Ruang Keluarga?', leaveDesc: 'Data Anda tidak akan terhapus, namun Anda akan keluar dari sinkronisasi ruang keluarga ini.', yesLeave: 'Ya, Keluar',
    familyCodeTitle: 'Kode Keluarga', familyCodeDesc: 'Buat kode rahasia baru atau masukkan kode keluarga Anda untuk sinkronisasi antar perangkat.', syncBtn: 'Mulai Sinkronisasi', welcome: 'Selamat Datang!', roomCreated: 'Ruang berhasil dibuat. Tambahkan anggota keluarga pertama.', createProfile: 'Buat Profil Anda', addMember: 'Tambah Anggota', members: 'Anggota', inDevelopment: 'Fitur ini sedang dalam tahap pengembangan untuk menjadikan aplikasi ini "Super App" kesehatan Anda.', backToJournal: 'Kembali ke Jurnal',
    aiGreeting: 'Halo! Saya Jarvis, asisten kesehatan AI pintar Anda. Ada yang bisa saya bantu tentang kalori, olahraga, atau resep makanan hari ini?'
  },
  en: {
    appName: 'DailyCal', dash: 'Daily Journal', lead: 'Leaderboard', work: 'Workouts', rec: 'Weekly Meal Plan', anal: 'Family Analytics', ask: 'Ask AI', shop: 'Healthy Store',
    room: 'Room', soon: 'Soon', viewHistory: 'View History', switchUser: 'Switch Member', leaveRoom: 'Leave Room', donate: 'Donate',
    dailyCalFor: 'Daily Calories for', target: 'Goal', pro: 'Protein', carbs: 'Carbs', fat: 'Fat', waterIntake: 'Water Intake', undo: 'Undo',
    foodJournalToday: 'Food Journal (Today)', noIntakeRecorded: 'No intake recorded yet for', kcal: 'kcal',
    waterKing: 'Water Leader', calorieWarrior: 'Calorie Leader', inviteFamily: 'Invite Family!', inviteDesc: 'Leaderboard is fun when played together. Add family members to compete healthily.', you: 'You',
    workoutSubtitle: 'Stay active and fit from home.', workoutPowered: 'Powered by Darebee', workoutInfo: 'Workouts below are directly from darebee.com public collection. Tap image to view workout poster.', openFull: 'Open Full',
    recipesSubtitle: 'Healthy, practical, and nutrient-rich diet plan.', tapRecipeTip: '💡 Tap food name to view recipe', breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', ingredients: 'Ingredients', instructions: 'Instructions',
    analyticsSubtitle: 'Track joint health progress together.', calFulfillment: 'Calorie Intake (Today)', waterFulfillment: 'Water Intake (Today)', askAiPlaceholder: 'Ask about calories, recipes, or workouts...',
    addFoodFor: 'Add Food for', camera: 'Camera', gallery: 'Gallery', cancelBtn: 'Cancel', foodAnalysis: 'Food Analysis', scanning: 'Scanning Nutrition...', totalCalories: 'Total Calories', saveFor: 'Save for',
    editProfile: 'Edit Profile', newProfile: 'New Profile', nickname: 'Nickname', age: 'Age (Years)', gender: 'Gender', male: 'Male', female: 'Female', weight: 'Weight (kg)', height: 'Height (cm)', activityLevel: 'Activity Level', saveAndCalculate: 'Save & Calculate Target',
    historyTitle: 'History', noHistory: 'No history recorded yet.', leaveTitle: 'Leave Family Room?', leaveDesc: 'Your data will not be deleted, but you will leave this family room sync.', yesLeave: 'Yes, Leave',
    familyCodeTitle: 'Family Code', familyCodeDesc: 'Create or enter your family code to sync across devices.', syncBtn: 'Start Syncing', welcome: 'Welcome!', roomCreated: 'Room created successfully. Add the first family member.', createProfile: 'Create Your Profile', addMember: 'Add Member', members: 'Members', inDevelopment: 'This feature is under development to make this your health Super App.', backToJournal: 'Back to Journal',
    aiGreeting: 'Hello! I am Jarvis, your smart AI health assistant. How can I help you with calories, workouts, or recipes today?'
  },
  zh: {
    appName: 'DailyCal', dash: '每日日记', lead: '排行榜', work: '锻炼计划', rec: '每周食谱', anal: '家庭分析', ask: '咨询AI', shop: '健康商店',
    room: '房间', soon: '即将推出', viewHistory: '查看历史', switchUser: '切换成员', leaveRoom: '退出房间', donate: '捐赠',
    dailyCalFor: '每日卡路里', target: '目标', pro: '蛋白质', carbs: '碳水', fat: '脂肪', waterIntake: '饮水量', undo: '撤销',
    foodJournalToday: '今日饮食记录', noIntakeRecorded: '暂无记录：', kcal: '千卡',
    waterKing: '补水达人', calorieWarrior: '卡路里达人', inviteFamily: '邀请家人！', inviteDesc: '排行榜与家人一起更有趣。添加家人开启健康竞赛。', you: '你',
    workoutSubtitle: '在家保持活力与健康。', workoutPowered: 'Powered by Darebee', workoutInfo: '以下锻炼计划取自 darebee.com 公共库。点击图片查看训练海报。', openFull: '查看大图',
    recipesSubtitle: '健康、实用且营养丰富的饮食计划。', tapRecipeTip: '💡 点击菜名查看食谱', breakfast: '早餐', lunch: '午餐', dinner: '晚餐', ingredients: '食材配料', instructions: '制作步骤',
    analyticsSubtitle: '共同追踪健康成就。', calFulfillment: '今日卡路里达标', waterFulfillment: '今日水摄入', askAiPlaceholder: '询问卡路里、食谱或锻炼...',
    addFoodFor: '添加食物：', camera: '相机', gallery: '图库', cancelBtn: '取消', foodAnalysis: '食物分析', scanning: '正在扫描营养...', totalCalories: '总卡路里', saveFor: '保存至',
    editProfile: '编辑资料', newProfile: '新建资料', nickname: '昵称', age: '年龄（岁）', gender: '性别', male: '男', female: '女', weight: '体重 (kg)', height: '身高 (cm)', activityLevel: '活动量', saveAndCalculate: '保存并计算目标',
    historyTitle: '历史记录', noHistory: '暂无历史记录。', leaveTitle: '退出家庭房间？', leaveDesc: '您的数据不会被删除，但将退出此房间的同步。', yesLeave: '确定退出',
    familyCodeTitle: '家庭代码', familyCodeDesc: '创建或输入您的家庭代码以跨设备同步。', syncBtn: '开始同步', welcome: '欢迎！', roomCreated: '房间创建成功。请添加第一个家庭成员。', createProfile: '创建您的资料', addMember: '添加成员', members: '成员', inDevelopment: '该功能正在开发中，将成为您的健康超级应用。', backToJournal: '返回日记',
    aiGreeting: '你好！我是 Jarvis，您的智能 AI 健康助手。今天需要我帮您了解卡路里、健身或食谱吗？'
  },
  ja: {
    appName: 'DailyCal', dash: '毎日の日記', lead: 'リーダーボード', work: 'ワークアウト', rec: '食事プラン', anal: '家族分析', ask: 'AIに聞く', shop: '健康ストア',
    room: '部屋', soon: '近日公開', viewHistory: '履歴を見る', switchUser: 'メンバー切り替え', leaveRoom: '部屋を出る', donate: '寄付',
    dailyCalFor: '毎日のカロリー', target: '目標', pro: 'タンパク質', carbs: '炭水化物', fat: '脂質', waterIntake: '水分摂取', undo: '元に戻す',
    foodJournalToday: '本日の食事日誌', noIntakeRecorded: '記録がありません：', kcal: 'kcal',
    waterKing: '水分王', calorieWarrior: 'カロリー王', inviteFamily: '家族を招待！', inviteDesc: '家族と一緒に楽しもう。メンバーを追加して健康的に競いましょう。', you: 'あなた',
    workoutSubtitle: '自宅でアクティブに健康を維持。', workoutPowered: 'Powered by Darebee', workoutInfo: '以下のトレーニングは darebee.com のパブリックコレクションです。画像タップで拡大。', openFull: 'フル表示',
    recipesSubtitle: '健康的で実践的な栄養満点の食事プラン。', tapRecipeTip: '💡 料理名をタップしてレシピを表示', breakfast: '朝食', lunch: '昼食', dinner: '夕食', ingredients: '材料', instructions: '作り方',
    analyticsSubtitle: '家族の健康目標達成を一緒に追跡。', calFulfillment: '本日のカロリー達成度', waterFulfillment: '本日の水分摂取', askAiPlaceholder: 'カロリー、レシピ、運動について質問...',
    addFoodFor: '食事を追加：', camera: 'カメラ', gallery: 'ギャラリー', cancelBtn: 'キャンセル', foodAnalysis: '食品解析', scanning: '栄養素をスキャン中...', totalCalories: '合計カロリー', saveFor: '保存：',
    editProfile: 'プロフィール編集', newProfile: '新規プロフィール', nickname: 'ニックネーム', age: '年齢 (歳)', gender: '性別', male: '男性', female: '女性', weight: '体重 (kg)', height: '身長 (cm)', activityLevel: '活動レベル', saveAndCalculate: '保存して目標計算',
    historyTitle: '履歴', noHistory: '履歴がありません。', leaveTitle: '部屋を出ますか？', leaveDesc: 'データは削除されませんが、この部屋の同期から退出します。', yesLeave: '出る',
    familyCodeTitle: '家族コード', familyCodeDesc: 'デバイス間で同期するためにコードを作成または入力してください。', syncBtn: '同期を開始', welcome: 'ようこそ！', roomCreated: '部屋を作成しました。最初のメンバーを追加してください。', createProfile: 'プロフィール作成', addMember: 'メンバー追加', members: 'メンバー', inDevelopment: 'この機能は開発中です。', backToJournal: '日誌に戻る',
    aiGreeting: 'こんにちは！AI健康アシスタントのJarvisです。本日のカロリー、運動、レシピについてお手伝いできることはありますか？'
  },
  de: {
    appName: 'DailyCal', dash: 'Tagebuch', lead: 'Bestenliste', work: 'Trainingsplan', rec: 'Wochenmenü', anal: 'Familienanalytik', ask: 'KI Fragen', shop: 'Gesundheitsshop',
    room: 'Raum', soon: 'Demnächst', viewHistory: 'Verlauf', switchUser: 'Mitglied wechseln', leaveRoom: 'Raum verlassen', donate: 'Spenden',
    dailyCalFor: 'Tägliche Kalorien für', target: 'Ziel', pro: 'Eiweiß', carbs: 'Kohlenhydrate', fat: 'Fett', waterIntake: 'Wasseraufnahme', undo: 'Rückgängig',
    foodJournalToday: 'Ernährungstagebuch (Heute)', noIntakeRecorded: 'Noch keine Einträge für', kcal: 'kcal',
    waterKing: 'Wasser-Leader', calorieWarrior: 'Kalorien-Leader', inviteFamily: 'Familie einladen!', inviteDesc: 'Die Bestenliste macht zusammen mehr Spaß. Füge Familienmitglieder hinzu.', you: 'Du',
    workoutSubtitle: 'Bleibe von zu Hause aus aktiv und fit.', workoutPowered: 'Powered by Darebee', workoutInfo: 'Workouts stammen aus der darebee.com Sammlung. Tippe auf das Bild für das Poster.', openFull: 'Vollbild',
    recipesSubtitle: 'Gesunder, praktischer und nährstoffreicher Ernährungsplan.', tapRecipeTip: '💡 Tippe auf das Gericht für das Rezept', breakfast: 'Frühstück', lunch: 'Mittagessen', dinner: 'Abendessen', ingredients: 'Zutaten', instructions: 'Zubereitung',
    analyticsSubtitle: 'Verfolge gemeinsame Gesundheitserfolge.', calFulfillment: 'Kalorienziel (Heute)', waterFulfillment: 'Wasseraufnahme (Heute)', askAiPlaceholder: 'Frage nach Kalorien, Rezepten oder Workouts...',
    addFoodFor: 'Essen hinzufügen für', camera: 'Kamera', gallery: 'Galerie', cancelBtn: 'Abbrechen', foodAnalysis: 'Essensanalyse', scanning: 'Scanne Nährstoffe...', totalCalories: 'Gesamtkalorien', saveFor: 'Speichern für',
    editProfile: 'Profil bearbeiten', newProfile: 'Neues Profil', nickname: 'Spitzname', age: 'Alter (Jahre)', gender: 'Geschlecht', male: 'Männlich', female: 'Weiblich', weight: 'Gewicht (kg)', height: 'Größe (cm)', activityLevel: 'Aktivitätslevel', saveAndCalculate: 'Speichern & Berechnen',
    historyTitle: 'Verlauf', noHistory: 'Noch kein Verlauf vorhanden.', leaveTitle: 'Raum verlassen?', leaveDesc: 'Deine Daten werden nicht gelöscht, aber die Synchronisierung wird beendet.', yesLeave: 'Ja, verlassen',
    familyCodeTitle: 'Familiencode', familyCodeDesc: 'Erstelle oder gib deinen Familiencode ein, um zu synchronisieren.', syncBtn: 'Synchronisation starten', welcome: 'Willkommen!', roomCreated: 'Raum erfolgreich erstellt. Füge das erste Mitglied hinzu.', createProfile: 'Profil erstellen', addMember: 'Mitglied hinzufügen', members: 'Mitglieder', inDevelopment: 'Dieses Feature befindet sich in der Entwicklung.', backToJournal: 'Zurück zum Tagebuch',
    aiGreeting: 'Hallo! Ich bin Jarvis, dein intelligenter KI-Gesundheitsassistent. Wie kann ich dir heute helfen?'
  },
  fr: {
    appName: 'DailyCal', dash: 'Journal', lead: 'Classement', work: 'Programme', rec: 'Plan de Repas', anal: 'Analyse', ask: 'Demander à l\'IA', shop: 'Boutique Santé',
    room: 'Salle', soon: 'Bientôt', viewHistory: 'Voir l\'historique', switchUser: 'Changer de membre', leaveRoom: 'Quitter la salle', donate: 'Faire un don',
    dailyCalFor: 'Calories quotidiennes de', target: 'Objectif', pro: 'Prot', carbs: 'Glucides', fat: 'Lipides', waterIntake: 'Hydratation', undo: 'Annuler',
    foodJournalToday: 'Journal Alimentaire (Aujourd\'hui)', noIntakeRecorded: 'Aucun enregistrement pour', kcal: 'kcal',
    waterKing: 'Chef Hydratation', calorieWarrior: 'Champion Calories', inviteFamily: 'Inviter la famille !', inviteDesc: 'Le classement est plus amusant ensemble. Ajoutez des membres de la famille.', you: 'Vous',
    workoutSubtitle: 'Restez actif et en forme depuis chez vous.', workoutPowered: 'Powered by Darebee', workoutInfo: 'Les séances proviennent de darebee.com. Appuyez sur l\'image pour voir l\'affiche.', openFull: 'Ouvrir complet',
    recipesSubtitle: 'Plan alimentaire sain, pratique et riche en nutriments.', tapRecipeTip: '💡 Appuyez sur le plat pour voir la recette', breakfast: 'Petit-déjeuner', lunch: 'Déjeuner', dinner: 'Dîner', ingredients: 'Ingrédients', instructions: 'Instructions',
    analyticsSubtitle: 'Suivez ensemble vos progrès santé.', calFulfillment: 'Objectif Calories (Aujourd\'hui)', waterFulfillment: 'Hydratation (Aujourd\'hui)', askAiPlaceholder: 'Posez une question sur les calories, recettes, sport...',
    addFoodFor: 'Ajouter un repas pour', camera: 'Appareil photo', gallery: 'Galerie', cancelBtn: 'Annuler', foodAnalysis: 'Analyse alimentaire', scanning: 'Analyse des nutriments...', totalCalories: 'Calories totales', saveFor: 'Enregistrer pour',
    editProfile: 'Modifier le profil', newProfile: 'Nouveau profil', nickname: 'Pseudo', age: 'Âge (Ans)', gender: 'Genre', male: 'Homme', female: 'Femme', weight: 'Poids (kg)', height: 'Taille (cm)', activityLevel: 'Niveau d\'activité', saveAndCalculate: 'Enregistrer & Calculer',
    historyTitle: 'Historique', noHistory: 'Aucun historique enregistré.', leaveTitle: 'Quitter la salle ?', leaveDesc: 'Vos données ne seront pas supprimées, mais la synchronisation s\'arrêtera.', yesLeave: 'Oui, quitter',
    familyCodeTitle: 'Code familial', familyCodeDesc: 'Créez ou saisissez votre code familial pour synchroniser.', syncBtn: 'Démarrer la synchro', welcome: 'Bienvenue !', roomCreated: 'Salle créée avec succès. Ajoutez le premier membre.', createProfile: 'Créer votre profil', addMember: 'Ajouter un membre', members: 'Membres', inDevelopment: 'Cette fonctionnalité est en cours de développement.', backToJournal: 'Retour au journal',
    aiGreeting: 'Bonjour ! Je suis Jarvis, votre assistant santé IA intelligent. Comment puis-je vous aider aujourd\'hui ?'
  },
  hi: {
    appName: 'DailyCal', dash: 'दैनिक पत्रिका', lead: 'लीडरबोर्ड', work: 'कसरत', rec: 'भोजन योजना', anal: 'परिवार एनालिटिक्स', ask: 'AI से पूछें', shop: 'स्वस्थ स्टोर',
    room: 'कमरा', soon: 'जल्द ही', viewHistory: 'इतिहास देखें', switchUser: 'सदस्य बदलें', leaveRoom: 'कमरा छोड़ें', donate: 'दान करें',
    dailyCalFor: 'दैनिक कैलोरी', target: 'लक्ष्य', pro: 'प्रोटीन', carbs: 'कार्ब्स', fat: 'वसा', waterIntake: 'पानी का सेवन', undo: 'पूर्ववत करें',
    foodJournalToday: 'भोजन पत्रिका (आज)', noIntakeRecorded: 'के लिए कोई रिकॉर्ड नहीं', kcal: 'kcal',
    waterKing: 'जल लीडर', calorieWarrior: 'कैलोरी लीडर', inviteFamily: 'परिवार को आमंत्रित करें!', inviteDesc: 'साथ में लीडरबोर्ड मजेदार है। स्वस्थ प्रतिस्पर्धा के लिए सदस्यों को जोड़ें।', you: 'आप',
    workoutSubtitle: 'घर से सक्रिय और स्वस्थ रहें।', workoutPowered: 'Powered by Darebee', workoutInfo: 'कसरत darebee.com से ली गई है। पोस्टर देखने के लिए छवि पर टैप करें।', openFull: 'पूरा देखें',
    recipesSubtitle: 'स्वस्थ, व्यावहारिक और पोषक तत्वों से भरपूर भोजन योजना।', tapRecipeTip: '💡 व्यंजन के नाम पर टैप करके रेसिपी देखें', breakfast: 'नाश्ता', lunch: 'दोपहर का खाना', dinner: 'रात का खाना', ingredients: 'सामग्री', instructions: 'बनाने की विधि',
    analyticsSubtitle: 'साथ में स्वास्थ्य प्रगति को ट्रैक करें।', calFulfillment: 'कैलोरी पूर्ति (आज)', waterFulfillment: 'पानी का सेवन (आज)', askAiPlaceholder: 'कैलोरी, रेसिपी या वर्कआउट के बारे में पूछें...',
    addFoodFor: 'के लिए खाना जोड़ें', camera: 'कैमरा', gallery: 'गैलरी', cancelBtn: 'रद्द करें', foodAnalysis: 'भोजन विश्लेषण', scanning: 'पोषण स्कैन कर रहा है...', totalCalories: 'कुल कैलोरी', saveFor: 'के लिए सहेजें',
    editProfile: 'प्रोफ़ाइल संपादित करें', newProfile: 'नई प्रोफ़ाइल', nickname: 'उपनाम', age: 'उम्र (वर्ष)', gender: 'लिंग', male: 'पुरुष', female: 'महिला', weight: 'वजन (किग्रा)', height: 'लंबाई (सेमी)', activityLevel: 'गतिविधि का स्तर', saveAndCalculate: 'सहेजें और लक्ष्य की गणना करें',
    historyTitle: 'इतिहास', noHistory: 'कोई इतिहास नहीं।', leaveTitle: 'कमरा छोड़ें?', leaveDesc: 'आपका डेटा हटाया नहीं जाएगा, लेकिन सिंक बंद हो जाएगा।', yesLeave: 'हाँ, छोड़ें',
    familyCodeTitle: 'पारिवारिक कोड', familyCodeDesc: 'सिंक करने के लिए अपना परिवार कोड बनाएं या दर्ज करें।', syncBtn: 'सिंक शुरू करें', welcome: 'स्वागत है!', roomCreated: 'कमरा बन गया। पहला सदस्य जोड़ें।', createProfile: 'अपनी प्रोफ़ाइल बनाएं', addMember: 'सदस्य जोड़ें', members: 'सदस्य', inDevelopment: 'यह सुविधा विकास के तहत है।', backToJournal: 'पत्रिका पर वापस',
    aiGreeting: 'नमस्ते! मैं जार्विस हूँ, आपका AI स्वास्थ्य सहायक। आज मैं आपकी कैसे मदद कर सकता हूँ?'
  },
  ko: {
    appName: 'DailyCal', dash: '일일 저널', lead: '리더보드', work: '운동', rec: '주간 식단', anal: '가족 분석', ask: 'AI에게 묻기', shop: '건강 스토어',
    room: '방', soon: '출시 예정', viewHistory: '기록 보기', switchUser: '구성원 변경', leaveRoom: '방 나가기', donate: '후원하기',
    dailyCalFor: '일일 칼로리', target: '목표', pro: '단백질', carbs: '탄수화물', fat: '지방', waterIntake: '수분 섭취', undo: '취소',
    foodJournalToday: '음식 저널 (오늘)', noIntakeRecorded: '기록이 없습니다:', kcal: 'kcal',
    waterKing: '수분 리더', calorieWarrior: '칼로리 리더', inviteFamily: '가족 초대하기!', inviteDesc: '함께하면 더 재미있습니다. 가족을 추가해 건강하게 경쟁하세요.', you: '나',
    workoutSubtitle: '집에서 건강하고 활기차게.', workoutPowered: 'Powered by Darebee', workoutInfo: '운동은 darebee.com의 공개 컬렉션입니다. 포스터를 보려면 이미지를 탭하세요.', openFull: '전체 보기',
    recipesSubtitle: '건강하고 실용적인 영양 만점 식단.', tapRecipeTip: '💡 요리 이름을 탭하여 레시피 보기', breakfast: '아침', lunch: '점심', dinner: '저녁', ingredients: '재료', instructions: '조리 방법',
    analyticsSubtitle: '함께 건강 목표를 추적하세요.', calFulfillment: '일일 칼로리 달성', waterFulfillment: '일일 수분 섭취', askAiPlaceholder: '칼로리, 레시피, 운동에 대해 물어보세요...',
    addFoodFor: '음식 추가:', camera: '카메라', gallery: '갤러리', cancelBtn: '취소', foodAnalysis: '음식 분석', scanning: '영양소 스캔 중...', totalCalories: '총 칼로리', saveFor: '저장:',
    editProfile: '프로필 편집', newProfile: '새 프로필', nickname: '닉네임', age: '나이 (세)', gender: '성별', male: '남성', female: '여성', weight: '체중 (kg)', height: '키 (cm)', activityLevel: '활동량', saveAndCalculate: '저장 및 목표 계산',
    historyTitle: '기록', noHistory: '기록이 없습니다.', leaveTitle: '방을 나가시겠습니까?', leaveDesc: '데이터는 삭제되지 않지만 동기화가 중단됩니다.', yesLeave: '예, 나가기',
    familyCodeTitle: '가족 코드', familyCodeDesc: '장치 간 동기화를 위해 가족 코드를 생성하거나 입력하세요.', syncBtn: '동기화 시작', welcome: '환영합니다!', roomCreated: '방이 생성되었습니다. 첫 번째 구성원을 추가하세요.', createProfile: '프로필 생성', addMember: '구성원 추가', members: '구성원', inDevelopment: '이 기능은 개발 중입니다.', backToJournal: '저널로 돌아가기',
    aiGreeting: '안녕하세요! Smart AI 건강 도우미 Jarvis입니다. 오늘 어떤 도움이 필요하신가요?'
  },
  pt: {
    appName: 'DailyCal', dash: 'Diário', lead: 'Classificação', work: 'Treino', rec: 'Plano de Refeições', anal: 'Análise', ask: 'Perguntar à IA', shop: 'Loja Saudável',
    room: 'Sala', soon: 'Em breve', viewHistory: 'Ver Histórico', switchUser: 'Alternar Membro', leaveRoom: 'Sair da Sala', donate: 'Doar',
    dailyCalFor: 'Calorias Diárias de', target: 'Meta', pro: 'Prot', carbs: 'Carb', fat: 'Gordura', waterIntake: 'Consumo de Água', undo: 'Desfazer',
    foodJournalToday: 'Diário Alimentar (Hoje)', noIntakeRecorded: 'Nenhum registro para', kcal: 'kcal',
    waterKing: 'Líder de Água', calorieWarrior: 'Líder de Calorias', inviteFamily: 'Convidar Família!', inviteDesc: 'A classificação é mais divertida em família. Adicione membros para competir com saúde.', you: 'Você',
    workoutSubtitle: 'Mantenha-se ativo e em forma em casa.', workoutPowered: 'Powered by Darebee', workoutInfo: 'Treinos do acervo público do darebee.com. Toque na imagem para ver o pôster.', openFull: 'Abrir Total',
    recipesSubtitle: 'Plano alimentar saudável, prático e nutritivo.', tapRecipeTip: '💡 Toque no prato para ver a receita', breakfast: 'Café da manhã', lunch: 'Almoço', dinner: 'Jantar', ingredients: 'Ingredientes', instructions: 'Instruções',
    analyticsSubtitle: 'Acompanhe o progresso de saúde em conjunto.', calFulfillment: 'Metas de Calorias (Hoje)', waterFulfillment: 'Consumo de Água (Hoje)', askAiPlaceholder: 'Pergunte sobre calorias, receitas ou treinos...',
    addFoodFor: 'Adicionar refeição para', camera: 'Câmera', gallery: 'Galeria', cancelBtn: 'Cancelar', foodAnalysis: 'Análise Alimentar', scanning: 'Escaneando Nutrientes...', totalCalories: 'Calorias Totais', saveFor: 'Salvar para',
    editProfile: 'Editar Perfil', newProfile: 'Novo Perfil', nickname: 'Apelido', age: 'Idade (Anos)', gender: 'Gênero', male: 'Masculino', female: 'Feminino', weight: 'Peso (kg)', height: 'Altura (cm)', activityLevel: 'Nível de Atividade', saveAndCalculate: 'Salvar e Calcular Meta',
    historyTitle: 'Histórico', noHistory: 'Nenhum histórico registrado.', leaveTitle: 'Sair da Sala?', leaveDesc: 'Seus dados não serão excluídos, mas a sincronização será encerrada.', yesLeave: 'Sim, Sair',
    familyCodeTitle: 'Código de Família', familyCodeDesc: 'Crie ou insira seu código familiar para sincronizar.', syncBtn: 'Iniciar Sincronização', welcome: 'Bem-vindo!', roomCreated: 'Sala criada com sucesso. Adicione o primeiro membro.', createProfile: 'Criar Seu Perfil', addMember: 'Adicionar Membro', members: 'Membros', inDevelopment: 'Este recurso está em desenvolvimento.', backToJournal: 'Voltar ao Diário',
    aiGreeting: 'Olá! Sou Jarvis, seu assistente inteligente de saúde com IA. Como posso ajudar você hoje?'
  },
  es: {
    appName: 'DailyCal', dash: 'Diario', lead: 'Clasificación', work: 'Entrenamiento', rec: 'Plan de Comidas', anal: 'Análisis', ask: 'Preguntar a la IA', shop: 'Tienda Saludable',
    room: 'Sala', soon: 'Próximamente', viewHistory: 'Ver Historial', switchUser: 'Cambiar Miembro', leaveRoom: 'Salir de la Sala', donate: 'Donar',
    dailyCalFor: 'Calorías Diarias de', target: 'Meta', pro: 'Prot', carbs: 'Carb', fat: 'Grasa', waterIntake: 'Consumo de Agua', undo: 'Deshacer',
    foodJournalToday: 'Diario de Comida (Hoy)', noIntakeRecorded: 'No hay registros para', kcal: 'kcal',
    waterKing: 'Líder de Agua', calorieWarrior: 'Líder de Calorías', inviteFamily: '¡Invitar Familia!', inviteDesc: 'La clasificación es divertida en familia. Añade miembros para competir de forma saludable.', you: 'Tú',
    workoutSubtitle: 'Mantente activo y en forma desde casa.', workoutPowered: 'Powered by Darebee', workoutInfo: 'Rutinas del catálogo público de darebee.com. Toca la imagen para ver el póster.', openFull: 'Abrir Completo',
    recipesSubtitle: 'Plan de alimentación saludable, práctico y nutritivo.', tapRecipeTip: '💡 Toca el nombre del platillo para ver la receta', breakfast: 'Desayuno', lunch: 'Almuerzo', dinner: 'Cena', ingredients: 'Ingredientes', instructions: 'Instrucciones',
    analyticsSubtitle: 'Monitorea los logros de salud juntos.', calFulfillment: 'Cumplimiento de Calorías (Hoy)', waterFulfillment: 'Consumo de Agua (Hoy)', askAiPlaceholder: 'Pregunta sobre calorías, recetas o rutinas...',
    addFoodFor: 'Añadir comida para', camera: 'Cámara', gallery: 'Galería', cancelBtn: 'Cancelar', foodAnalysis: 'Análisis de Comida', scanning: 'Escaneando Nutrición...', totalCalories: 'Calorías Totales', saveFor: 'Guardar para',
    editProfile: 'Editar Perfil', newProfile: 'Nuevo Perfil', nickname: 'Apodo', age: 'Edad (Años)', gender: 'Género', male: 'Hombre', female: 'Mujer', weight: 'Peso (kg)', height: 'Altura (cm)', activityLevel: 'Nivel de Actividad', saveAndCalculate: 'Guardar y Calcular Meta',
    historyTitle: 'Historial', noHistory: 'No hay historial registrado.', leaveTitle: '¿Salir de la Sala?', leaveDesc: 'Tus datos no se eliminarán, pero la sincronización finalizará.', yesLeave: 'Sí, Salir',
    familyCodeTitle: 'Código Familiar', familyCodeDesc: 'Crea o ingresa tu código familiar para sincronizar.', syncBtn: 'Iniciar Sincronización', welcome: '¡Bienvenido!', roomCreated: 'Sala creada con éxito. Añade al primer miembro.', createProfile: 'Crear Tu Perfil', addMember: 'Añadir Miembro', members: 'Miembros', inDevelopment: 'Esta función está en desarrollo.', backToJournal: 'Volver al Diario',
    aiGreeting: '¡Hola! Soy Jarvis, tu asistente de salud inteligente con IA. ¿En qué puedo ayudarte hoy?'
  }
};

const langNames: Record<string, string> = {
  id: 'Indonesia', en: 'English', zh: '中文', ja: '日本語', de: 'Deutsch',
  fr: 'Français', hi: 'हिन्दी', ko: '한국어', pt: 'Português', es: 'Español'
};

const t = (key: string, lang = 'id'): string => {
  return uiDict[lang]?.[key] || uiDict['en']?.[key] || uiDict['id']?.[key] || key;
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
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('dailycal_language') || 'id';
  });
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);

  const handleLanguageChange = (langKey: string) => {
    setLanguage(langKey);
    localStorage.setItem('dailycal_language', langKey);
    setIsLangMenuOpen(false);
  };

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
    { id: 'dashboard', label: t('dash', language), icon: Home, color: 'text-green-500' },
    { id: 'leaderboard', label: t('lead', language), icon: Trophy, color: 'text-yellow-500' },
    { id: 'workout', label: t('work', language), icon: Dumbbell, color: 'text-orange-500' },
    { id: 'recipes', label: t('rec', language), icon: ChefHat, color: 'text-blue-500' },
    { id: 'analytics', label: t('anal', language), icon: BarChart3, color: 'text-purple-500' },
    { id: 'ask_ai', label: t('ask', language), icon: Bot, color: 'text-teal-500' },
    { id: 'market', label: t('shop', language), icon: BookOpen, color: 'text-rose-500' },
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
                <span className="text-xs text-green-700 font-medium bg-green-100 px-2 py-0.5 rounded-full">{t('room', language)}: {familyCode}</span>
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
                    <span className="ml-auto text-[9px] font-bold uppercase tracking-wider bg-gray-100 text-gray-400 px-2 py-1 rounded-lg">{t('soon', language)}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="p-4 border-t border-gray-100 space-y-2">
              <button onClick={() => { setIsHistoryModalOpen(true); setIsSidebarOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-2xl transition-colors font-medium">
                <Calendar className="w-5 h-5 text-gray-400" /> {t('viewHistory', language)}
              </button>
              <button onClick={() => { setIsUsersModalOpen(true); setIsSidebarOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-2xl transition-colors font-medium">
                <Users className="w-5 h-5 text-gray-400" /> {t('switchUser', language)}
              </button>
              <button onClick={handleLeaveFamilyRequest} className="w-full flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 rounded-2xl transition-colors font-medium">
                <LogOut className="w-5 h-5" /> {t('leaveRoom', language)}
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
              {t('appName', language)}
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
                <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-gray-50">
                  {Object.keys(langNames).map(langKey => (
                    <button key={langKey} onClick={() => handleLanguageChange(langKey)} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${language === langKey ? 'font-bold text-green-600 bg-green-50' : 'text-gray-700'}`}>
                      <span>{langNames[langKey]}</span>
                      {language === langKey && <span className="w-2 h-2 rounded-full bg-green-500"></span>}
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
            {/* Kartu Progress Kalori Harian */}
            {(() => {
              const calGoal = activeProfile?.calorieGoal || 2000;
              const calPercentRaw = Math.round((totalCalories / calGoal) * 100);
              const calPercentBar = Math.min(calPercentRaw, 100);
              return (
                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10"><User className="w-24 h-24"/></div>
                  
                  <div className="flex justify-between items-start mb-4 relative z-10">
                    <div>
                      <p className="font-medium text-green-100 text-sm">{t('dailyCalFor', language)} {activeProfile?.name}</p>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-4xl font-extrabold">{totalCalories}</span>
                        <span className="text-lg text-green-100">/ {calGoal} kkal</span>
                      </div>
                    </div>
                    <button onClick={() => openEditProfile(activeProfile)} className="bg-white/20 hover:bg-white/30 transition-colors p-2 rounded-xl text-xs flex flex-col items-center">
                      <Settings className="w-5 h-5"/>{t('target', language)}
                    </button>
                  </div>

                  {/* Progress Bar Kalori */}
                  <div className="mb-5 relative z-10 bg-black/15 p-3 rounded-2xl backdrop-blur-xs">
                    <div className="flex justify-between items-center text-xs text-green-100 mb-1.5 font-semibold">
                      <span>Progress Kalori</span>
                      <span className="bg-white/25 px-2.5 py-0.5 rounded-full text-white font-bold">{calPercentRaw}%</span>
                    </div>
                    <div className="w-full bg-black/20 h-3.5 rounded-full overflow-hidden p-0.5">
                      <div 
                        className="bg-white h-full rounded-full transition-all duration-700 shadow-sm"
                        style={{ width: `${calPercentBar}%` }}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 bg-white/10 rounded-2xl p-4 relative z-10">
                    <div className="text-center"><span className="text-xs uppercase text-blue-200">{t('pro', language)}</span><p className="font-bold text-lg">{totalProtein}g</p></div>
                    <div className="text-center border-x border-white/20"><span className="text-xs uppercase text-yellow-200">{t('carbs', language)}</span><p className="font-bold text-lg">{totalCarbs}g</p></div>
                    <div className="text-center"><span className="text-xs uppercase text-red-200">{t('fat', language)}</span><p className="font-bold text-lg">{totalFat}g</p></div>
                  </div>
                </div>
              );
            })()}

            {/* Kartu Progress Air Minum Harian */}
            {(() => {
              const waterGoal = activeProfile?.waterGoal || 2000;
              const waterPercentRaw = Math.round((waterIntake / waterGoal) * 100);
              const waterPercentBar = Math.min(waterPercentRaw, 100);
              return (
                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="flex gap-3.5 items-center">
                      <div className="bg-blue-50 p-3 rounded-2xl"><GlassWater className="text-blue-500 w-7 h-7"/></div>
                      <div>
                        <h3 className="font-bold text-gray-800">{t('waterIntake', language)}</h3>
                        <p className="text-sm text-blue-500 font-medium">{waterIntake} <span className="text-gray-400">/ {waterGoal} ml</span></p>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => handleUpdateWater(250)} className="bg-blue-50 hover:bg-blue-100 transition-colors text-blue-600 px-3 py-1.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1"><Plus className="w-4 h-4"/> 250ml</button>
                      <button onClick={() => handleUpdateWater(-250)} disabled={waterIntake===0} className="bg-gray-50 hover:bg-gray-100 transition-colors text-gray-500 px-3 py-1.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1 disabled:opacity-50"><Minus className="w-4 h-4"/> {t('undo', language)}</button>
                    </div>
                  </div>

                  {/* Progress Bar Air Minum */}
                  <div className="bg-blue-50/50 p-3 rounded-2xl border border-blue-100/50">
                    <div className="flex justify-between items-center text-xs text-gray-600 mb-1.5 font-medium">
                      <span>Progress Air Minum</span>
                      <span className="bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full font-bold">{waterPercentRaw}%</span>
                    </div>
                    <div className="w-full bg-blue-100/80 h-3 rounded-full overflow-hidden p-0.5">
                      <div 
                        className="bg-blue-500 h-full rounded-full transition-all duration-700 shadow-sm"
                        style={{ width: `${waterPercentBar}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })()}

            <div>
              <h2 className="font-bold mb-4 text-gray-800">{t('foodJournalToday', language)}</h2>
              {foodLogsToday.length === 0 ? (
                <div className="bg-gray-50 p-8 rounded-2xl text-center border-2 border-dashed border-gray-200">
                  <Camera className="w-8 h-8 mx-auto text-gray-400 mb-2"/>
                  <p className="text-gray-500 text-sm">{t('noIntakeRecorded', language)} {activeProfile?.name}.</p>
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
                        <span className="font-bold text-green-600 text-lg">{log.calories}</span><p className="text-[10px] text-gray-400 uppercase font-medium">{t('kcal', language)}</p>
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
                <h2 className="text-2xl font-bold text-gray-800">{t('lead', language)}</h2>
              </div>
              
              <div className="flex bg-gray-100 p-1.5 rounded-2xl">
                <button 
                  onClick={() => setLeaderboardTab('water')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${leaderboardTab === 'water' ? 'bg-white text-blue-600 shadow' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <GlassWater className="w-4 h-4"/> {t('waterKing', language)}
                </button>
                <button 
                  onClick={() => setLeaderboardTab('calories')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${leaderboardTab === 'calories' ? 'bg-white text-orange-500 shadow' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <Flame className="w-4 h-4"/> {t('calorieWarrior', language)}
                </button>
              </div>
            </div>

            <div className="p-6 flex-1">
              {profiles.length < 2 ? (
                 <div className="bg-white p-8 rounded-3xl border border-gray-100 text-center">
                   <div className="bg-yellow-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                     <Users className="w-8 h-8 text-yellow-500"/>
                   </div>
                   <h3 className="font-bold text-gray-800 mb-2">{t('inviteFamily', language)}</h3>
                   <p className="text-sm text-gray-500">{t('inviteDesc', language)}</p>
                 </div>
              ) : (
                <div className="space-y-4">
                  {leaderboardData[leaderboardTab].map((member, index) => {
                    const isFirst = index === 0;
                    const isSecond = index === 1;
                    const isThird = index === 2;
                    const valAmount = leaderboardTab === 'water' ? member.waterAmount : member.totalCalories;
                    const valGoal = leaderboardTab === 'water' ? member.waterGoal : member.calorieGoal;
                    const valUnit = leaderboardTab === 'water' ? 'ml' : t('kcal', language);
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
                            {member.id === activeProfileId && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full uppercase tracking-wider">{t('you', language)}</span>}
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
                <h2 className="text-2xl font-bold text-gray-800">{t('work', language)}</h2>
              </div>
              <p className="text-center text-gray-500 text-sm">{t('workoutSubtitle', language)}</p>
            </div>

            <div className="px-5 mt-6 space-y-6">
              <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex items-start gap-3 shadow-sm">
                <ExternalLink className="w-6 h-6 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-blue-800 text-sm">{t('workoutPowered', language)}</h4>
                  <p className="text-xs text-blue-600 mt-1">{t('workoutInfo', language)}</p>
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
                <h2 className="text-2xl font-bold text-gray-800">{t('rec', language)}</h2>
              </div>
              <p className="text-center text-gray-500 text-sm">{t('recipesSubtitle', language)}</p>
            </div>
            
            <div className="px-5 mt-6 space-y-4">
              <p className="text-xs text-gray-500 text-center bg-gray-100 py-2 rounded-xl border border-gray-200 border-dashed">{t('tapRecipeTip', language)}</p>
              {weeklyPlan.map((plan, idx) => (
                <div key={idx} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
                  <div className="flex justify-between items-center mb-4 border-b border-gray-50 pb-3">
                    <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2"><Calendar className="w-5 h-5 text-blue-500"/> {plan.day}</h3>
                    <span className="bg-orange-100 text-orange-600 text-xs font-bold px-2 py-1 rounded-lg">~{plan.cal} {t('kcal', language)}</span>
                  </div>
                  <div className="space-y-3">
                    <div onClick={() => setSelectedRecipe(plan.b)} className="flex items-start gap-3 cursor-pointer group hover:bg-gray-50 p-2 -ml-2 rounded-xl transition-colors">
                      <div className="bg-yellow-50 p-2 rounded-xl group-hover:bg-yellow-100 transition-colors"><Sparkles className="w-4 h-4 text-yellow-500"/></div>
                      <div className="flex-1">
                        <p className="text-[10px] uppercase font-bold text-gray-400">{t('breakfast', language)}</p>
                        <p className="text-sm font-bold text-gray-700 group-hover:text-blue-600 transition-colors">{plan.b.name}</p>
                      </div>
                    </div>
                    <div onClick={() => setSelectedRecipe(plan.l)} className="flex items-start gap-3 cursor-pointer group hover:bg-gray-50 p-2 -ml-2 rounded-xl transition-colors">
                      <div className="bg-green-50 p-2 rounded-xl group-hover:bg-green-100 transition-colors"><Beef className="w-4 h-4 text-green-500"/></div>
                      <div className="flex-1">
                        <p className="text-[10px] uppercase font-bold text-gray-400">{t('lunch', language)}</p>
                        <p className="text-sm font-bold text-gray-700 group-hover:text-blue-600 transition-colors">{plan.l.name}</p>
                      </div>
                    </div>
                    <div onClick={() => setSelectedRecipe(plan.d)} className="flex items-start gap-3 cursor-pointer group hover:bg-gray-50 p-2 -ml-2 rounded-xl transition-colors">
                      <div className="bg-purple-50 p-2 rounded-xl group-hover:bg-purple-100 transition-colors"><Droplet className="w-4 h-4 text-purple-500"/></div>
                      <div className="flex-1">
                        <p className="text-[10px] uppercase font-bold text-gray-400">{t('dinner', language)}</p>
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
                <h2 className="text-2xl font-bold text-gray-800">{t('anal', language)}</h2>
              </div>
              <p className="text-center text-gray-500 text-sm">{t('analyticsSubtitle', language)}</p>
            </div>

            <div className="px-5 mt-6 space-y-6">
              <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
                <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2"><Flame className="w-5 h-5 text-orange-500"/> {t('calFulfillment', language)}</h3>
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
                <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2"><GlassWater className="w-5 h-5 text-blue-500"/> {t('waterFulfillment', language)}</h3>
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
                  placeholder={t('askAiPlaceholder', language)} 
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
                   <p className="text-gray-500 text-sm mb-6">{t('inDevelopment', language)}</p>
                   <button onClick={() => setCurrentView('dashboard')} className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl transition-colors">
                     {t('backToJournal', language)}
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
                  <h3 className="font-bold text-lg flex items-center gap-2"><Users className="w-5 h-5 text-green-600"/> {t('members', language)}</h3>
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
                          <p className="text-xs text-gray-500 font-normal">{t('target', language)}: {p.calorieGoal} {t('kcal', language)}</p>
                        </div>
                      </div>
                      <button onClick={() => openEditProfile(p)} className="p-2 bg-white rounded-xl border shadow-sm hover:bg-gray-50">
                        <Pencil className="w-4 h-4 text-gray-500"/>
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={openNewProfile} className="w-full mt-4 flex items-center justify-center gap-2 py-4 bg-gray-50 hover:bg-gray-100 border-2 border-dashed border-gray-300 rounded-2xl text-gray-600 font-bold transition-colors">
                  <Plus className="w-5 h-5"/> {t('addMember', language)}
                </button>
              </div>
            </div>
          </div>
        )}

        {isSourceModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-gray-900/60 p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl mb-24 md:mb-0">
              <h3 className="font-bold mb-4 text-lg">{t('addFoodFor', language)} {activeProfile?.name}</h3>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={triggerCamera} className="bg-green-50 hover:bg-green-100 transition-colors p-4 rounded-2xl border border-green-100 flex flex-col items-center gap-2"><Camera className="text-green-500 w-8 h-8"/><span className="font-medium text-green-700">{t('camera', language)}</span></button>
                <button onClick={triggerGallery} className="bg-blue-50 hover:bg-blue-100 transition-colors p-4 rounded-2xl border border-blue-100 flex flex-col items-center gap-2"><ImageIcon className="text-blue-500 w-8 h-8"/><span className="font-medium text-blue-700">{t('gallery', language)}</span></button>
              </div>
              <button onClick={() => setIsSourceModalOpen(false)} className="mt-6 w-full py-3 bg-gray-100 hover:bg-gray-200 transition-colors rounded-xl font-bold text-gray-600">{t('cancel', language)}</button>
            </div>
          </div>
        )}

        {isCameraModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
            <div className="bg-white w-full max-w-md rounded-3xl flex flex-col max-h-[90vh] shadow-2xl">
              <div className="px-5 py-4 flex justify-between items-center border-b"><h3 className="font-bold text-lg">{t('foodAnalysis', language)}</h3><X className="w-6 h-6 text-gray-400 hover:text-gray-600 cursor-pointer" onClick={closeCameraModal}/></div>
              <div className="overflow-y-auto p-5 space-y-4">
                <div className="relative rounded-2xl overflow-hidden shadow-sm border border-gray-100">
                  <img src={currentImage || ''} className="w-full h-48 object-cover" alt="Captured food" />
                  {isAnalyzing && <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-white"><Loader2 className="animate-spin w-10 h-10 mb-3"/><span className="font-medium">{t('scanningNutrition', language)}</span></div>}
                </div>
                {error && <div className="text-red-600 bg-red-50 p-4 rounded-xl text-sm border border-red-100 flex items-start gap-2"><AlertCircle className="w-5 h-5 shrink-0"/> {error}</div>}
                {analysisResult && (
                  <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
                    <input type="text" name="name" value={analysisResult.name || ''} onChange={handleEditAnalysis} className="w-full text-xl font-bold text-gray-800 bg-transparent border-b-2 border-dashed border-gray-300 mb-5 focus:outline-none focus:border-green-500 pb-1 capitalize" />
                    <div className="flex justify-between items-center mb-5 bg-white p-3 rounded-xl border shadow-sm">
                      <span className="font-medium text-gray-600 flex items-center gap-2"><Flame className="w-5 h-5 text-orange-500"/>{t('totalCalories', language)}</span>
                      <div className="flex items-center gap-1">
                        <input type="number" name="calories" value={analysisResult.calories || 0} onChange={handleEditAnalysis} className="text-xl font-bold text-green-600 bg-transparent w-20 text-right focus:outline-none" />
                        <span className="text-xs text-gray-400 font-bold uppercase">{t('kcal', language)}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center text-sm">
                      <div className="bg-white p-3 rounded-xl border shadow-sm flex flex-col items-center">
                        <span className="text-gray-500 text-xs mb-1 font-medium">{t('pro', language)}</span>
                        <div className="flex items-center"><input type="number" name="protein" value={analysisResult.protein || 0} onChange={handleEditAnalysis} className="w-10 bg-transparent text-center font-bold text-blue-600 text-lg focus:outline-none"/>g</div>
                      </div>
                      <div className="bg-white p-3 rounded-xl border shadow-sm flex flex-col items-center">
                        <span className="text-gray-500 text-xs mb-1 font-medium">{t('carbs', language)}</span>
                        <div className="flex items-center"><input type="number" name="carbs" value={analysisResult.carbs || 0} onChange={handleEditAnalysis} className="w-10 bg-transparent text-center font-bold text-yellow-600 text-lg focus:outline-none"/>g</div>
                      </div>
                      <div className="bg-white p-3 rounded-xl border shadow-sm flex flex-col items-center">
                        <span className="text-gray-500 text-xs mb-1 font-medium">{t('fat', language)}</span>
                        <div className="flex items-center"><input type="number" name="fat" value={analysisResult.fat || 0} onChange={handleEditAnalysis} className="w-10 bg-transparent text-center font-bold text-red-600 text-lg focus:outline-none"/>g</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-4 border-t bg-gray-50 rounded-b-3xl">
                <button onClick={handleSaveToCloud} disabled={!analysisResult || isAnalyzing} className="w-full bg-green-500 hover:bg-green-600 text-white py-3.5 rounded-xl font-bold text-lg disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm">
                  {t('saveFor', language)} {activeProfile?.name}
                </button>
              </div>
            </div>
          </div>
        )}

        {isProfileModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
            <div className="bg-white w-full max-w-md rounded-3xl flex flex-col shadow-2xl max-h-[90vh]">
              <div className="px-5 py-4 flex justify-between items-center border-b">
                <h3 className="font-bold text-lg">{editingProfileId ? t('editProfile', language) : t('newProfile', language)}</h3>
                <X className="w-6 h-6 text-gray-400 hover:text-gray-600 cursor-pointer" onClick={() => setIsProfileModalOpen(false)}/>
              </div>
              <div className="p-5 overflow-y-auto">
                {profileError && <div className="bg-red-50 text-red-600 border border-red-100 p-3 rounded-xl mb-4 text-sm font-medium flex gap-2 items-start"><AlertCircle className="w-5 h-5 shrink-0" /> {profileError}</div>}
                
                <form id="profForm" onSubmit={calculateTargetsAndSave} className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">{t('nickname', language)}</label>
                    <input type="text" name="name" value={profileForm.name} onChange={handleProfileChange} placeholder={t('nicknamePlaceholder', language)} className="border w-full p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:outline-none bg-gray-50 font-bold"/>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">{t('age', language)}</label>
                      <input type="number" name="age" value={profileForm.age} onChange={handleProfileChange} placeholder="25" className="border w-full p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:outline-none bg-gray-50"/>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">{t('gender', language)}</label>
                      <select name="gender" value={profileForm.gender} onChange={handleProfileChange} className="border w-full p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:outline-none bg-gray-50">
                        <option value="male">{t('male', language)}</option>
                        <option value="female">{t('female', language)}</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">{t('weight', language)}</label>
                      <input type="number" name="weight" value={profileForm.weight} onChange={handleProfileChange} placeholder="70" className="border w-full p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:outline-none bg-gray-50"/>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">{t('height', language)}</label>
                      <input type="number" name="height" value={profileForm.height} onChange={handleProfileChange} placeholder="175" className="border w-full p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:outline-none bg-gray-50"/>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">{t('activityLevel', language)}</label>
                    <select name="activity" value={profileForm.activity} onChange={handleProfileChange} className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:outline-none bg-gray-50">
                      <option value="sedentary">{t('sedentary', language)}</option>
                      <option value="light">{t('lightActivity', language)}</option>
                      <option value="moderate">{t('moderateActivity', language)}</option>
                      <option value="active">{t('activeActivity', language)}</option>
                    </select>
                  </div>
                </form>
              </div>
              <div className="p-4 border-t bg-gray-50 rounded-b-3xl">
                <button type="submit" form="profForm" className="w-full bg-green-500 hover:bg-green-600 text-white py-3.5 rounded-xl font-bold text-lg shadow-sm transition-colors">
                  {t('saveAndCalculate', language)}
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
                  <h4 className="font-bold text-sm text-blue-600 mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4"/> {t('ingredients', language)}</h4>
                  <ul className="space-y-2">
                    {selectedRecipe.ingredients.map((ing: string, i: number) => (
                      <li key={i} className="text-sm text-gray-700 flex items-start gap-2 before:content-['•'] before:text-gray-300">{ing}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold text-sm text-orange-500 mb-3 flex items-center gap-2"><Flame className="w-4 h-4"/> {t('instructions', language)}</h4>
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
                  <p className="text-xs text-gray-500">{t('source', language)}: darebee.com</p>
                </div>
                <a href={selectedWorkout.img} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-blue-600 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">
                  <ExternalLink className="w-4 h-4"/> {t('openFull', language)}
                </a>
              </div>
            </div>
          </div>
        )}

        {isHistoryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
            <div className="bg-gray-50 w-full max-w-md rounded-3xl flex flex-col max-h-[90vh] shadow-2xl">
              <div className="px-5 py-4 flex justify-between items-center border-b bg-white rounded-t-3xl"><h3 className="font-bold text-lg">{t('historyFor', language)} {activeProfile?.name}</h3><X className="w-6 h-6 text-gray-400 hover:text-gray-600 cursor-pointer" onClick={() => setIsHistoryModalOpen(false)}/></div>
              <div className="overflow-y-auto p-5 space-y-4">
                {groupedHistory.length === 0 ? (
                  <div className="text-center p-8 text-gray-400">{t('noHistoryRecorded', language)}</div>
                ) : (
                  groupedHistory.map(month => (
                    <div key={month.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                      <button onClick={() => toggleMonth(month.id)} className="w-full px-5 py-4 flex justify-between items-center hover:bg-gray-50 transition-colors">
                        <span className="font-bold text-gray-800">{month.name} <span className="text-gray-400 font-normal text-sm ml-1">({month.totalCalories} {t('kcal', language)})</span></span>
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
              <h3 className="font-bold text-lg mb-2">{t('leaveRoomConfirm', language)}</h3>
              <p className="text-gray-500 text-sm mb-6">{t('leaveRoomDesc', language)}</p>
              <div className="flex gap-3">
                <button onClick={() => setIsConfirmLeaveOpen(false)} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors">{t('cancel', language)}</button>
                <button onClick={confirmLeaveFamily} className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors">{t('yesLeave', language)}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
