require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const Database = require('better-sqlite3');

// ==============================
// الإعدادات
// ==============================
const CONFIG = {
  ECONOMY_CHANNEL_ID: '1544072704972427274',
  LOG_CHANNEL_ID: '',
  OWNER_ID: '717481322683301940',
  EXTRA_OWNERS: ['1412021840133492857', '1027626650655019048'],
};

// ==============================
// قاعدة البيانات
// ==============================
const db = new Database('empire.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT,
    cash INTEGER DEFAULT 5000, bank INTEGER DEFAULT 0,
    loan INTEGER DEFAULT 0, loan_due INTEGER DEFAULT 0,
    credit_score INTEGER DEFAULT 100, protection_until INTEGER DEFAULT 0,
    career TEXT DEFAULT NULL, career_level INTEGER DEFAULT 1,
    last_work INTEGER DEFAULT 0, last_invest INTEGER DEFAULT 0,
    last_sabotage INTEGER DEFAULT 0, last_transfer INTEGER DEFAULT 0,
    last_loan INTEGER DEFAULT 0, last_lootbox INTEGER DEFAULT 0,
    last_contract INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS treasury (id INTEGER PRIMARY KEY DEFAULT 1, amount INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id TEXT, company_id TEXT, level INTEGER DEFAULT 1,
    current_value INTEGER, last_collected INTEGER DEFAULT (unixepoch()*1000)
  );
  CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id TEXT, name TEXT, quantity INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS stocks (
    symbol TEXT PRIMARY KEY, company_name TEXT,
    price INTEGER, total_shares INTEGER DEFAULT 100000
  );
  CREATE TABLE IF NOT EXISTS user_stocks (
    owner_id TEXT, symbol TEXT, shares INTEGER DEFAULT 0,
    PRIMARY KEY (owner_id, symbol)
  );
  CREATE TABLE IF NOT EXISTS alliances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE, leader_id TEXT,
    member2_id TEXT DEFAULT NULL, member3_id TEXT DEFAULT NULL,
    treasury INTEGER DEFAULT 0, wins INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS markets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE, income_per_hour INTEGER,
    controlled_by INTEGER DEFAULT NULL
  );
  CREATE TABLE IF NOT EXISTS sabotage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    saboteur_id TEXT, victim_id TEXT, amount INTEGER, at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS lawsuits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plaintiff_id TEXT, defendant_id TEXT, claimed_amount INTEGER,
    status TEXT DEFAULT 'open', verdict TEXT, created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT, amount INTEGER, field TEXT, result TEXT, profit INTEGER,
    started_at INTEGER, ends_at INTEGER, notified INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS reward_boxes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT, box_type TEXT, prize TEXT, prize_value INTEGER, opened_at INTEGER DEFAULT (unixepoch())
  );
  INSERT OR IGNORE INTO treasury (id, amount) VALUES (1, 0);
`);

// تهيئة الأسهم الافتراضية
const DEFAULT_STOCKS = [
  { symbol: 'TAQA', name: '⚡ شركة الطاقة المتحدة', price: 500 },
  { symbol: 'BNK',  name: '🏦 بنك الخليج المالي',   price: 800 },
  { symbol: 'TECH', name: '💻 تقنية المستقبل',       price: 350 },
  { symbol: 'FOOD', name: '🍔 أغذية الوطن',          price: 200 },
  { symbol: 'GOLD', name: '🥇 مناجم الذهب العالمية', price: 1200 },
];
for (const s of DEFAULT_STOCKS) {
  db.prepare('INSERT OR IGNORE INTO stocks (symbol, company_name, price) VALUES (?,?,?)').run(s.symbol, s.name, s.price);
}

// تهيئة الأسواق الافتراضية (لحروب التحالفات)
const DEFAULT_MARKETS = [
  { name: '🏭 المنطقة الصناعية', income: 5000 },
  { name: '🏦 الحي المالي',      income: 8000 },
  { name: '🚢 ميناء التجارة',    income: 6500 },
  { name: '🎪 السوق المركزي',    income: 4000 },
  { name: '🏰 وسط المدينة',      income: 10000 },
];
for (const m of DEFAULT_MARKETS) {
  db.prepare('INSERT OR IGNORE INTO markets (name, income_per_hour) VALUES (?,?)').run(m.name, m.income);
}

// ==============================
// المهن (الوظائف الحقيقية)
// ==============================
const CAREERS = {
  'طبيب':    { emoji: '⚕️', baseSalary: 8000,  minLevel: 4, desc: 'راتب عالي، يتطلب ثروة كبيرة للبدء' },
  'مهندس':   { emoji: '👷', baseSalary: 6000,  minLevel: 3, desc: 'راتب جيد ومستقر' },
  'مبرمج':   { emoji: '💻', baseSalary: 5500,  minLevel: 2, desc: 'دخل جيد بمستوى دخول متوسط' },
  'محامي':   { emoji: '⚖️', baseSalary: 7000,  minLevel: 4, desc: 'راتب مرتفع + يقلل رسوم الدعاوى' },
  'تاجر':    { emoji: '📦', baseSalary: 4000,  minLevel: 1, desc: 'راتب متوسط + يزيد أرباح البيع' },
  'عامل':    { emoji: '🔨', baseSalary: 2000,  minLevel: 1, desc: 'وظيفة بداية، متاحة للجميع' },
};

// ==============================
// الشركات (بديل الأراضي)
// ==============================
const COMPANIES_LIST = [
  { id: 'c1', name: '☕ مقهى صغير',        sector: 'خدمي',  price: 100_000 },
  { id: 'c2', name: '🏪 متجر بقالة',       sector: 'تجاري', price: 200_000 },
  { id: 'c3', name: '🍕 مطعم',             sector: 'خدمي',  price: 350_000 },
  { id: 'c4', name: '🏋️ نادي رياضي',       sector: 'خدمي',  price: 500_000 },
  { id: 'c5', name: '🏬 مركز تسوق صغير',   sector: 'تجاري', price: 700_000 },
  { id: 'c6', name: '⚙️ مصنع إنتاج',       sector: 'صناعي', price: 900_000 },
  { id: 'c7', name: '🏢 مبنى مكاتب',       sector: 'تجاري', price: 1_200_000 },
  { id: 'c8', name: '🏭 مجمع صناعي',       sector: 'صناعي', price: 1_500_000 },
  { id: 'c9', name: '🌐 شركة تقنية',       sector: 'تقني',  price: 1_750_000 },
  { id: 'c10', name: '👑 برج أعمال',       sector: 'تجاري', price: 2_000_000 },
];

// ==============================
// الموارد وسلسلة الإنتاج
// ==============================
const RAW_RESOURCES = {
  خشب:   { price: 5,   emoji: '🪵' },
  حديد:  { price: 5,   emoji: '🔩' },
  قماش:  { price: 8,   emoji: '🧵' },
  بلاستيك: { price: 12, emoji: '🧴' },
  نحاس:  { price: 40,  emoji: '🟤' },
  ذهب:   { price: 176, emoji: '🟡' },
};

// المنتجات الوسيطة (مصنّعة من الخام)
const COMPONENTS = {
  'ألواح خشبية': { emoji: '📐', requires: { خشب: 10 }, price: 80 },
  'قطع معدنية':  { emoji: '⚙️', requires: { حديد: 8, نحاس: 2 }, price: 120 },
  'أقمشة فاخرة': { emoji: '🧶', requires: { قماش: 15 }, price: 150 },
};

// المنتجات النهائية (تُباع بأعلى سعر)
const PRODUCTS = {
  'أثاث فاخر':  { emoji: '🛋️', requires: { 'ألواح خشبية': 5, 'أقمشة فاخرة': 3 }, sellPrice: 1500 },
  'أجهزة إلكترونية': { emoji: '📱', requires: { 'قطع معدنية': 6, بلاستيك: 10 }, sellPrice: 2200 },
  'مجوهرات':    { emoji: '💍', requires: { ذهب: 20, 'قطع معدنية': 4 }, sellPrice: 4500 },
};

const LEVEL_MULTIPLIERS = [1, 1.5, 2.3, 3.4, 5.0, 7.2, 10.5, 15.0, 22.0, 32.0];
const COMPANY_INCOME_RATE = 0.015; // 1.5% من قيمة الشركة كل دقيقة

const COMPANY_UPGRADE_REQ = [
  { خشب: 150, حديد: 100, قماش: 80,  بلاستيك: 60,  نحاس: 0,   ذهب: 0   },
  { خشب: 400, حديد: 300, قماش: 250, بلاستيك: 180, نحاس: 30,  ذهب: 0   },
  { خشب: 700, حديد: 550, قماش: 450, بلاستيك: 350, نحاس: 150, ذهب: 100 },
  { خشب: 1200,حديد: 950, قماش: 800, بلاستيك: 650, نحاس: 350, ذهب: 250 },
  { خشب: 2000,حديد: 1600,قماش: 1400,بلاستيك: 1100,نحاس: 700, ذهب: 500 },
  { خشب: 3200,حديد: 2700,قماش: 2300,بلاستيك: 1900,نحاس: 1300,ذهب: 900 },
  { خشب: 5000,حديد: 4300,قماش: 3700,بلاستيك: 3100,نحاس: 2200,ذهب: 1600},
  { خشب: 7500,حديد: 6500,قماش: 5700,بلاستيك: 4800,نحاس: 3500,ذهب: 2600},
  { خشب:11000,حديد:9800, قماش: 8600,بلاستيك: 7300,نحاس: 5500,ذهب: 4200},
];

// ==============================
// العقود المؤقتة (بديل الرحلات)
// ==============================
const CONTRACT_FIELDS = [
  { name: '💊 عقد طبي',        risk: 'متوسط', bonus: 1.0,  desc: 'مشروع صحي متوسط المخاطر' },
  { name: '🏗️ عقد إنشائي',      risk: 'عالي',  bonus: 1.3,  desc: 'مشروع بناء بمخاطر أعلى وعائد أكبر' },
  { name: '💻 عقد برمجي',       risk: 'منخفض', bonus: 0.85, desc: 'مشروع تقني آمن نسبياً' },
  { name: '📈 عقد استشاري',     risk: 'منخفض', bonus: 0.9,  desc: 'استشارات أعمال منخفضة المخاطر' },
  { name: '🚀 مشروع ناشئ',      risk: 'خطر',   bonus: 2.0,  desc: 'استثمار في شركة ناشئة، مخاطرة عالية جداً' },
  { name: '🏭 عقد صناعي',       risk: 'عالي',  bonus: 1.4,  desc: 'مشروع صناعي كبير بمخاطر عالية' },
];

// ==============================
// صناديق المكافآت
// ==============================
const REWARD_BOXES = {
  عادي: {
    price: 5_000, emoji: '📦', color: '#95a5a6',
    prizes: [
      { name: 'مكافأة صغيرة',  type: 'money', value: 2_000,  chance: 40 },
      { name: 'مكافأة متوسطة', type: 'money', value: 4_000,  chance: 25 },
      { name: 'مكافأة جيدة',   type: 'money', value: 10_000, chance: 18 },
      { name: 'حماية 6س',      type: 'protection', value: 6,  chance: 10 },
      { name: 'مكافأة كبيرة',  type: 'money', value: 30_000, chance: 5  },
      { name: 'مكافأة نادرة',  type: 'money', value: 80_000, chance: 2  },
    ]
  },
  فضي: {
    price: 25_000, emoji: '🥈', color: '#bdc3c7',
    prizes: [
      { name: 'مكافأة قليلة',   type: 'money', value: 10_000,  chance: 39 },
      { name: 'مكافأة جيدة',    type: 'money', value: 30_000,  chance: 27 },
      { name: 'حماية 24س',      type: 'protection', value: 24, chance: 20 },
      { name: 'مكافأة كبيرة',   type: 'money', value: 80_000,  chance: 15 },
      { name: 'مكافأة نادرة',   type: 'money', value: 200_000, chance: 10 },
      { name: 'مكافأة أسطورية', type: 'money', value: 750_000, chance: 7  },
    ]
  },
  ذهبي: {
    price: 500_000, emoji: '🥇', color: '#f1c40f',
    prizes: [
      { name: 'مكافأة متوسطة',  type: 'money', value: 100_000,  chance: 30 },
      { name: 'مكافأة كبيرة',   type: 'money', value: 200_000,  chance: 25 },
      { name: 'حماية 72س',      type: 'protection', value: 72,  chance: 20 },
      { name: 'مكافأة نادرة',   type: 'money', value: 600_000,  chance: 15 },
      { name: 'مكافأة أسطورية', type: 'money', value: 2_000_000,chance: 7  },
      { name: 'الجائزة الكبرى', type: 'money', value: 5_000_000,chance: 3  },
    ]
  },
};

const TRANSFER_COOLDOWN = 20 * 60 * 1000;
const COOLDOWNS = { عمل: 60*60*1000, استثمر: 3*60*1000, تخريب: 15*60*1000 };

// ==============================
// دوال مساعدة
// ==============================
function fmt(n) {
  if (n >= 1_000_000_000_000) return (n/1_000_000_000_000).toFixed(1)+'T 💰';
  if (n >= 1_000_000_000)     return (n/1_000_000_000).toFixed(1)+'B 💰';
  if (n >= 1_000_000)         return (n/1_000_000).toFixed(1)+'M 💰';
  if (n >= 1_000)             return (n/1_000).toFixed(1)+'K 💰';
  return n.toLocaleString('ar')+' 💰';
}

function parseAmount(str, fallback = null) {
  if (!str) return NaN;
  const s = str.toLowerCase().trim();
  if (s==='كل'||s==='all')            return fallback ?? NaN;
  if (s==='نص'||s==='نصف')            return fallback!==null ? Math.floor(fallback/2)   : NaN;
  if (s==='ربع')                       return fallback!==null ? Math.floor(fallback/4)   : NaN;
  if (s==='ثلث')                       return fallback!==null ? Math.floor(fallback/3)   : NaN;
  const mults = { 'k':1_000,'m':1_000_000,'b':1_000_000_000,'t':1_000_000_000_000 };
  for (const [suf,m] of Object.entries(mults)) {
    if (s.endsWith(suf)) { const n=parseFloat(s.slice(0,-suf.length)); if(!isNaN(n)) return Math.floor(n*m); }
  }
  return parseInt(s);
}

function fmtTime(ms) {
  if (ms<=0) return '✅ جاهز';
  const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000),s=Math.floor((ms%60000)/1000);
  if(h>0) return `${h}س ${m}د ${s}ث`; if(m>0) return `${m}د ${s}ث`; return `${s}ث`;
}

function getUser(id, username='') {
  let u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!u) { db.prepare('INSERT OR IGNORE INTO users (id,username) VALUES (?,?)').run(id,username); u=db.prepare('SELECT * FROM users WHERE id=?').get(id); }
  return u;
}

function cooldownLeft(user, cmd) {
  const fm = { عمل:'last_work', استثمر:'last_invest', تخريب:'last_sabotage' };
  const f = fm[cmd]; if(!f) return 0;
  return Math.max(0, COOLDOWNS[cmd]-(Date.now()-(user[f]||0)));
}

function getCompanyValue(company) {
  const base = COMPANIES_LIST.find(c=>c.id===company.company_id)?.price || 0;
  return Math.floor(base * (LEVEL_MULTIPLIERS[company.level-1] || 1));
}

function getResource(userId, name) {
  return db.prepare('SELECT * FROM resources WHERE owner_id=? AND name=?').get(userId, name);
}

function addResource(userId, name, qty) {
  const existing = getResource(userId, name);
  if (existing) db.prepare('UPDATE resources SET quantity=quantity+? WHERE owner_id=? AND name=?').run(qty, userId, name);
  else db.prepare('INSERT INTO resources (owner_id,name,quantity) VALUES (?,?,?)').run(userId, name, qty);
}

function removeResource(userId, name, qty) {
  db.prepare('UPDATE resources SET quantity=quantity-? WHERE owner_id=? AND name=?').run(qty, userId, name);
}

function hasEnoughResources(userId, requirements) {
  for (const [name, needed] of Object.entries(requirements)) {
    if (needed === 0) continue;
    const have = getResource(userId, name);
    if (!have || have.quantity < needed) return false;
  }
  return true;
}

function rollPrize(prizes) {
  const total = prizes.reduce((s,p)=>s+p.chance,0);
  let r = Math.random()*total, cum=0;
  for(const p of prizes){ cum+=p.chance; if(r<=cum) return p; }
  return prizes[prizes.length-1];
}

const client = new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent,GatewayIntentBits.GuildMembers]});
client.once('ready', () => {
  console.log(`✅ إمبراطورية الأعمال شغالة: ${client.user.tag}`);
  startPassiveIncomeSystem();
  startStockDriftSystem();
});

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (CONFIG.ECONOMY_CHANNEL_ID && msg.channelId !== CONFIG.ECONOMY_CHANNEL_ID) return;
  const parts = msg.content.trim().split(/\s+/), cmd = parts[0], args = parts.slice(1);
  const user = getUser(msg.author.id, msg.author.username);

  try {
    // ==========================
    // الحساب
    // ==========================
    if (cmd==='ملفي'||cmd==='بروفايل') {
      const target = msg.mentions.users.first(), u = target?getUser(target.id,target.username):user;
      const prot = u.protection_until > Date.now();
      const career = u.career ? CAREERS[u.career] : null;
      const lostLawsuits = db.prepare("SELECT COUNT(*) as c FROM lawsuits WHERE defendant_id=? AND verdict='plaintiff'").get(u.id);
      return msg.reply({embeds:[new EmbedBuilder()
        .setTitle(`📊 الملف التجاري — ${target?.username||msg.author.username}`)
        .setThumbnail((target||msg.author).displayAvatarURL())
        .setColor(prot?'#00ff88':'#4e8aff')
        .addFields(
          {name:'💵 النقد',value:fmt(u.cash),inline:true},{name:'🏦 البنك',value:fmt(u.bank),inline:true},{name:'📊 الإجمالي',value:fmt(u.cash+u.bank),inline:true},
          {name:'💼 المهنة',value:career?`${career.emoji} ${u.career}`:'❌ بدون مهنة',inline:true},
          {name:'⭐ الائتمان',value:`${u.credit_score}/100`,inline:true},{name:'🛡 الحماية',value:prot?`⏰ ${fmtTime(u.protection_until-Date.now())}`:'❌',inline:true},
          {name:'💳 القرض',value:u.loan>0?fmt(u.loan):'لا يوجد',inline:true},
          {name:'⚖️ السجل القضائي',value:lostLawsuits.c>0?`🔴 دعاوى خسرها (${lostLawsuits.c})`:'✅ نظيف',inline:true},
        ).setTimestamp()]});
    }

    if (cmd==='رصيد') {
      return msg.reply({embeds:[new EmbedBuilder().setTitle('💳 رصيدك').setColor('#4e8aff')
        .addFields({name:'💵 النقد',value:fmt(user.cash),inline:true},{name:'🏦 البنك',value:fmt(user.bank),inline:true},{name:'📊 الإجمالي',value:fmt(user.cash+user.bank),inline:true},{name:'⭐ الائتمان',value:`${user.credit_score}/100`,inline:true})]});
    }

    if (user.credit_score <= 0) {
      const allowed = ['ملفي','بروفايل','رصيد','وقت','اوامر','أوامر','ائتمان','عمل','مهنة','المهن'];
      if (!allowed.includes(cmd)) return msg.reply('🚫 **ائتمانك منهار!** خدماتك التجارية موقوفة.\nاكتب `عمل` لترفع ائتمانك تدريجياً.');
    }

    // ==========================
    // المهن
    // ==========================
    if (cmd==='المهن') {
      const total = user.cash+user.bank;
      const desc = Object.entries(CAREERS).map(([name,c])=>{
        const locked = total < c.minLevel*10_000 && c.minLevel>1;
        return `${c.emoji} **${name}** — راتب ${fmt(c.baseSalary)}/ساعة\n${c.desc}${locked?' 🔒 (يحتاج ثروة أعلى)':''}`;
      }).join('\n\n');
      return msg.reply({embeds:[new EmbedBuilder().setTitle('💼 المهن المتاحة').setColor('#3498db')
        .setDescription(desc).setFooter({text:'مهنة [الاسم] للاختيار'})]});
    }

    if (cmd==='مهنة') {
      const careerName = args[0];
      if (!careerName || !CAREERS[careerName]) return msg.reply(`❌ مهنة غير موجودة! اكتب \`المهن\` لعرض الخيارات`);
      const career = CAREERS[careerName];
      const total = user.cash+user.bank;
      if (career.minLevel > 1 && total < career.minLevel*10_000) {
        return msg.reply(`❌ تحتاج ثروة إجمالية ${fmt(career.minLevel*10_000)} على الأقل لهذه المهنة!`);
      }
      db.prepare('UPDATE users SET career=? WHERE id=?').run(careerName, msg.author.id);
      return msg.reply({embeds:[new EmbedBuilder().setTitle(`✅ أصبحت ${career.emoji} ${careerName}!`).setColor('#00ff88')
        .setDescription(`راتبك الآن: **${fmt(career.baseSalary)}** في الساعة\n${career.desc}`)]});
    }

    if (cmd==='عمل') {
      const left = cooldownLeft(user,'عمل'); if(left>0) return msg.reply(`⏰ ارجع بعد **${fmtTime(left)}**`);
      const career = user.career ? CAREERS[user.career] : CAREERS['عامل'];
      const tax = Math.floor(career.baseSalary*0.02);
      let earned = Math.floor(career.baseSalary*0.8 + Math.random()*career.baseSalary*0.4) - tax;
      db.prepare('UPDATE users SET last_work=?, credit_score=MIN(100,credit_score+1), cash=cash+? WHERE id=?').run(Date.now(), earned, msg.author.id);
      db.prepare('UPDATE treasury SET amount=amount+? WHERE id=1').run(tax);
      return msg.reply({embeds:[new EmbedBuilder().setTitle(`${career.emoji} يوم عمل ناجح!`).setColor('#ffd700')
        .setDescription(`عملت كـ **${user.career||'عامل'}** وكسبت **${fmt(earned)}**\n(بعد ضريبة ${fmt(tax)})`)
        .setFooter({text:'⭐ +1 ائتمان | ارجع كل ساعة'})]});
    }

    // ==========================
    // البنك
    // ==========================
    if (cmd==='إيداع'||cmd==='ايداع') {
      const amount = parseAmount(args[0], user.cash);
      if (isNaN(amount)||amount<=0) return msg.reply('❌ الاستخدام: `إيداع [مبلغ/كل/نص/ربع]`');
      if (user.cash<amount) return msg.reply('❌ نقدك ما يكفي!');
      db.prepare('UPDATE users SET cash=cash-?, bank=bank+? WHERE id=?').run(amount,amount,msg.author.id);
      return msg.reply({embeds:[new EmbedBuilder().setTitle('🏦 تم الإيداع').setColor('#00ff88').setDescription(`أودعت **${fmt(amount)}**`)]});
    }
    if (cmd==='سحب') {
      const amount = parseAmount(args[0], user.bank);
      if (isNaN(amount)||amount<=0) return msg.reply('❌ الاستخدام: `سحب [مبلغ/كل/نص/ربع]`');
      if (user.bank<amount) return msg.reply('❌ رصيد البنك ما يكفي!');
      db.prepare('UPDATE users SET bank=bank-?, cash=cash+? WHERE id=?').run(amount,amount,msg.author.id);
      return msg.reply({embeds:[new EmbedBuilder().setTitle('💵 تم السحب').setColor('#00ff88').setDescription(`سحبت **${fmt(amount)}**`)]});
    }
    if (cmd==='تحويل') {
      const target = msg.mentions.users.first(), amount = parseAmount(args[1], user.cash);
      if (!target||isNaN(amount)||amount<=0) return msg.reply('❌ الاستخدام: `تحويل @شخص المبلغ`');
      if (target.id===msg.author.id) return msg.reply('❌ ما تقدر تحوّل لنفسك!');
      const left = Math.max(0, TRANSFER_COOLDOWN-(Date.now()-(user.last_transfer||0)));
      if (left>0) return msg.reply(`⏰ التحويل القادم بعد **${fmtTime(left)}**`);
      const maxT = Math.floor((user.cash+user.bank)*0.5);
      if (amount>maxT) return msg.reply(`❌ الحد الأقصى: **${fmt(maxT)}**`);
      if (user.cash<amount) return msg.reply('❌ نقدك ما يكفي!');
      const fee = Math.max(1,Math.floor(amount*0.02)), received = amount-fee;
      db.prepare('UPDATE users SET cash=cash-?, last_transfer=? WHERE id=?').run(amount,Date.now(),msg.author.id);
      getUser(target.id,target.username);
      db.prepare('UPDATE users SET cash=cash+? WHERE id=?').run(received,target.id);
      db.prepare('UPDATE treasury SET amount=amount+? WHERE id=1').run(fee);
      try { client.users.fetch(target.id).then(u=>u.send(`💸 **${msg.author.username}** حوّل لك **${fmt(received)}**`).catch(()=>{})).catch(()=>{}); } catch(e){}
      return msg.reply({embeds:[new EmbedBuilder().setTitle('✅ تم التحويل').setColor('#00ff88')
        .addFields({name:'📤 من',value:msg.author.username,inline:true},{name:'📥 إلى',value:target.username,inline:true},{name:'✅ وصل',value:fmt(received),inline:true})]});
    }
    if (cmd==='قرض') {
      const amount = parseAmount(args[0]);
      if (isNaN(amount)||amount<=0) return msg.reply('❌ الاستخدام: `قرض المبلغ`');
      if (user.loan>0) return msg.reply('❌ عندك قرض! سدده أولاً');
      const left = Math.max(0, 24*60*60*1000-(Date.now()-(user.last_loan||0)));
      if (left>0) return msg.reply(`⏰ القرض القادم بعد **${fmtTime(left)}**`);
      if (amount>20_000) return msg.reply(`❌ الحد الأقصى: **${fmt(20_000)}**`);
      const repay = Math.floor(amount*1.10), due = Date.now()+7*24*60*60*1000;
      db.prepare('UPDATE users SET cash=cash+?, loan=?, loan_due=?, last_loan=? WHERE id=?').run(amount,repay,due,Date.now(),msg.author.id);
      return msg.reply({embeds:[new EmbedBuilder().setTitle('🏦 تم منح القرض').setColor('#ffd700')
        .addFields({name:'💰 استلمت',value:fmt(amount),inline:true},{name:'💸 للسداد',value:fmt(repay),inline:true},{name:'⏰ المهلة',value:'7 أيام',inline:true})
        .setFooter({text:'القرض القادم بعد 24 ساعة'})]});
    }
    if (cmd==='سداد') {
      if (user.loan===0) return msg.reply('✅ ما عليك قرض!');
      if (user.cash<user.loan) return msg.reply(`❌ تحتاج **${fmt(user.loan)}**`);
      const loan = user.loan;
      db.prepare('UPDATE users SET cash=cash-?, loan=0, loan_due=0, credit_score=MIN(100,credit_score+5) WHERE id=?').run(loan,msg.author.id);
      return msg.reply({embeds:[new EmbedBuilder().setTitle('✅ تم السداد!').setColor('#00ff88').setDescription(`سددت **${fmt(loan)}**\n⭐ +5 ائتمان`)]});
    }
    if (cmd==='حماية') {
      const opts = {'6':{h:6,p:7_000},'12':{h:12,p:35_000},'24':{h:24,p:150_000},'72':{h:72,p:300_000}};
      const opt = opts[args[0]];
      if (!opt) return msg.reply('❌ `حماية 6/12/24/72`');
      if (user.cash<opt.p) return msg.reply(`❌ تحتاج **${fmt(opt.p)}**`);
      const until = Date.now()+opt.h*3600000;
      db.prepare('UPDATE users SET cash=cash-?, protection_until=? WHERE id=?').run(opt.p,until,msg.author.id);
      return msg.reply({embeds:[new EmbedBuilder().setTitle('🛡 تم التفعيل!').setColor('#00ff88').addFields({name:'⏰ المدة',value:`${opt.h}س`,inline:true},{name:'💰 التكلفة',value:fmt(opt.p),inline:true})]});
    }
    if (cmd==='ائتمان') {
      return msg.reply({embeds:[new EmbedBuilder().setTitle('⭐ الائتمان التجاري').setColor('#ffd700')
        .addFields({name:'📊 نقاطك',value:`${user.credit_score}/100`},{name:'📈 كيف ترفع؟',value:'`عمل` +1 | `سداد` +5',inline:false},{name:'📉 كيف تنخفض؟',value:'تخريب فاشل، خسارة دعوى',inline:false})]});
    }

    // ==========================
    // الشركات (سوق + شراء بالأزرار)
    // ==========================
    if (cmd==='شركة'||cmd==='شركات') {
      const freshUser = getUser(msg.author.id,msg.author.username);
      const rows = [];
      for (let page=0; page<2; page++) {
        const row = new ActionRowBuilder();
        COMPANIES_LIST.slice(page*5,page*5+5).forEach(c=>{
          const canAfford = freshUser.cash>=c.price;
          row.addComponents(new ButtonBuilder()
            .setCustomId(`buy_co_${c.id}_${msg.author.id}`)
            .setLabel(`${c.name.replace(/[☕🏪🍕🏋️🏬⚙️🏢🏭🌐👑]/g,'').trim()} ${fmt(c.price)}`)
            .setStyle(canAfford?ButtonStyle.Success:ButtonStyle.Secondary).setDisabled(!canAfford));
        });
        rows.push(row);
      }
      const myCosForUpgrade = db.prepare('SELECT * FROM companies WHERE owner_id=? AND level < 10').all(msg.author.id);
      if (myCosForUpgrade.length>0) {
        const upRow = new ActionRowBuilder();
        myCosForUpgrade.slice(0,5).forEach(co=>{
          const cDef = COMPANIES_LIST.find(c=>c.id===co.company_id);
          const req = COMPANY_UPGRADE_REQ[co.level-1];
          const canUp = hasEnoughResources(msg.author.id, req);
          upRow.addComponents(new ButtonBuilder()
            .setCustomId(`upgrade_co_${co.id}_${msg.author.id}`)
            .setLabel(`⬆️ ${cDef?.name.replace(/[☕🏪🍕🏋️🏬⚙️🏢🏭🌐👑]/g,'').trim()} Lv${co.level}→${co.level+1}`)
            .setStyle(canUp?ButtonStyle.Primary:ButtonStyle.Secondary).setDisabled(!canUp));
        });
        rows.push(upRow);
      }
      const embed = new EmbedBuilder().setTitle('🏢 سوق الشركات').setColor('#27ae60')
        .setDescription(COMPANIES_LIST.map(c=>`${c.name} \`[${c.id}]\` — 💰 ${fmt(c.price)} | 📊 ${c.sector} | 📈 ${fmt(Math.floor(c.price*COMPANY_INCOME_RATE))}/دقيقة`).join('\n'))
        .setFooter({text:`رصيدك: ${fmt(freshUser.cash)} | اضغط للشراء الفوري`});
      return msg.reply({embeds:[embed], components:rows});
    }

    if (cmd==='شركاتي') {
      const myCos = db.prepare('SELECT * FROM companies WHERE owner_id=?').all(msg.author.id);
      if (myCos.length===0) return msg.reply('🏢 ماعندك شركات! اكتب `شركة` لعرض السوق');
      const now = Date.now(); let desc='', totalIncome=0;
      for (const co of myCos) {
        const cDef = COMPANIES_LIST.find(c=>c.id===co.company_id);
        const curVal = getCompanyValue(co);
        const incomePerMin = Math.floor(curVal*COMPANY_INCOME_RATE);
        totalIncome += incomePerMin;
        const elapsedMin = (now-co.last_collected)/60000;
        const pending = Math.floor(incomePerMin*elapsedMin);
        desc += `**#${co.id} ${cDef?.name||co.company_id}** — مستوى ${co.level}/10\n💰 ${fmt(curVal)} | 📈 ${fmt(incomePerMin)}/د | ⏳ ${fmt(pending)}\n\n`;
      }
      return msg.reply({embeds:[new EmbedBuilder().setTitle(`🏢 شركات ${msg.author.username}`).setColor('#27ae60')
        .setDescription(desc).addFields({name:'📈 إجمالي الدخل/د',value:fmt(totalIncome),inline:true})
        .setFooter({text:'تحصيل_أرباح لجمع الدخل'})]});
    }

    if (cmd==='تحصيل_أرباح') {
      const myCos = db.prepare('SELECT * FROM companies WHERE owner_id=?').all(msg.author.id);
      if (myCos.length===0) return msg.reply('🏢 ماعندك شركات!');
      const now = Date.now(); let total=0; const details=[];
      for (const co of myCos) {
        const cDef = COMPANIES_LIST.find(c=>c.id===co.company_id);
        const curVal = getCompanyValue(co);
        const incomePerMin = Math.floor(curVal*COMPANY_INCOME_RATE);
        const elapsedMin = (now-co.last_collected)/60000;
        const earned = Math.floor(incomePerMin*elapsedMin);
        if (earned>0) {
          total += earned;
          details.push(`${cDef?.name||co.company_id} → ${fmt(earned)}`);
          db.prepare('UPDATE companies SET last_collected=? WHERE id=?').run(now,co.id);
        }
      }
      if (total===0) return msg.reply('⏰ ما تراكم شيء بعد!');
      db.prepare('UPDATE users SET cash=cash+? WHERE id=?').run(total,msg.author.id);
      return msg.reply({embeds:[new EmbedBuilder().setTitle('💰 تم تحصيل الأرباح!').setColor('#27ae60')
        .setDescription(details.slice(0,5).join('\n')).addFields({name:'💰 الإجمالي',value:fmt(total)})]});
    }

    if (cmd==='بيع_شركة') {
      const coId = parseInt(args[0]);
      if (isNaN(coId)) return msg.reply('❌ `بيع_شركة [رقم]`');
      const co = db.prepare('SELECT * FROM companies WHERE id=? AND owner_id=?').get(coId,msg.author.id);
      if (!co) return msg.reply('❌ الشركة غير موجودة!');
      const curVal = getCompanyValue(co), sellPrice = Math.floor(curVal*0.70);
      db.prepare('DELETE FROM companies WHERE id=?').run(co.id);
      db.prepare('UPDATE users SET cash=cash+? WHERE id=?').run(sellPrice,msg.author.id);
      return msg.reply({embeds:[new EmbedBuilder().setTitle('💸 تم البيع').setColor('#ffd700').setDescription(`استلمت **${fmt(sellPrice)}** (70%)`)]});
    }

    // ==========================
    // الموارد + التصنيع
    // ==========================
    if (cmd==='موارد') {
      const desc = Object.entries(RAW_RESOURCES).map(([n,r])=>`${r.emoji} **${n}** — ${fmt(r.price)}/وحدة`).join('\n');
      return msg.reply({embeds:[new EmbedBuilder().setTitle('📦 أسعار الموارد الخام').setColor('#e67e22').setDescription(desc)]});
    }

    if (cmd==='سوق_موارد') {
      const freshUser = getUser(msg.author.id,msg.author.username);
      const names = Object.keys(RAW_RESOURCES);
      const row1 = new ActionRowBuilder(), row2 = new ActionRowBuilder();
      names.slice(0,3).forEach(n=>{
        const r = RAW_RESOURCES[n];
        row1.addComponents(new ButtonBuilder().setCustomId(`askres_${n}_${msg.author.id}`).setLabel(`${r.emoji} ${n} — ${fmt(r.price)}`).setStyle(ButtonStyle.Primary));
      });
      names.slice(3).forEach(n=>{
        const r = RAW_RESOURCES[n];
        row2.addComponents(new ButtonBuilder().setCustomId(`askres_${n}_${msg.author.id}`).setLabel(`${r.emoji} ${n} — ${fmt(r.price)}`).setStyle(ButtonStyle.Primary));
      });
      const embed = new EmbedBuilder().setTitle('🏪 سوق الموارد الخام').setColor('#e67e22')
        .setFooter({text:`رصيدك: ${fmt(freshUser.cash)} | اضغط على المادة ثم اكتب الكمية`});
      return msg.reply({embeds:[embed], components:[row1,row2]});
    }

    if (cmd==='مخزوني') {
      const res = db.prepare('SELECT * FROM resources WHERE owner_id=? AND quantity>0').all(msg.author.id);
      if (res.length===0) return msg.reply('📦 مخزونك فاضي!');
      const desc = res.map(r=>{
        const info = RAW_RESOURCES[r.name]||COMPONENTS[r.name]||PRODUCTS[r.name];
        return `${info?.emoji||'📦'} **${r.name}**: ${r.quantity.toLocaleString()}`;
      }).join('\n');
      return msg.reply({embeds:[new EmbedBuilder().setTitle(`📦 مخزون ${msg.author.username}`).setColor('#e67e22').setDescription(desc)]});
    }

    if (cmd==='تصنيع') {
      const itemName = args[0], qty = parseInt(args[1])||1;
      const isComponent = COMPONENTS[itemName], isProduct = PRODUCTS[itemName];
      const item = isComponent || isProduct;
      if (!item) return msg.reply(`❌ عنصر غير معروف!\nمكونات: ${Object.keys(COMPONENTS).join(' | ')}\nمنتجات: ${Object.keys(PRODUCTS).join(' | ')}`);
      const totalReq = {};
      for (const [n,v] of Object.entries(item.requires)) totalReq[n] = v*qty;
      if (!hasEnoughResources(msg.author.id, totalReq)) {
        const missing = Object.entries(totalReq).map(([n,v])=>{
          const have = getResource(msg.author.id,n);
          return `${n}: تحتاج ${v} عندك ${have?.quantity||0}`;
        }).join('\n');
        return msg.reply({embeds:[new EmbedBuilder().setTitle('❌ مواد ناقصة').setColor('#e74c3c').setDescription(missing)]});
      }
      for (const [n,v] of Object.entries(totalReq)) removeResource(msg.author.id, n, v);
      addResource(msg.author.id, itemName, qty);
      return msg.reply({embeds:[new EmbedBuilder().setTitle(`✅ صنّعت ${item.emoji} ${itemName} ×${qty}`).setColor('#27ae60')]});
    }

    if (cmd==='بيع_منتج') {
      const itemName = args[0], qty = parseInt(args[1]);
      const item = PRODUCTS[itemName];
      if (!item) return msg.reply(`❌ منتج غير معروف! المنتجات: ${Object.keys(PRODUCTS).join(' | ')}`);
      if (isNaN(qty)||qty<=0) return msg.reply('❌ حدد الكمية!');
      const have = getResource(msg.author.id, itemName);
      if (!have||have.quantity<qty) return msg.reply(`❌ ماعندك ${qty} ${itemName}!`);
      const traderBonus = user.career==='تاجر' ? 1.15 : 1.0;
      const revenue = Math.floor(item.sellPrice*qty*traderBonus);
      removeResource(msg.author.id, itemName, qty);
      db.prepare('UPDATE users SET cash=cash+? WHERE id=?').run(revenue,msg.author.id);
      return msg.reply({embeds:[new EmbedBuilder().setTitle(`💰 بعت ${item.emoji} ${itemName} ×${qty}`).setColor('#00ff88')
        .setDescription(`استلمت **${fmt(revenue)}**${user.career==='تاجر'?' (بونص تاجر +15%)':''}`)]});
    }

    // ==========================
    // سوق الأسهم
    // ==========================
    if (cmd==='الأسهم'||cmd==='اسهم') {
      const stocks = db.prepare('SELECT * FROM stocks').all();
      const desc = stocks.map(s=>`**${s.symbol}** ${s.company_name} — 💰 ${fmt(s.price)}/سهم`).join('\n');
      return msg.reply({embeds:[new EmbedBuilder().setTitle('📈 سوق الأسهم').setColor('#3498db')
        .setDescription(desc).setFooter({text:'شراء_سهم [رمز] [كمية] | بيع_سهم [رمز] [كمية]'})]});
    }

    if (cmd==='شراء_سهم') {
      const symbol = args[0]?.toUpperCase(), qty = parseInt(args[1]);
      const stock = db.prepare('SELECT * FROM stocks WHERE symbol=?').get(symbol);
      if (!stock) return msg.reply('❌ رمز غير موجود! اكتب `الأسهم`');
      if (isNaN(qty)||qty<=0) return msg.reply('❌ حدد الكمية!');
      const cost = stock.price*qty;
      if (user.cash<cost) return msg.reply(`❌ تحتاج **${fmt(cost)}**`);
      db.prepare('UPDATE users SET cash=cash-? WHERE id=?').run(cost,msg.author.id);
      const existing = db.prepare('SELECT * FROM user_stocks WHERE owner_id=? AND symbol=?').get(msg.author.id,symbol);
      if (existing) db.prepare('UPDATE user_stocks SET shares=shares+? WHERE owner_id=? AND symbol=?').run(qty,msg.author.id,symbol);
      else db.prepare('INSERT INTO user_stocks (owner_id,symbol,shares) VALUES (?,?,?)').run(msg.author.id,symbol,qty);
      // ضغط شراء يرفع السعر قليلاً
      const newPrice = Math.floor(stock.price*(1+0.001*qty));
      db.prepare('UPDATE stocks SET price=? WHERE symbol=?').run(Math.min(newPrice,stock.price*3),symbol);
      return msg.reply({embeds:[new EmbedBuilder().setTitle(`✅ اشتريت ${qty} سهم ${symbol}`).setColor('#00ff88').setDescription(`التكلفة: **${fmt(cost)}**`)]});
    }

    if (cmd==='بيع_سهم') {
      const symbol = args[0]?.toUpperCase(), qty = parseInt(args[1]);
      const stock = db.prepare('SELECT * FROM stocks WHERE symbol=?').get(symbol);
      if (!stock) return msg.reply('❌ رمز غير موجود!');
      const holding = db.prepare('SELECT * FROM user_stocks WHERE owner_id=? AND symbol=?').get(msg.author.id,symbol);
      if (!holding||holding.shares<qty) return msg.reply(`❌ ماعندك ${qty} سهم ${symbol}!`);
      const revenue = stock.price*qty;
      db.prepare('UPDATE user_stocks SET shares=shares-? WHERE owner_id=? AND symbol=?').run(qty,msg.author.id,symbol);
      db.prepare('UPDATE users SET cash=cash+? WHERE id=?').run(revenue,msg.author.id);
      // ضغط بيع يخفض السعر قليلاً
      const newPrice = Math.floor(stock.price*(1-0.001*qty));
      db.prepare('UPDATE stocks SET price=? WHERE symbol=?').run(Math.max(newPrice,Math.floor(stock.price*0.3)),symbol);
      return msg.reply({embeds:[new EmbedBuilder().setTitle(`💰 بعت ${qty} سهم ${symbol}`).setColor('#ffd700').setDescription(`استلمت **${fmt(revenue)}**`)]});
    }

    if (cmd==='محفظتي') {
      const holdings = db.prepare('SELECT * FROM user_stocks WHERE owner_id=? AND shares>0').all(msg.author.id);
      if (holdings.length===0) return msg.reply('📈 محفظتك فاضية!');
      let totalVal = 0;
      const desc = holdings.map(h=>{
        const stock = db.prepare('SELECT * FROM stocks WHERE symbol=?').get(h.symbol);
        const val = stock.price*h.shares; totalVal += val;
        return `**${h.symbol}** ${stock.company_name}: ${h.shares} سهم — ${fmt(val)}`;
      }).join('\n');
      return msg.reply({embeds:[new EmbedBuilder().setTitle('📈 محفظتك الاستثمارية').setColor('#3498db')
        .setDescription(desc).addFields({name:'💰 القيمة الإجمالية',value:fmt(totalVal)})]});
    }

    // ==========================
    // التخريب التجاري (بديل السرقة) + الدعاوى
    // ==========================
    if (cmd==='تخريب') {
      const left = cooldownLeft(user,'تخريب'); if(left>0) return msg.reply(`⏰ انتظر **${fmtTime(left)}**`);
      const target = msg.mentions.users.first();
      if (!target) return msg.reply('❌ `تخريب @شخص`');
      if (target.id===msg.author.id) return msg.reply('❌ ما تقدر تخرب على نفسك!');
      const victim = db.prepare('SELECT * FROM users WHERE id=?').get(target.id);
      if (!victim||victim.cash<500) return msg.reply('😅 ماعنده نقد كافي!');
      if (victim.protection_until>Date.now()) { db.prepare('UPDATE users SET credit_score=MAX(0,credit_score-5) WHERE id=?').run(msg.author.id); return msg.reply(`🛡 **${target.username}** محمي! -5 ائتمان`); }
      const success = Math.random()>0.50;
      db.prepare('UPDATE users SET last_sabotage=? WHERE id=?').run(Date.now(),msg.author.id);
      if (success) {
        const stolen = Math.floor(Math.random()*victim.cash*0.10)+50;
        db.prepare('UPDATE users SET cash=cash+?,credit_score=MAX(0,credit_score-10) WHERE id=?').run(stolen,msg.author.id);
        db.prepare('UPDATE users SET cash=MAX(0,cash-?) WHERE id=?').run(stolen,target.id);
        db.prepare('INSERT INTO sabotage_log (saboteur_id,victim_id,amount) VALUES (?,?,?)').run(msg.author.id,target.id,stolen);
        try { client.users.fetch(target.id).then(u=>u.send(`💥 **تعرضت لتخريب تجاري!**\n**${msg.author.username}** سرق منك **${fmt(stolen)}**`).catch(()=>{})).catch(()=>{}); } catch(e){}
        return msg.reply({embeds:[new EmbedBuilder().setTitle('💥 نجح التخريب!').setColor('#ffd700').setDescription(`ربحت **${fmt(stolen)}** من ${target.username}`).setFooter({text:'-10 ائتمان'})]});
      } else {
        const fine = Math.floor(user.cash*0.10);
        db.prepare('UPDATE users SET cash=MAX(0,cash-?),credit_score=MAX(0,credit_score-15) WHERE id=?').run(fine,msg.author.id);
        db.prepare('UPDATE treasury SET amount=amount+? WHERE id=1').run(fine);
        return msg.reply({embeds:[new EmbedBuilder().setTitle('🚨 تم اكتشافك!').setColor('#e74c3c').setDescription(`دفعت غرامة **${fmt(fine)}** و -15 ائتمان`)]});
      }
    }

    if (cmd==='دعوى') {
      const target = msg.mentions.users.first();
      if (!target) return msg.reply('❌ `دعوى @الشخص`');
      const record = db.prepare('SELECT * FROM sabotage_log WHERE saboteur_id=? AND victim_id=? ORDER BY at DESC LIMIT 1').get(target.id,msg.author.id);
      if (!record) return msg.reply('❌ ما يوجد سجل تخريب ضدك من هذا الشخص!');
      const existing = db.prepare("SELECT * FROM lawsuits WHERE plaintiff_id=? AND defendant_id=? AND status='open'").get(msg.author.id,target.id);
      if (existing) return msg.reply('⚠️ عندك دعوى مفتوحة على هذا الشخص!');
      db.prepare('INSERT INTO lawsuits (plaintiff_id,defendant_id,claimed_amount) VALUES (?,?,?)').run(msg.author.id,target.id,record.amount);
      const caseId = db.prepare('SELECT last_insert_rowid() as id').get().id;
      const targetUser = db.prepare('SELECT * FROM users WHERE id=?').get(target.id);
      const lawyerBonus = user.career==='محامي' ? 0.15 : 0;
      const winChance = Math.min(0.85, 0.5+(100-targetUser.credit_score)*0.004+lawyerBonus);
      const win = Math.random()<winChance;
      const award = record.amount*3;
      if (win) {
        const actualPay = Math.min(award,(targetUser.cash||0)+(targetUser.bank||0));
        db.prepare('UPDATE users SET cash=MAX(0,cash-?) WHERE id=?').run(Math.min(actualPay,targetUser.cash||0),target.id);
        db.prepare('UPDATE users SET cash=cash+? WHERE id=?').run(actualPay,msg.author.id);
        db.prepare("UPDATE lawsuits SET status='closed',verdict='plaintiff' WHERE id=?").run(caseId);
        db.prepare('UPDATE users SET credit_score=MAX(0,credit_score-20) WHERE id=?').run(target.id);
        db.prepare('DELETE FROM sabotage_log WHERE id=?').run(record.id);
        return msg.reply({embeds:[new EmbedBuilder().setTitle('⚖️ ربحت الدعوى!').setColor('#00ff88')
          .addFields({name:'💰 التعويض',value:fmt(actualPay),inline:true})]});
      } else {
        db.prepare("UPDATE lawsuits SET status='closed',verdict='defendant' WHERE id=?").run(caseId);
        db.prepare('DELETE FROM sabotage_log WHERE id=?').run(record.id);
        const fee = Math.floor(record.amount*0.1);
        db.prepare('UPDATE users SET cash=MAX(0,cash-?) WHERE id=?').run(fee,msg.author.id);
        db.prepare('UPDATE treasury SET amount=amount+? WHERE id=1').run(fee);
        return msg.reply({embeds:[new EmbedBuilder().setTitle('⚖️ خسرت الدعوى!').setColor('#e74c3c').addFields({name:'💸 رسوم',value:fmt(fee),inline:true})]});
      }
    }

    if (cmd==='دعاواي') {
      const cases = db.prepare('SELECT * FROM lawsuits WHERE plaintiff_id=? OR defendant_id=? ORDER BY created_at DESC LIMIT 5').all(msg.author.id,msg.author.id);
      if (cases.length===0) return msg.reply('📋 لا دعاوى!');
      const desc = cases.map(c=>{
        const role = c.plaintiff_id===msg.author.id?'مدعي':'مدعى عليه';
        const status = c.status==='open'?'🟡 مفتوحة':c.verdict==='plaintiff'?'✅ فاز المدعي':'❌ رُفضت';
        return `• ${role} — ${fmt(c.claimed_amount)} — ${status}`;
      }).join('\n');
      return msg.reply({embeds:[new EmbedBuilder().setTitle('⚖️ دعاواي').setColor('#3498db').setDescription(desc)]});
    }

    // ==========================
    // التحالفات + الأسواق (حروب المناطق)
    // ==========================
    if (cmd==='تأسيس_تحالف') {
      const name = args[0]; if (!name) return msg.reply('❌ `تأسيس_تحالف [اسم]`');
      const existing = db.prepare('SELECT * FROM alliances WHERE leader_id=? OR member2_id=? OR member3_id=?').get(msg.author.id,msg.author.id,msg.author.id);
      if (existing) return msg.reply('❌ أنت بالفعل في تحالف!');
      if (db.prepare('SELECT * FROM alliances WHERE name=?').get(name)) return msg.reply('❌ الاسم مأخوذ!');
      const cost = 80_000; if (user.cash<cost) return msg.reply(`❌ تحتاج **${fmt(cost)}**`);
      db.prepare('UPDATE users SET cash=cash-? WHERE id=?').run(cost,msg.author.id);
      db.prepare('INSERT INTO alliances (name,leader_id) VALUES (?,?)').run(name,msg.author.id);
      return msg.reply({embeds:[new EmbedBuilder().setTitle('🤝 تم تأسيس التحالف!').setColor('#3498db')
        .addFields({name:'🏴 الاسم',value:name,inline:true},{name:'👑 القائد',value:msg.author.username,inline:true})
        .setFooter({text:'دعوة_تحالف @شخص للإضافة | سيطرة [رقم] للسيطرة على سوق'})]});
    }
    if (cmd==='دعوة_تحالف') {
      const target = msg.mentions.users.first(); if (!target) return msg.reply('❌ `دعوة_تحالف @شخص`');
      const alliance = db.prepare('SELECT * FROM alliances WHERE leader_id=?').get(msg.author.id);
      if (!alliance) return msg.reply('❌ لست قائد تحالف!');
      if (db.prepare('SELECT * FROM alliances WHERE leader_id=? OR member2_id=? OR member3_id=?').get(target.id,target.id,target.id)) return msg.reply('❌ الشخص في تحالف!');
      const count = [alliance.leader_id,alliance.member2_id,alliance.member3_id].filter(Boolean).length;
      if (count>=3) return msg.reply('❌ التحالف ممتلئ!');
      if (!alliance.member2_id) db.prepare('UPDATE alliances SET member2_id=? WHERE id=?').run(target.id,alliance.id);
      else db.prepare('UPDATE alliances SET member3_id=? WHERE id=?').run(target.id,alliance.id);
      getUser(target.id,target.username);
      return msg.reply(`✅ أضفت **${target.username}** للتحالف!`);
    }
    if (cmd==='تحالفي') {
      const alliance = db.prepare('SELECT * FROM alliances WHERE leader_id=? OR member2_id=? OR member3_id=?').get(msg.author.id,msg.author.id,msg.author.id);
      if (!alliance) return msg.reply('❌ لست في تحالف!');
      const leader = db.prepare('SELECT username FROM users WHERE id=?').get(alliance.leader_id);
      const markets = db.prepare('SELECT * FROM markets WHERE controlled_by=?').all(alliance.id);
      return msg.reply({embeds:[new EmbedBuilder().setTitle(`🤝 تحالف ${alliance.name}`).setColor('#3498db')
        .addFields({name:'👑 القائد',value:leader?.username||'?',inline:true},{name:'💰 الخزنة',value:fmt(alliance.treasury),inline:true},{name:'🏆 انتصارات',value:`${alliance.wins}`,inline:true},{name:'🗺️ الأسواق المسيطر عليها',value:markets.length>0?markets.map(m=>m.name).join('\n'):'لا يوجد',inline:false})]});
    }
    if (cmd==='مغادرة_تحالف') {
      const alliance = db.prepare('SELECT * FROM alliances WHERE leader_id=? OR member2_id=? OR member3_id=?').get(msg.author.id,msg.author.id,msg.author.id);
      if (!alliance) return msg.reply('❌ لست في تحالف!');
      if (alliance.leader_id===msg.author.id) {
        db.prepare('UPDATE users SET cash=cash+? WHERE id=?').run(alliance.treasury,msg.author.id);
        db.prepare('UPDATE markets SET controlled_by=NULL WHERE controlled_by=?').run(alliance.id);
        db.prepare('DELETE FROM alliances WHERE id=?').run(alliance.id);
        return msg.reply('✅ تم حل التحالف');
      } else {
        if (alliance.member2_id===msg.author.id) db.prepare('UPDATE alliances SET member2_id=NULL WHERE id=?').run(alliance.id);
        else db.prepare('UPDATE alliances SET member3_id=NULL WHERE id=?').run(alliance.id);
        return msg.reply('✅ غادرت التحالف');
      }
    }
    if (cmd==='أسواق'||cmd==='اسواق') {
      const markets = db.prepare('SELECT * FROM markets').all();
      const desc = markets.map(m=>{
        const alliance = m.controlled_by ? db.prepare('SELECT name FROM alliances WHERE id=?').get(m.controlled_by) : null;
        return `**#${m.id} ${m.name}** — 💰 ${fmt(m.income_per_hour)}/ساعة — ${alliance?`🏴 ${alliance.name}`:'🔓 غير مسيطر عليه'}`;
      }).join('\n');
      return msg.reply({embeds:[new EmbedBuilder().setTitle('🗺️ الأسواق المتاحة').setColor('#e74c3c')
        .setDescription(desc).setFooter({text:'سيطرة [رقم] — للاستيلاء على سوق'})]});
    }
    if (cmd==='سيطرة') {
      const marketId = parseInt(args[0]);
      if (isNaN(marketId)) return msg.reply('❌ `سيطرة [رقم]`');
      const alliance = db.prepare('SELECT * FROM alliances WHERE leader_id=? OR member2_id=? OR member3_id=?').get(msg.author.id,msg.author.id,msg.author.id);
      if (!alliance) return msg.reply('❌ لازم تكون في تحالف!');
      const market = db.prepare('SELECT * FROM markets WHERE id=?').get(marketId);
      if (!market) return msg.reply('❌ سوق غير موجود!');
      if (market.controlled_by===alliance.id) return msg.reply('✅ أنت مسيطر عليه بالفعل!');
      const success = Math.random()>0.5;
      if (success) {
        db.prepare('UPDATE markets SET controlled_by=? WHERE id=?').run(alliance.id,marketId);
        db.prepare('UPDATE alliances SET wins=wins+1 WHERE id=?').run(alliance.id);
        return msg.reply({embeds:[new EmbedBuilder().setTitle('🏆 نجحت السيطرة!').setColor('#00ff88').setDescription(`تحالف **${alliance.name}** استولى على **${market.name}**!`)]});
      } else {
        return msg.reply('❌ فشلت محاولة السيطرة! حاول مرة أخرى بعدين');
      }
    }
    if (cmd==='تحالفات') {
      const top = db.prepare('SELECT * FROM alliances ORDER BY wins DESC LIMIT 5').all();
      if (top.length===0) return msg.reply('🤝 لا يوجد تحالفات بعد!');
      const desc = top.map((a,i)=>{
        const leader = db.prepare('SELECT username FROM users WHERE id=?').get(a.leader_id);
        return `${['🥇','🥈','🥉','4️⃣','5️⃣'][i]} **${a.name}** — قائد: ${leader?.username||'?'} | فوز: ${a.wins} | خزنة: ${fmt(a.treasury)}`;
      }).join('\n');
      return msg.reply({embeds:[new EmbedBuilder().setTitle('🤝 أقوى التحالفات').setColor('#e74c3c').setDescription(desc)]});
    }

    // ==========================
    // العقود المؤقتة (استثمار مؤقت)
    // ==========================
    if (cmd==='عقد') {
      const amount = parseAmount(args[0], user.cash);
      if (isNaN(amount)||amount<10_000) return msg.reply('❌ `عقد [مبلغ] [المجال]` — الحد الأدنى 10K\nاكتب `المجالات` لعرض الخيارات');
      if (user.cash<amount) return msg.reply('❌ نقدك ما يكفي!');
      const existing = db.prepare("SELECT * FROM contracts WHERE user_id=? AND notified=0").get(msg.author.id);
      if (existing) { const left=Math.max(0,existing.ends_at-Date.now()); return msg.reply(`⏰ عندك عقد نشط! ينتهي بعد **${fmtTime(left)}**`); }
      const fieldName = args.slice(1).join(' ');
      const field = fieldName ? CONTRACT_FIELDS.find(f=>f.name.includes(fieldName)) : CONTRACT_FIELDS[Math.floor(Math.random()*CONTRACT_FIELDS.length)];
      if (fieldName && !field) return msg.reply('❌ مجال غير موجود! اكتب `المجالات`');
      const selected = field || CONTRACT_FIELDS[0];
      const riskProfiles = {
        منخفض: [{r:'فشل',p:-0.35,c:10},{r:'خسارة',p:-0.12,c:35},{r:'عادي',p:0.02,c:25},{r:'جيد',p:0.10,c:20},{r:'ممتاز',p:0.25,c:8},{r:'استثنائي',p:0.50,c:2}],
        متوسط: [{r:'فشل',p:-0.45,c:15},{r:'خسارة',p:-0.20,c:40},{r:'عادي',p:0.03,c:20},{r:'جيد',p:0.18,c:15},{r:'ممتاز',p:0.45,c:7},{r:'استثنائي',p:0.90,c:3}],
        عالي:  [{r:'فشل',p:-0.65,c:20},{r:'خسارة',p:-0.30,c:45},{r:'عادي',p:0.04,c:10},{r:'جيد',p:0.25,c:12},{r:'ممتاز',p:0.70,c:8},{r:'استثنائي',p:1.30,c:5}],
        خطر:   [{r:'فشل',p:-1.00,c:50},{r:'خسارة',p:-0.60,c:25},{r:'عادي',p:0.08,c:8},{r:'جيد',p:0.40,c:8},{r:'ممتاز',p:1.00,c:5},{r:'استثنائي',p:2.50,c:4}],
      };
      const profile = riskProfiles[selected.risk]||riskProfiles['متوسط'];
      const totalC = profile.reduce((s,p)=>s+p.c,0);
      let r=Math.random()*totalC, cum=0, chosen=profile[0];
      for (const p of profile) { cum+=p.c; if(r<=cum){chosen=p;break;} }
      const profit = Math.floor(amount*chosen.p*selected.bonus);
      const endsAt = Date.now()+2*60*60*1000;
      db.prepare('UPDATE users SET cash=cash-? WHERE id=?').run(amount,msg.author.id);
      db.prepare('INSERT INTO contracts (user_id,amount,field,result,profit,started_at,ends_at) VALUES (?,?,?,?,?,?,?)').run(msg.author.id,amount,selected.name,chosen.r,profit,Date.now(),endsAt);
      return msg.reply({embeds:[new EmbedBuilder().setTitle(`📝 بدأت ${selected.name}!`).setColor('#3498db')
        .addFields({name:'💰 المبلغ',value:fmt(amount),inline:true},{name:'⚠️ الخطورة',value:selected.risk,inline:true},{name:'⏰ ينتهي بعد',value:'ساعتين',inline:true})
        .setFooter({text:'اكتب: نتيجة_عقد بعد ساعتين'})]});
    }
    if (cmd==='المجالات') {
      const desc = CONTRACT_FIELDS.map(f=>`${f.name} — ⚠️ ${f.risk} | ${f.desc}`).join('\n');
      return msg.reply({embeds:[new EmbedBuilder().setTitle('📝 مجالات العقود').setColor('#3498db').setDescription(desc)]});
    }
    if (cmd==='نتيجة_عقد') {
      const contract = db.prepare("SELECT * FROM contracts WHERE user_id=? AND notified=0").get(msg.author.id);
      if (!contract) return msg.reply('❌ ماعندك عقد نشط!');
      if (Date.now()<contract.ends_at) return msg.reply(`⏰ ارجع بعد **${fmtTime(contract.ends_at-Date.now())}**`);
      db.prepare('UPDATE contracts SET notified=1 WHERE id=?').run(contract.id);
      const netReturn = contract.profit>=0 ? contract.amount+contract.profit : Math.max(0,contract.amount-Math.abs(contract.profit));
      db.prepare('UPDATE users SET cash=cash+? WHERE id=?').run(netReturn,msg.author.id);
      return msg.reply({embeds:[new EmbedBuilder().setTitle(`📊 انتهى ${contract.field} — ${contract.result}!`).setColor(contract.profit>=0?'#00ff88':'#e74c3c')
        .addFields({name:'💰 المستثمر',value:fmt(contract.amount),inline:true},{name:contract.profit>=0?'📈 الربح':'📉 الخسارة',value:fmt(Math.abs(contract.profit)),inline:true},{name:'✅ استلمت',value:fmt(netReturn),inline:true})]});
    }
    if (cmd==='عقدي') {
      const contract = db.prepare("SELECT * FROM contracts WHERE user_id=? AND notified=0").get(msg.author.id);
      if (!contract) return msg.reply('📝 ماعندك عقد نشط. اكتب `عقد [مبلغ]`');
      const left = Math.max(0,contract.ends_at-Date.now());
      return msg.reply({embeds:[new EmbedBuilder().setTitle('📝 عقدي الحالي').setColor('#3498db')
        .addFields({name:'المجال',value:contract.field,inline:true},{name:'الحالة',value:left<=0?'✅ جاهز':`⏳ ${fmtTime(left)}`,inline:true})]});
    }

    // ==========================
    // صناديق المكافآت
    // ==========================
    if (cmd==='صناديق') {
      const desc = Object.entries(REWARD_BOXES).map(([n,b])=>{
        const max = Math.max(...b.prizes.map(p=>p.value));
        return `${b.emoji} **${n}** — 💰 ${fmt(b.price)} | 🏆 أعلى جائزة: ${fmt(max)}`;
      }).join('\n');
      return msg.reply({embeds:[new EmbedBuilder().setTitle('🎁 صناديق المكافآت').setColor('#9b59b6')
        .setDescription(desc).setFooter({text:'فتح_صندوق [عادي/فضي/ذهبي]'})]});
    }
    if (cmd==='فتح_صندوق') {
      const boxType = args[0];
      const box = REWARD_BOXES[boxType];
      if (!box) return msg.reply(`❌ الأنواع: ${Object.keys(REWARD_BOXES).map(k=>`\`${k}\``).join(' | ')}`);
      const left = Math.max(0, 3*60*60*1000-(Date.now()-(user.last_lootbox||0)));
      if (left>0) return msg.reply(`⏰ الصندوق القادم بعد **${fmtTime(left)}**`);
      if (user.cash<box.price) return msg.reply(`❌ تحتاج **${fmt(box.price)}**`);
      db.prepare('UPDATE users SET cash=cash-?, last_lootbox=? WHERE id=?').run(box.price,Date.now(),msg.author.id);
      const prize = rollPrize(box.prizes);
      let gained=0;
      if (prize.type==='money') { gained=prize.value; db.prepare('UPDATE users SET cash=cash+? WHERE id=?').run(gained,msg.author.id); }
      else if (prize.type==='protection') { const until=Date.now()+prize.value*3600000; db.prepare('UPDATE users SET protection_until=? WHERE id=?').run(until,msg.author.id); }
      db.prepare('INSERT INTO reward_boxes (user_id,box_type,prize,prize_value) VALUES (?,?,?,?)').run(msg.author.id,boxType,prize.name,prize.value);
      const profit = gained-box.price;
      return msg.reply({embeds:[new EmbedBuilder().setTitle(`${box.emoji} فتحت صندوق ${boxType}!`).setColor(box.color)
        .addFields({name:'🎁 الجائزة',value:prize.name,inline:true},{name:'💰 القيمة',value:prize.type==='money'?fmt(prize.value):`حماية ${prize.value}س`,inline:true})]});
    }

    // ==========================
    // معلومات عامة
    // ==========================
    if (cmd==='متصدرون'||cmd==='ليدربورد') {
      const top = db.prepare('SELECT *,(cash+bank) as total FROM users ORDER BY total DESC LIMIT 10').all();
      const medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
      return msg.reply({embeds:[new EmbedBuilder().setTitle('🏆 أثرى رجال الأعمال').setColor('#ffd700')
        .setDescription(top.map((u,i)=>`${medals[i]} **${u.username}** — ${fmt(u.total)}`).join('\n')||'لا بيانات')]});
    }
    if (cmd==='الخزينة') {
      const t = db.prepare('SELECT * FROM treasury WHERE id=1').get();
      const cnt = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
      return msg.reply({embeds:[new EmbedBuilder().setTitle('🏛 الخزينة العامة').setColor('#e74c3c')
        .addFields({name:'💰 الرصيد',value:fmt(t.amount),inline:true},{name:'👥 رجال الأعمال',value:`${cnt}`,inline:true})]});
    }
    if (cmd==='وقت') {
      const tranLeft = Math.max(0,TRANSFER_COOLDOWN-(Date.now()-(user.last_transfer||0)));
      const loanLeft = Math.max(0,24*60*60*1000-(Date.now()-(user.last_loan||0)));
      const boxLeft = Math.max(0,3*60*60*1000-(Date.now()-(user.last_lootbox||0)));
      const fields = [
        {name:'💼 عمل',value:cooldownLeft(user,'عمل')>0?`⏰ ${fmtTime(cooldownLeft(user,'عمل'))}`:'✅ جاهز',inline:true},
        {name:'💥 تخريب',value:cooldownLeft(user,'تخريب')>0?`⏰ ${fmtTime(cooldownLeft(user,'تخريب'))}`:'✅ جاهز',inline:true},
        {name:'💸 تحويل',value:tranLeft>0?`⏰ ${fmtTime(tranLeft)}`:'✅ جاهز',inline:true},
        {name:'🏦 قرض',value:loanLeft>0?`⏰ ${fmtTime(loanLeft)}`:'✅ جاهز',inline:true},
        {name:'🎁 صندوق',value:boxLeft>0?`⏰ ${fmtTime(boxLeft)}`:'✅ جاهز',inline:true},
      ];
      return msg.reply({embeds:[new EmbedBuilder().setTitle(`⏰ أوقات الأوامر`).setColor('#3498db').addFields(...fields)]});
    }

    if (cmd==='اوامر'||cmd==='أوامر') {
      return msg.reply({embeds:[new EmbedBuilder().setTitle('📋 أوامر إمبراطورية الأعمال').setColor('#4e8aff')
        .addFields(
          {name:'👤 الحساب',value:'`ملفي` `رصيد` `وقت` `ائتمان`'},
          {name:'💼 المهنة',value:'`المهن` `مهنة [اسم]` `عمل`'},
          {name:'🏦 البنك',value:'`إيداع` `سحب` `تحويل @شخص مبلغ` `قرض مبلغ` `سداد` `حماية 6/12/24/72`'},
          {name:'🏢 الشركات',value:'`شركة` `شركاتي` `تحصيل_أرباح` `بيع_شركة [رقم]`'},
          {name:'📦 الموارد والتصنيع',value:'`موارد` `سوق_موارد` `مخزوني` `تصنيع [اسم] [كمية]` `بيع_منتج [اسم] [كمية]`'},
          {name:'📈 الأسهم',value:'`الأسهم` `شراء_سهم [رمز] [كمية]` `بيع_سهم [رمز] [كمية]` `محفظتي`'},
          {name:'💥 التخريب والدعاوى',value:'`تخريب @شخص` `دعوى @شخص` `دعاواي`'},
          {name:'🤝 التحالفات',value:'`تأسيس_تحالف [اسم]` `دعوة_تحالف @شخص` `تحالفي` `مغادرة_تحالف`'},
          {name:'🗺️ الأسواق',value:'`أسواق` `سيطرة [رقم]` `تحالفات`'},
          {name:'📝 العقود',value:'`عقد [مبلغ] [مجال]` `المجالات` `نتيجة_عقد` `عقدي`'},
          {name:'🎁 المكافآت',value:'`صناديق` `فتح_صندوق [نوع]`'},
          {name:'📊 عام',value:'`متصدرون` `الخزينة`'},
        ).setFooter({text:'💡 كل | نص | ربع | 1k | 1m | 1b'})]});
    }

    // ==========================
    // أوامر الإدارة
    // ==========================
    const isOwner = msg.author.id===CONFIG.OWNER_ID||CONFIG.EXTRA_OWNERS.includes(msg.author.id);
    if (!isOwner) return;

    if (cmd==='تفضل') {
      const target = msg.mentions.users.first(), amount = parseAmount(args[1]);
      if (!target||isNaN(amount)) return msg.reply('❌ `تفضل @شخص مبلغ`');
      getUser(target.id,target.username); db.prepare('UPDATE users SET cash=cash+? WHERE id=?').run(amount,target.id);
      return msg.reply(`✅ أضفت ${fmt(amount)}`);
    }
    if (cmd==='خذ') {
      const target = msg.mentions.users.first(), amount = parseAmount(args[1]);
      if (!target||isNaN(amount)) return msg.reply('❌ `خذ @شخص مبلغ`');
      db.prepare('UPDATE users SET cash=MAX(0,cash-?) WHERE id=?').run(amount,target.id);
      return msg.reply(`✅ أخذت ${fmt(amount)}`);
    }
    if (cmd==='ريست') {
      const target = msg.mentions.users.first(); if (!target) return msg.reply('❌ `ريست @شخص`');
      db.prepare('UPDATE users SET cash=5000,bank=0,loan=0,loan_due=0,credit_score=100 WHERE id=?').run(target.id);
      db.prepare('DELETE FROM companies WHERE owner_id=?').run(target.id);
      db.prepare('DELETE FROM resources WHERE owner_id=?').run(target.id);
      db.prepare('DELETE FROM user_stocks WHERE owner_id=?').run(target.id);
      return msg.reply(`✅ تم ريست ${target.username}`);
    }
    if (cmd==='ريست_الكل') {
      if (args[0]!=='تأكيد') return msg.reply('⚠️ `ريست_الكل تأكيد`');
      db.prepare('UPDATE users SET cash=5000,bank=0,loan=0,loan_due=0,credit_score=100,last_work=0,last_invest=0,last_sabotage=0,last_transfer=0,last_loan=0,last_lootbox=0,protection_until=0').run();
      db.prepare('DELETE FROM companies').run(); db.prepare('DELETE FROM resources').run();
      db.prepare('DELETE FROM user_stocks').run(); db.prepare('UPDATE treasury SET amount=0').run();
      return msg.reply('✅ تم ريست الكل!');
    }

  } catch(e) { console.error('خطأ:',e); msg.reply('❌ حدث خطأ!').catch(()=>{}); }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const customId = interaction.customId;

  // زر شراء شركة
  if (customId.startsWith('buy_co_')) {
    const parts = customId.split('_'); // buy_co_c1_userId
    const coId = parts[2], userId = parts[3];
    if (interaction.user.id!==userId) return interaction.reply({content:'❌ ليست لك!',ephemeral:true});
    const cDef = COMPANIES_LIST.find(c=>c.id===coId);
    if (!cDef) return interaction.reply({content:'❌ غير موجودة',ephemeral:true});
    const freshUser = getUser(userId,interaction.user.username);
    if (freshUser.cash<cDef.price) return interaction.reply({content:`❌ تحتاج ${fmt(cDef.price)}`,ephemeral:true});
    db.prepare('UPDATE users SET cash=cash-? WHERE id=?').run(cDef.price,userId);
    db.prepare('INSERT INTO companies (owner_id,company_id,level,current_value,last_collected) VALUES (?,?,1,?,?)').run(userId,cDef.id,cDef.price,Date.now());
    const updatedUser = getUser(userId);
    const rows = [];
    for (let page=0; page<2; page++) {
      const row = new ActionRowBuilder();
      COMPANIES_LIST.slice(page*5,page*5+5).forEach(c=>{
        const canAfford = updatedUser.cash>=c.price;
        row.addComponents(new ButtonBuilder().setCustomId(`buy_co_${c.id}_${userId}`).setLabel(`${c.name.replace(/[☕🏪🍕🏋️🏬⚙️🏢🏭🌐👑]/g,'').trim()} ${fmt(c.price)}`).setStyle(canAfford?ButtonStyle.Success:ButtonStyle.Secondary).setDisabled(!canAfford));
      });
      rows.push(row);
    }
    const myCosForUpgrade = db.prepare('SELECT * FROM companies WHERE owner_id=? AND level < 10').all(userId);
    if (myCosForUpgrade.length>0) {
      const upRow = new ActionRowBuilder();
      myCosForUpgrade.slice(0,5).forEach(co=>{
        const cd = COMPANIES_LIST.find(c=>c.id===co.company_id);
        const req = COMPANY_UPGRADE_REQ[co.level-1];
        const canUp = hasEnoughResources(userId, req);
        upRow.addComponents(new ButtonBuilder().setCustomId(`upgrade_co_${co.id}_${userId}`).setLabel(`⬆️ ${cd?.name.replace(/[☕🏪🍕🏋️🏬⚙️🏢🏭🌐👑]/g,'').trim()} Lv${co.level}→${co.level+1}`).setStyle(canUp?ButtonStyle.Primary:ButtonStyle.Secondary).setDisabled(!canUp));
      });
      rows.push(upRow);
    }
    const embed = new EmbedBuilder().setTitle('🏢 سوق الشركات').setColor('#27ae60')
      .setDescription(COMPANIES_LIST.map(c=>`${c.name} \`[${c.id}]\` — 💰 ${fmt(c.price)}`).join('\n'))
      .setFooter({text:`رصيدك: ${fmt(updatedUser.cash)} | ✅ اشتريت ${cDef.name}!`});
    return interaction.update({embeds:[embed], components:rows});
  }

  // زر ترقية شركة
  if (customId.startsWith('upgrade_co_')) {
    const parts = customId.split('_');
    const coDbId = parseInt(parts[2]), userId = parts[3];
    if (interaction.user.id!==userId) return interaction.reply({content:'❌ ليست لك!',ephemeral:true});
    const co = db.prepare('SELECT * FROM companies WHERE id=? AND owner_id=?').get(coDbId,userId);
    if (!co) return interaction.reply({content:'❌ غير موجودة',ephemeral:true});
    if (co.level>=10) return interaction.reply({content:'🏆 أعلى مستوى!',ephemeral:true});
    const req = COMPANY_UPGRADE_REQ[co.level-1];
    const cDef = COMPANIES_LIST.find(c=>c.id===co.company_id);
    if (!hasEnoughResources(userId, req)) return interaction.reply({content:'❌ مواد ناقصة!',ephemeral:true});
    for (const [n,v] of Object.entries(req)) { if(v>0) removeResource(userId,n,v); }
    const newLevel = co.level+1;
    const newValue = Math.floor(cDef.price*(LEVEL_MULTIPLIERS[newLevel-1]||1));
    db.prepare('UPDATE companies SET level=?,current_value=? WHERE id=?').run(newLevel,newValue,coDbId);
    const updatedUser = getUser(userId);
    const rows2 = [];
    for (let pg=0; pg<2; pg++) {
      const row = new ActionRowBuilder();
      COMPANIES_LIST.slice(pg*5,pg*5+5).forEach(c=>{
        const canAfford = updatedUser.cash>=c.price;
        row.addComponents(new ButtonBuilder().setCustomId(`buy_co_${c.id}_${userId}`).setLabel(`${c.name.replace(/[☕🏪🍕🏋️🏬⚙️🏢🏭🌐👑]/g,'').trim()} ${fmt(c.price)}`).setStyle(canAfford?ButtonStyle.Success:ButtonStyle.Secondary).setDisabled(!canAfford));
      });
      rows2.push(row);
    }
    const myLeft = db.prepare('SELECT * FROM companies WHERE owner_id=? AND level < 10').all(userId);
    if (myLeft.length>0) {
      const upRow2 = new ActionRowBuilder();
      myLeft.slice(0,5).forEach(l2=>{
        const cd2 = COMPANIES_LIST.find(c=>c.id===l2.company_id);
        const req2 = COMPANY_UPGRADE_REQ[l2.level-1];
        const canUp = hasEnoughResources(userId, req2);
        upRow2.addComponents(new ButtonBuilder().setCustomId(`upgrade_co_${l2.id}_${userId}`).setLabel(`⬆️ ${cd2?.name.replace(/[☕🏪🍕🏋️🏬⚙️🏢🏭🌐👑]/g,'').trim()} Lv${l2.level}→${l2.level+1}`).setStyle(canUp?ButtonStyle.Primary:ButtonStyle.Secondary).setDisabled(!canUp));
      });
      rows2.push(upRow2);
    }
    const embed2 = new EmbedBuilder().setTitle('🏢 سوق الشركات').setColor('#27ae60')
      .setDescription(COMPANIES_LIST.map(c=>`${c.name} — 💰 ${fmt(c.price)}`).join('\n'))
      .setFooter({text:`✅ رُقّيت ${cDef?.name} إلى مستوى ${newLevel}!`});
    return interaction.update({embeds:[embed2], components:rows2});
  }

  // زر طلب كمية المورد
  if (customId.startsWith('askres_')) {
    const parts = customId.split('_');
    const resName = parts[1], userId = parts[2];
    if (interaction.user.id!==userId) return interaction.reply({content:'❌ ليست لك!',ephemeral:true});
    await interaction.reply({content:`🛒 اكتب الكمية التي تريد شراءها من **${resName}**`, ephemeral:false});
    const channel = interaction.channel;
    try {
      const collected = await channel.awaitMessages({ filter: m=>m.author.id===userId, max:1, time:30000, errors:['time'] });
      const response = collected.first();
      const qty = parseInt(response.content.trim());
      if (isNaN(qty)||qty<=0) return response.reply('❌ كمية غير صحيحة!').catch(()=>{});
      const info = RAW_RESOURCES[resName];
      if (!info) return response.reply('❌ مورد غير موجود!').catch(()=>{});
      const cost = info.price*qty;
      const freshUser = getUser(userId,interaction.user.username);
      if (freshUser.cash<cost) return response.reply(`❌ تحتاج **${fmt(cost)}**`).catch(()=>{});
      db.prepare('UPDATE users SET cash=cash-? WHERE id=?').run(cost,userId);
      addResource(userId, resName, qty);
      await response.reply({embeds:[new EmbedBuilder().setTitle('✅ تم الشراء!').setColor('#e67e22')
        .addFields({name:'المورد',value:resName,inline:true},{name:'الكمية',value:`${qty}`,inline:true},{name:'التكلفة',value:fmt(cost),inline:true})]}).catch(()=>{});
    } catch(e) {
      interaction.followUp({content:'⏰ انتهى الوقت!',ephemeral:true}).catch(()=>{});
    }
    return;
  }
});

// دخل الأسواق التلقائي للتحالفات (كل ساعة)
function startPassiveIncomeSystem() {
  setInterval(() => {
    try {
      const controlled = db.prepare('SELECT * FROM markets WHERE controlled_by IS NOT NULL').all();
      for (const m of controlled) {
        db.prepare('UPDATE alliances SET treasury=treasury+? WHERE id=?').run(m.income_per_hour, m.controlled_by);
      }
    } catch(e) { console.error('خطأ دخل الأسواق:', e); }
  }, 60*60*1000);
}

// تذبذب طبيعي بسيط لأسعار الأسهم (كل 10 دقائق)
function startStockDriftSystem() {
  setInterval(() => {
    try {
      const stocks = db.prepare('SELECT * FROM stocks').all();
      for (const s of stocks) {
        const drift = 1 + (Math.random()*0.1 - 0.05); // ±5%
        const newPrice = Math.max(50, Math.floor(s.price*drift));
        db.prepare('UPDATE stocks SET price=? WHERE symbol=?').run(newPrice, s.symbol);
      }
    } catch(e) { console.error('خطأ تذبذب الأسهم:', e); }
  }, 10*60*1000);
}

client.login(process.env.TOKEN);
