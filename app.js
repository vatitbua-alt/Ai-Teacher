/* ============================================================
   AI TEACHER ASSISTANT — APP.JS
   Full logic: API, Navigation, Generation, Chat, Utilities
   ============================================================ */

'use strict';

// ============================================================
// STATE
// ============================================================
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

let apiKey = '';
let teacherName = 'คุณครู';
let stats = { plans: 0, materials: 0, games: 0, tests: 0 };
let chatHistory = [];
let selectedMatType = 'worksheet';
let selectedGameType = 'quiz';
let selectedDiff = 'ง่าย';
let selectedFlowType = 'Flow Chart การสอน';

// ============================================================
// STORAGE UTILITY (Safe wrapper for incognito/restricted envs)
// ============================================================
const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('localStorage is disabled or not accessible:', e);
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('localStorage is disabled or not accessible:', e);
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('localStorage is disabled or not accessible:', e);
    }
  }
};

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  marked.setOptions({ breaks: true, gfm: true });
  setupChatInput();
  
  // Add enter key listener on API settings inputs
  document.getElementById('apiKeyInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveSettings();
    }
  });
  document.getElementById('teacherNameInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveSettings();
    }
  });

  updateUI();
});

function loadSettings() {
  apiKey = storage.get('ata_api_key') || '';
  teacherName = storage.get('ata_teacher') || 'คุณครู';
  
  let savedStats = '{"plans":0,"materials":0,"games":0,"tests":0}';
  try {
    savedStats = storage.get('ata_stats') || savedStats;
    stats = JSON.parse(savedStats);
  } catch (e) {
    console.error('Failed to parse stats:', e);
  }
  
  try {
    chatHistory = JSON.parse(storage.get('ata_chat') || '[]');
  } catch (e) {
    console.error('Failed to parse chat history:', e);
    chatHistory = [];
  }

  if (apiKey) {
    document.getElementById('apiModal').classList.remove('active');
    updateApiStatus(true);
    restoreChat();
  } else {
    updateApiStatus(false);
  }

  document.getElementById('apiKeyInput').value = apiKey;
  document.getElementById('teacherNameInput').value = teacherName;
  updateWelcome();
  updateStats();
}

function saveSettings() {
  let key = document.getElementById('apiKeyInput').value.trim();
  const name = document.getElementById('teacherNameInput').value.trim() || 'คุณครู';

  // Clean common copy-paste mistakes (like surrounding quotes or env var prefix)
  key = key.replace(/^["']|["']$/g, '');
  if (key.includes('=')) {
    const parts = key.split('=');
    key = parts[parts.length - 1].trim();
  }

  if (!key) {
    showToast('กรุณาใส่ Gemini API Key', 'error');
    return;
  }

  apiKey = key;
  teacherName = name;
  storage.set('ata_api_key', key);
  storage.set('ata_teacher', name);
  document.getElementById('apiModal').classList.remove('active');
  updateApiStatus(true);
  updateWelcome();
  showToast('เชื่อมต่อสำเร็จ! ยินดีต้อนรับ ' + teacherName, 'success');
}

function openSettings() {
  document.getElementById('apiModal').classList.add('active');
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('apiKeyInput');
  const btn = document.getElementById('toggleApiKey');
  if (input.type === 'password') {
    input.type = 'text';
    btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
  } else {
    input.type = 'password';
    btn.innerHTML = '<i class="fas fa-eye"></i>';
  }
}

function updateWelcome() {
  const now = new Date();
  const h = now.getHours();
  const greeting = h < 12 ? 'อรุณสวัสดิ์' : h < 18 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';
  const el = document.getElementById('welcomeMsg');
  if (el) el.textContent = `${greeting}, ${teacherName}! 👋`;
  const sn = document.getElementById('sidebarTeacherName');
  if (sn) sn.textContent = teacherName;
}

function updateApiStatus(connected) {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  if (connected) {
    dot.classList.add('connected');
    text.textContent = 'เชื่อมต่อแล้ว';
  } else {
    dot.classList.remove('connected');
    text.textContent = 'ยังไม่เชื่อมต่อ';
  }
}

function updateStats() {
  document.getElementById('stat-plans').textContent = stats.plans;
  document.getElementById('stat-materials').textContent = stats.materials;
  document.getElementById('stat-games').textContent = stats.games;
  document.getElementById('stat-tests').textContent = stats.tests;
}

function saveStats() {
  storage.set('ata_stats', JSON.stringify(stats));
  updateStats();
}

function updateUI() { /* placeholder for future updates */ }

// ============================================================
// NAVIGATION
// ============================================================
function switchPanel(panelName, el) {
  // Hide all panels
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  // Show target panel
  const panel = document.getElementById('panel-' + panelName);
  if (panel) panel.classList.add('active');

  // Highlight nav
  if (el) {
    el.classList.add('active');
  } else {
    const navEl = document.querySelector(`[data-panel="${panelName}"]`);
    if (navEl) navEl.classList.add('active');
  }

  // Scroll to top
  document.querySelector('.main-content')?.scrollTo(0, 0);
  return false;
}

// ============================================================
// GEMINI API
// ============================================================
async function callGemini(prompt, systemPrompt) {
  if (!apiKey) {
    openSettings();
    throw new Error('กรุณาใส่ API Key ก่อน');
  }

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
    generationConfig: {
      temperature: 0.75,
      topP: 0.9,
      maxOutputTokens: 8192
    }
  };

  const resp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    const msg = err?.error?.message || 'API Error';
    if (msg.includes('API_KEY_INVALID') || msg.includes('API key')) throw new Error('API Key ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
    if (msg.includes('QUOTA') || msg.includes('quota')) throw new Error('เกินโควต้า API กรุณารอสักครู่');
    throw new Error(msg);
  }

  const data = await resp.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callGeminiChat(messages) {
  if (!apiKey) { openSettings(); throw new Error('กรุณาใส่ API Key ก่อน'); }

  const system = `คุณเป็น AI ผู้ช่วยครูผู้เชี่ยวชาญด้านการศึกษาและการสอนในระดับ K-12 และอาชีวศึกษา
คุณมีความรู้ลึกซึ้งเกี่ยวกับ:
- หลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พ.ศ. 2551 (ฉบับปรับปรุง 2560)
- เทคนิคการสอนและการเรียนรู้สมัยใหม่ (Active Learning, PBL, Gamification, etc.)
- การจัดการชั้นเรียน การวัดและประเมินผล
- จิตวิทยาการเรียนรู้และพัฒนาการของนักเรียน
- เทคโนโลยีการศึกษาและนวัตกรรมการสอน

ตอบเป็นภาษาไทยเสมอ ใช้ภาษาที่เป็นมิตร ให้ข้อมูลที่เป็นประโยชน์จริงๆ
ใช้ emoji เพื่อทำให้การสนทนาน่าอ่าน แต่ไม่มากเกินไป
จัดรูปแบบคำตอบให้อ่านง่าย ใช้ markdown formatting`;

  const body = {
    contents: messages,
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: { temperature: 0.8, maxOutputTokens: 4096 }
  };

  const resp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    const msg = err?.error?.message || 'API Error';
    if (msg.includes('API_KEY_INVALID') || msg.includes('API key')) throw new Error('API Key ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
    if (msg.includes('QUOTA') || msg.includes('quota')) throw new Error('เกินโควต้า API กรุณารอสักครู่');
    throw new Error(msg);
  }
  const data = await resp.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ============================================================
// OUTPUT HELPERS
// ============================================================
function showLoading(boxId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  box.innerHTML = `
    <div class="loading-wrap">
      <div class="spinner"></div>
      <p class="loading-text">AI กำลังสร้างเนื้อหา...</p>
    </div>`;
}

function showResult(boxId, markdownText, actionsId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  const html = marked.parse(markdownText);
  box.innerHTML = `<div class="generated-content">${html}</div>`;
  const acts = document.getElementById(actionsId);
  if (acts) acts.style.display = 'flex';
}

function showError(boxId, msg) {
  const box = document.getElementById(boxId);
  if (!box) return;
  box.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">⚠️</div>
      <p style="color:#EF4444">${msg}</p>
      <p class="empty-sub">กรุณาลองใหม่อีกครั้ง</p>
    </div>`;
}

function setGenerating(btnEl, loading) {
  if (!btnEl) return;
  if (loading) {
    btnEl.dataset.orig = btnEl.innerHTML;
    btnEl.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;margin:0 auto"></div>';
    btnEl.disabled = true;
  } else {
    btnEl.innerHTML = btnEl.dataset.orig || btnEl.innerHTML;
    btnEl.disabled = false;
  }
}

// ============================================================
// LESSON PLAN
// ============================================================
async function generateLessonPlan() {
  const subject = document.getElementById('lp-subject').value.trim();
  const level = document.getElementById('lp-level').value;
  const duration = document.getElementById('lp-duration').value;
  const topic = document.getElementById('lp-topic').value.trim();
  const unit = document.getElementById('lp-unit').value.trim();
  const notes = document.getElementById('lp-notes').value.trim();

  if (!subject || !level || !topic) {
    showToast('กรุณากรอก วิชา, ระดับชั้น และ หัวข้อ', 'error'); return;
  }

  const methods = [...document.querySelectorAll('#panel-lessonPlan .cb-item input:checked')]
    .map(cb => cb.value).join(', ');

  const btn = document.querySelector('#panel-lessonPlan .btn-generate');
  setGenerating(btn, true);
  showLoading('lp-result');

  const prompt = `สร้างแผนการสอนมาตรฐานหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พ.ศ. 2551 (ฉบับปรับปรุง 2560) โดยมีรายละเอียดดังนี้:

**วิชา:** ${subject}
**ระดับชั้น:** ${level}
**หัวข้อ/เรื่อง:** ${topic}
**หน่วยการเรียนรู้:** ${unit || 'ไม่ระบุ'}
**เวลา:** ${duration} นาที
**รูปแบบการสอน:** ${methods || 'ทั่วไป'}
**จุดเน้นพิเศษ:** ${notes || 'ไม่มี'}

กรุณาสร้างแผนการสอนที่ครอบคลุมองค์ประกอบต่อไปนี้อย่างละเอียด:

## 1. หัวข้อแผนการสอน
(สรุปชื่อแผน รหัสวิชา ชั้น คาบ)

## 2. สาระสำคัญ
(แนวคิดหลักของเนื้อหาที่สอน)

## 3. จุดประสงค์การเรียนรู้
- ด้านความรู้ (K)
- ด้านทักษะ/กระบวนการ (P)
- ด้านเจตคติ (A)

## 4. สมรรถนะสำคัญของผู้เรียน

## 5. คุณลักษณะอันพึงประสงค์

## 6. ตัวชี้วัด/ผลการเรียนรู้ที่คาดหวัง

## 7. เนื้อหาสาระ
(แบ่งเป็นหัวข้อย่อยที่ชัดเจน)

## 8. กิจกรรมการเรียนการสอน
### ขั้นนำเข้าสู่บทเรียน (…นาที)
### ขั้นสอน (…นาที)
### ขั้นสรุป (…นาที)
(อธิบายกิจกรรมอย่างละเอียด ระบุเวลาแต่ละขั้น)

## 9. สื่อ/แหล่งการเรียนรู้/อุปกรณ์

## 10. การวัดและประเมินผล
| สิ่งที่วัด | วิธีการวัด | เครื่องมือ | เกณฑ์ |
|---|---|---|---|

## 11. บันทึกหลังการสอน (แบบฟอร์ม)
(พื้นที่สำหรับครูกรอกหลังสอน)

ใช้ภาษาไทยที่เป็นทางการ จัดรูปแบบสวยงาม อ่านง่าย`;

  const system = `คุณเป็นผู้เชี่ยวชาญด้านการออกแบบการสอนตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พ.ศ. 2551 (ฉบับปรับปรุง 2560) ของประเทศไทย
สร้างแผนการสอนที่สมบูรณ์ ละเอียด และนำไปใช้ได้จริง ใช้ภาษาไทยราชการที่ถูกต้อง`;

  try {
    const result = await callGemini(prompt, system);
    showResult('lp-result', result, 'lp-actions');
    stats.plans++;
    saveStats();
    showToast('สร้างแผนการสอนสำเร็จ! 📋', 'success');
  } catch (e) {
    showError('lp-result', e.message);
    showToast(e.message, 'error');
  } finally {
    setGenerating(btn, false);
  }
}

// ============================================================
// CURRICULUM
// ============================================================
async function generateCurriculum() {
  const subject = document.getElementById('cur-subject').value.trim();
  const level = document.getElementById('cur-level').value;
  const semester = document.getElementById('cur-semester').value;
  const weeks = document.getElementById('cur-weeks').value;
  const periods = document.getElementById('cur-periods').value;
  const standards = document.getElementById('cur-standards').value.trim();
  const goals = document.getElementById('cur-goals').value.trim();

  if (!subject) { showToast('กรุณากรอกชื่อวิชา', 'error'); return; }

  const btn = document.querySelector('#panel-curriculum .btn-generate');
  setGenerating(btn, true);
  showLoading('cur-result');

  const totalPeriods = parseInt(weeks) * parseInt(periods);

  const prompt = `สร้างโครงสร้างหลักสูตรและแผนการสอนตลอดภาคเรียนสำหรับ:

**วิชา:** ${subject}
**ระดับชั้น:** ${level}
**ภาคเรียนที่:** ${semester}
**จำนวนสัปดาห์:** ${weeks} สัปดาห์
**คาบต่อสัปดาห์:** ${periods} คาบ
**คาบรวมทั้งหมด:** ${totalPeriods} คาบ
**มาตรฐาน/ตัวชี้วัด:** ${standards || 'ตามหลักสูตรแกนกลาง'}
**เป้าหมายพิเศษ:** ${goals || 'ไม่มี'}

กรุณาสร้าง:

## 📌 ภาพรวมหลักสูตร

## 🎯 จุดมุ่งหมายของรายวิชา

## 📅 โครงสร้างหน่วยการเรียนรู้
(แบ่งเป็นหน่วยๆ พร้อมจำนวนคาบและสัปดาห์)

| หน่วยที่ | ชื่อหน่วยการเรียนรู้ | เนื้อหาหลัก | จำนวนคาบ | สัปดาห์ที่ |
|---|---|---|---|---|

## 🗓️ Timeline รายสัปดาห์
(แสดงสัปดาห์ที่ 1-${weeks} พร้อมหัวข้อและกิจกรรมหลัก)

| สัปดาห์ | วันที่ (โดยประมาณ) | หัวข้อ/เนื้อหา | กิจกรรมหลัก | หมายเหตุ |
|---|---|---|---|---|

## 📊 การวัดและประเมินผลตลอดภาคเรียน
(ระบุสัดส่วนคะแนนระหว่างเรียน/ปลายภาค และกิจกรรมการประเมิน)

## 📚 สื่อและแหล่งเรียนรู้หลัก

## ⚡ เหตุการณ์สำคัญ / กำหนดการพิเศษ
(สอบกลางภาค, ปลายภาค, กิจกรรมพิเศษ ฯลฯ)

ใช้ตารางและรูปแบบที่อ่านง่าย จัดรูปแบบให้สวยงาม`;

  try {
    const result = await callGemini(prompt);
    showResult('cur-result', result, 'cur-actions');
    showToast('สร้างโครงสร้างหลักสูตรสำเร็จ! 🗺️', 'success');
  } catch (e) {
    showError('cur-result', e.message);
    showToast(e.message, 'error');
  } finally {
    setGenerating(btn, false);
  }
}

// ============================================================
// FLOWCHART
// ============================================================
function selectChip(el, groupId) {
  document.querySelectorAll(`#${groupId} .chip`).forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  selectedFlowType = el.textContent.trim();
}

async function generateFlowchart() {
  const topic = document.getElementById('flow-topic').value.trim();
  const level = document.getElementById('flow-level').value;
  const periodsEl = document.getElementById('flow-periods');
  const periods = periodsEl.value;
  const objectives = document.getElementById('flow-objectives').value.trim();
  const flowType = selectedFlowType;

  if (!topic) { showToast('กรุณากรอกวิชา/หัวข้อ', 'error'); return; }

  const btn = document.querySelector('#panel-flowchart .btn-generate');
  setGenerating(btn, true);
  showLoading('flow-result');

  const prompts = {
    'Flow Chart การสอน': `สร้าง Flow Chart ขั้นตอนการสอนสำหรับ:
**หัวข้อ:** ${topic}
**ระดับ:** ${level}
**ระยะเวลา:** ${periods}
**จุดประสงค์:** ${objectives || 'ให้นักเรียนเรียนรู้เนื้อหาหลักและสามารถนำไปใช้ได้'}

สร้างผังขั้นตอนการสอนที่ละเอียด ประกอบด้วย:

## 🔄 Flow Chart การสอน

### 🚀 จุดเริ่มต้น
(เป้าหมายและเงื่อนไขเริ่มต้น)

### 📋 ขั้นตอนหลัก
(แสดงเป็นขั้นตอนที่ชัดเจน มีการแตกสาขาตามเงื่อนไข)

\`\`\`
[เริ่มคาบเรียน]
       ↓
[ทบทวนความรู้เดิม / Pre-test]
       ↓
  ┌─ ผ่าน? ─┐
  ↓ (ไม่ผ่าน) ↓ (ผ่าน)
[ปูพื้นฐาน] [เริ่มเนื้อหาใหม่]
       ↓         ↓
    [รวมกัน]
       ↓
... (ต่อ)
\`\`\`

### 🔀 จุดแตกสาขาและเงื่อนไข
(อธิบายเงื่อนไขการตัดสินใจในแต่ละจุด)

### 📊 จุดประเมิน
(ระบุว่าประเมินที่ขั้นตอนไหน วิธีการอย่างไร)

### 🏁 จุดสิ้นสุด
(เป้าหมายสุดท้ายและผลลัพธ์ที่คาดหวัง)

### 💡 คำอธิบายผัง
(อธิบายภาพรวมของ Flow Chart)`
    ,
    'ผังหน่วยการเรียนรู้': `สร้างผังหน่วยการเรียนรู้ (Unit Web) สำหรับ:
**หัวข้อ:** ${topic}
**ระดับ:** ${level}
**ระยะเวลา:** ${periods}

## 🗺️ ผังหน่วยการเรียนรู้: ${topic}

### แนวคิดหลัก (Big Idea)
### แนวคิดรอง (Sub-concepts)
### ความสัมพันธ์ระหว่างแนวคิด
### ลำดับการเรียนรู้
### ทักษะที่ต้องพัฒนา
### การบูรณาการ`
    ,
    'Mind Map บทเรียน': `สร้าง Mind Map สำหรับบทเรียน:
**หัวข้อ:** ${topic}
**ระดับ:** ${level}

## 🧠 Mind Map: ${topic}

### หัวข้อกลาง
### กิ่งหลัก (Main Branches) - 5-7 กิ่ง
### กิ่งย่อย (Sub-branches)
### คำสำคัญ (Keywords)
### ความเชื่อมโยง`
    ,
    'Concept Map': `สร้าง Concept Map สำหรับ:
**หัวข้อ:** ${topic}
**ระดับ:** ${level}

## 🔗 Concept Map: ${topic}

### แนวคิดหลัก
### แนวคิดที่เกี่ยวข้อง
### ความสัมพันธ์และคำเชื่อม
### ลำดับชั้นแนวคิด`
  };

  const prompt = prompts[flowType] || prompts['Flow Chart การสอน'];

  try {
    const result = await callGemini(prompt);
    showResult('flow-result', result, 'flow-actions');
    showToast('สร้างผังการสอนสำเร็จ! 📐', 'success');
  } catch (e) {
    showError('flow-result', e.message);
    showToast(e.message, 'error');
  } finally {
    setGenerating(btn, false);
  }
}

// ============================================================
// MATERIALS
// ============================================================
function selectMatType(el) {
  document.querySelectorAll('#matTypeGrid .mat-type').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  selectedMatType = el.dataset.type;
}

async function generateMaterial() {
  const topic = document.getElementById('mat-topic').value.trim();
  const level = document.getElementById('mat-level').value;
  const details = document.getElementById('mat-details').value.trim();

  if (!topic) { showToast('กรุณากรอกวิชา/หัวข้อ', 'error'); return; }

  const btn = document.querySelector('#panel-materials .btn-generate');
  setGenerating(btn, true);
  showLoading('mat-result');

  const typeLabels = {
    worksheet: 'ใบงาน (Worksheet)',
    handout: 'ใบความรู้ (Handout)',
    summary: 'บทสรุป (Summary Sheet)',
    exercise: 'แบบฝึกหัด (Exercise)',
    slides: 'โครงร่าง Slide (Slide Outline)',
    mindmap: 'Mind Map (Text-based)',
    infographic: 'โครงร่าง Infographic (Infographic Script)',
    rubric: 'เกณฑ์การประเมิน (Rubric)'
  };

  const typePrompts = {
    worksheet: `สร้างใบงานสำหรับ:
**วิชา/หัวข้อ:** ${topic}
**ระดับ:** ${level}
**รายละเอียดเพิ่มเติม:** ${details || 'ไม่มี'}

ใบงานต้องมี:
1. **หัวใบงาน** (ชื่อโรงเรียน, รายวิชา, ชั้น, วันที่, ชื่อนักเรียน, เลขที่, คะแนน)
2. **จุดประสงค์การเรียนรู้**
3. **คำชี้แจง** (ชัดเจนสำหรับนักเรียน)
4. **กิจกรรม/คำถาม** (หลากหลายรูปแบบ: เติมคำ, ตอบสั้น, วาดภาพ, ระบาย ฯลฯ ตามเหมาะสม)
5. **สรุป/ข้อคิด** ท้ายใบงาน

จัดรูปแบบสวยงาม อ่านง่าย เหมาะกับระดับ${level}`,

    handout: `สร้างใบความรู้สำหรับ:
**วิชา/หัวข้อ:** ${topic}
**ระดับ:** ${level}
**รายละเอียด:** ${details || 'ไม่มี'}

ใบความรู้ต้องมี:
1. **หัวข้อหลัก** และ **หัวข้อย่อย** ที่ชัดเจน
2. **เนื้อหาความรู้** ที่ถูกต้อง ครบถ้วน เหมาะกับระดับชั้น
3. **แผนภาพ/ตาราง** (อธิบายในรูปแบบ text)
4. **คำศัพท์สำคัญ** พร้อมความหมาย
5. **ตัวอย่าง** ที่เข้าใจง่าย
6. **คำถามเพื่อการทบทวน** 3-5 ข้อ

ภาษาชัดเจน เข้าใจง่ายสำหรับนักเรียนระดับ${level}`,

    summary: `สร้างบทสรุปบทเรียนสำหรับ:
**วิชา/หัวข้อ:** ${topic}
**ระดับ:** ${level}
**รายละเอียด:** ${details || 'ไม่มี'}

บทสรุปต้องมี:
1. **แนวคิดสำคัญ** (Key Concepts) - bullet points กระชับ
2. **สูตร/กฎ/หลักการสำคัญ** (ถ้ามี)
3. **คำศัพท์สำคัญ** พร้อมความหมายย่อ
4. **ตารางเปรียบเทียบ** (ถ้าเหมาะสม)
5. **ตัวอย่างสำคัญ**
6. **จุดที่ต้องระวัง/ข้อผิดพลาดที่พบบ่อย**
7. **แผนผังสรุป** (text-based)`,

    exercise: `สร้างแบบฝึกหัดสำหรับ:
**วิชา/หัวข้อ:** ${topic}
**ระดับ:** ${level}
**รายละเอียด:** ${details || 'ไม่มี'}

แบบฝึกหัดต้องมี:
1. ข้อสอบ **ระดับง่าย** 5-8 ข้อ (ฝึกพื้นฐาน)
2. ข้อสอบ **ระดับกลาง** 5-8 ข้อ (ประยุกต์)
3. ข้อสอบ **ระดับท้าทาย** 3-5 ข้อ (วิเคราะห์/สังเคราะห์)
4. **เฉลยและวิธีทำ** แบบละเอียด

ปริมาณข้อและรูปแบบตามที่ระบุใน: ${details || 'กำหนดตามความเหมาะสม'}`,

    slides: `สร้างโครงร่าง PowerPoint Presentation สำหรับ:
**วิชา/หัวข้อ:** ${topic}
**ระดับ:** ${level}
**รายละเอียด:** ${details || 'ไม่มี'}

โครงร่าง Slide ต้องมี:
1. **Slide 1: หน้าปก** (ชื่อเรื่อง, ชั้น, วันที่)
2. **Slide 2: จุดประสงค์การเรียนรู้**
3. **Slide 3-N: เนื้อหา** (แต่ละ slide มี: หัวข้อ, bullet points, คำแนะนำภาพ/สื่อ)
4. **Slide สรุป**: สาระสำคัญ
5. **Slide คำถาม**: Check for Understanding
6. **Slide References/แหล่งข้อมูล**

สำหรับแต่ละ slide: ระบุ [หัวข้อ Slide], [เนื้อหา], [ภาพ/กราฟิกที่ควรใส่], [หมายเหตุสำหรับผู้สอน]`,

    mindmap: `สร้าง Mind Map สำหรับ:
**วิชา/หัวข้อ:** ${topic}
**ระดับ:** ${level}
**รายละเอียด:** ${details || 'ไม่มี'}

## 🧠 MIND MAP: ${topic}

### แนวคิดกลาง (Central Idea)
**${topic}**

### กิ่งหลัก (Main Branches)
(สร้าง 5-7 กิ่งหลัก พร้อมกิ่งย่อย 3-5 กิ่งแต่ละกิ่งหลัก)

จัดรูปแบบแบบ hierarchical text:
🔵 กิ่งหลัก 1
  ├── กิ่งย่อย 1.1
  │   └── รายละเอียด
  ├── กิ่งย่อย 1.2
  └── กิ่งย่อย 1.3
🔴 กิ่งหลัก 2
  ├── ...

(ต่อไปเรื่อยๆ)

### 🔗 ความเชื่อมโยงข้ามกิ่ง
(อธิบายว่ากิ่งไหนเชื่อมกับกิ่งไหน)`,

    infographic: `สร้างโครงร่างสคริปต์ Infographic สำหรับ:
**วิชา/หัวข้อ:** ${topic}
**ระดับ:** ${level}
**รายละเอียด:** ${details || 'ไม่มี'}

## 📊 INFOGRAPHIC SCRIPT: ${topic}

### 🎨 ข้อมูลทั่วไป
- ชื่อ Infographic:
- ขนาดที่แนะนำ: A4 แนวตั้ง / Landscape
- สีหลัก (แนะนำ):
- ฟอนต์:

### 📐 Layout Structure
(อธิบายส่วนประกอบ + ตำแหน่ง + เนื้อหา ของแต่ละ section)

**Section 1 - Header:** (หัวข้อหลัก, subtitle)
**Section 2 - Key Stats:** (ตัวเลข/สถิติสำคัญ)
**Section 3-N - เนื้อหา:** (แต่ละส่วนมีอะไร)
**Section สุดท้าย - Footer:** (แหล่งข้อมูล, QR Code)

### 📝 เนื้อหาทั้งหมด
(ข้อความจริงที่จะใส่ใน infographic)

### 🖼️ ไอคอน/ภาพที่ควรใช้`,

    rubric: `สร้าง Rubric การประเมินสำหรับ:
**วิชา/หัวข้อ:** ${topic}
**ระดับ:** ${level}
**รายละเอียด:** ${details || 'ไม่มี'}

## 📏 RUBRIC การประเมิน: ${topic}

### ประเภทการประเมิน
(ระบุว่าประเมินอะไร: งานชิ้นงาน/การนำเสนอ/การทดลอง ฯลฯ)

### ตาราง Rubric (Holistic / Analytic)

| เกณฑ์ | ดีเยี่ยม (4) | ดี (3) | พอใช้ (2) | ต้องปรับปรุง (1) | น้ำหนัก |
|---|---|---|---|---|---|

(สร้าง 4-6 เกณฑ์ที่วัดได้จริง พร้อมคำอธิบายในแต่ละระดับ)

### คะแนนรวม
- คะแนนเต็ม: XX คะแนน
- เกณฑ์ผ่าน: XX%

### หมายเหตุสำหรับผู้ประเมิน`
  };

  const prompt = typePrompts[selectedMatType] || typePrompts.worksheet;

  try {
    const result = await callGemini(prompt, `คุณเป็นผู้เชี่ยวชาญด้านการสร้างสื่อการสอนสำหรับครูในประเทศไทย สร้างเนื้อหาที่ใช้งานได้จริง ครบถ้วน และเหมาะกับระดับชั้น ใช้ภาษาไทยที่ถูกต้องและชัดเจน`);
    showResult('mat-result', result, 'mat-actions');
    stats.materials++;
    saveStats();
    showToast(`สร้าง${typeLabels[selectedMatType] || 'สื่อการสอน'}สำเร็จ! 📚`, 'success');
  } catch (e) {
    showError('mat-result', e.message);
    showToast(e.message, 'error');
  } finally {
    setGenerating(btn, false);
  }
}

// ============================================================
// GAMES
// ============================================================
function selectGameType(el) {
  document.querySelectorAll('#gameTypeGrid .game-type').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  selectedGameType = el.dataset.type;
}

async function generateGame() {
  const topic = document.getElementById('game-topic').value.trim();
  const level = document.getElementById('game-level').value;
  const count = document.getElementById('game-count').value;
  const details = document.getElementById('game-details').value.trim();

  if (!topic) { showToast('กรุณากรอกวิชา/หัวข้อ', 'error'); return; }

  const btn = document.querySelector('#panel-games .btn-generate');
  setGenerating(btn, true);
  showLoading('game-result');

  const gamePrompts = {
    quiz: `สร้างเกม Quiz แบบแข่งขันสำหรับห้องเรียน:
**หัวข้อ:** ${topic}
**ระดับ:** ${level}
**จำนวนข้อ:** ${count} ข้อ
**รายละเอียด:** ${details || 'ไม่มี'}

## 🎮 เกม QUIZ: ${topic}

### 📋 วิธีเล่น
(อธิบายกฎ วิธีแบ่งทีม คะแนน เวลา)

### 🎯 วัตถุประสงค์เกม

### ❓ ข้อคำถาม (${count} ข้อ)
(แต่ละข้อมี: คำถาม, 4 ตัวเลือก A-D, เฉลย และคำอธิบาย)

**ข้อ 1:** [คำถาม]
- A) [ตัวเลือก]
- B) [ตัวเลือก]
- C) [ตัวเลือก]
- D) [ตัวเลือก]
✅ เฉลย: [ตัวอักษร] — [อธิบาย]

(ต่อไปจนครบ ${count} ข้อ)

### 🏆 ระบบคะแนน
### 🎁 รางวัล (ข้อเสนอแนะ)
### 💡 เคล็ดลับสำหรับครู`,

    matching: `สร้างเกมจับคู่ (Matching Game) สำหรับ:
**หัวข้อ:** ${topic}
**ระดับ:** ${level}
**จำนวนคู่:** ${count} คู่
**รายละเอียด:** ${details || 'ไม่มี'}

## 🔗 เกมจับคู่: ${topic}

### 📋 วิธีเล่น
(อธิบายกฎ รูปแบบการแข่งขัน คะแนน)

### 📝 ชุดการจับคู่

**ตัวอย่าง:**
| คอลัมน์ A | คอลัมน์ B |
|---|---|
| คำ/แนวคิด | ความหมาย/คู่ |

(สร้าง ${count} คู่ที่หลากหลาย ครอบคลุมเนื้อหา)

### ✅ เฉลยการจับคู่
| ลำดับ | คอลัมน์ A | คอลัมน์ B |
|---|---|---|

### 🃏 วิธีทำการ์ด
(คำแนะนำสำหรับครูในการทำสื่อ)
### 💡 การประยุกต์ใช้`,

    wordsearch: `สร้างเกมค้นหาคำ (Word Search) สำหรับ:
**หัวข้อ:** ${topic}
**ระดับ:** ${level}
**จำนวนคำ:** ${count} คำ

## 🔤 เกมค้นหาคำ: ${topic}

### 📝 รายการคำที่ต้องหา
(ระบุ ${count} คำสำคัญเกี่ยวกับหัวข้อ พร้อมความหมาย)

| ลำดับ | คำ | ความหมาย |
|---|---|---|

### 🔲 ตารางตัวอักษร
(สร้างตารางขนาด 15x15 ที่ซ่อนคำทั้งหมดไว้ในทิศทางต่างๆ)

(ใส่ตัวอักษรสุ่มในช่องว่าง ทำให้ดูเหมือนตารางจริง)

### ✅ เฉลย (ตำแหน่งของคำ)
### 📋 วิธีเล่นและกติกา`,

    bingo: `สร้างเกมบิงโกสำหรับ:
**หัวข้อ:** ${topic}
**ระดับ:** ${level}
**จำนวนคำ/แนวคิด:** ${count}

## 🎱 เกมบิงโก: ${topic}

### 📋 วิธีเล่น
(กติกา รูปแบบบิงโก วิธีชนะ)

### 📝 รายการคำ/แนวคิดทั้งหมด (สำหรับครูอ่าน)
(ระบุคำ ${count} คำ พร้อมคำอธิบาย/คำใบ้)

| ลำดับ | คำ/แนวคิด | คำอธิบายที่ครูจะอ่าน |
|---|---|---|

### 🃏 ตัวอย่างบัตรบิงโก 5x5
(สร้างตัวอย่างบัตร 2-3 ใบ ที่มีคำต่างกัน)

**บัตรที่ 1:**
| | | | | |
|---|---|---|---|---|
| | | | | |

### 💡 เคล็ดลับครู`,

    crossword: `สร้างปริศนาอักษรไขว้สำหรับ:
**หัวข้อ:** ${topic}
**ระดับ:** ${level}
**จำนวนคำ:** ${count} คำ

## ✏️ ปริศนาอักษรไขว้: ${topic}

### 📝 คำถามแนวนอน (Across)
(ระบุหมายเลข คำใบ้ และคำตอบ)

**1 ► [คำใบ้]** → คำตอบ: ______

### 📝 คำถามแนวตั้ง (Down)
(ระบุหมายเลข คำใบ้ และคำตอบ)

**1 ▼ [คำใบ้]** → คำตอบ: ______

### 🔲 ตารางปริศนา
(สร้างตารางที่แสดงตำแหน่งตัวอักษรและช่องดำ)

### ✅ เฉลย
### 📋 วิธีเล่น`,

    roleplay: `สร้าง Role Play Activity สำหรับ:
**หัวข้อ:** ${topic}
**ระดับ:** ${level}
**จำนวนบทบาท/ฉาก:** ${count}
**รายละเอียด:** ${details || 'ไม่มี'}

## 🎭 Role Play: ${topic}

### 🎯 วัตถุประสงค์

### 🌍 บริบทของสถานการณ์
(อธิบายฉาก เวลา สถานที่ บรรยากาศ)

### 👥 บทบาทต่างๆ
(อธิบายแต่ละ role: ชื่อบทบาท, บุคลิก, เป้าหมาย, ข้อมูลที่มี)

**บทบาทที่ 1:** [ชื่อ]
- บุคลิกภาพ:
- เป้าหมาย:
- ข้อมูล/script:

### 📜 บทสนทนาเริ่มต้น (Starter Script)

### 🎯 Task / ภารกิจ
(สิ่งที่นักเรียนต้องทำหรือแก้ปัญหา)

### ⏱️ Timeline
### 📊 เกณฑ์การประเมิน
### 💡 เคล็ดลับสำหรับครู`,

    sorting: `สร้างเกมเรียงลำดับ (Sorting/Sequencing Game) สำหรับ:
**หัวข้อ:** ${topic}
**ระดับ:** ${level}
**จำนวนชุด:** ${count} ชุด
**รายละเอียด:** ${details || 'ไม่มี'}

## 🔢 เกมเรียงลำดับ: ${topic}

### 📋 วิธีเล่น

### 🃏 ชุดการเรียงลำดับ
(แต่ละชุดมีการ์ด 4-8 ใบที่ต้องเรียงลำดับให้ถูกต้อง)

**ชุดที่ 1:** [ชื่อชุด]
- การ์ดที่ 1: [เนื้อหา]
- การ์ดที่ 2: [เนื้อหา]
...
✅ ลำดับที่ถูกต้อง: 1→2→... พร้อมอธิบายเหตุผล

(ทำต่อจนครบ ${count} ชุด)

### 💡 การประยุกต์`,

    scenario: `สร้าง Escape Room ในห้องเรียนสำหรับ:
**หัวข้อ:** ${topic}
**ระดับ:** ${level}
**จำนวนด่าน/ปริศนา:** ${count} ด่าน
**รายละเอียด:** ${details || 'ไม่มี'}

## 🌟 CLASSROOM ESCAPE ROOM: ${topic}

### 📖 เรื่องราว (Story)
(สร้างเรื่องราวที่น่าตื่นเต้นสอดคล้องกับเนื้อหา)

### 🎯 ภารกิจ (Mission)
(นักเรียนต้องทำอะไร เป้าหมายคืออะไร)

### 🔒 ด่านและปริศนา (${count} ด่าน)
(แต่ละด่านมี: ชื่อด่าน, เนื้อหาที่ทดสอบ, ปริศนา/ภารกิจ, เฉลย/รหัส)

**ด่านที่ 1:** [ชื่อ]
- เนื้อหาที่ทดสอบ:
- ปริศนา:
- เฉลย/รหัส:
- เชื่อมกับด่านถัดไปอย่างไร:

### 🏆 รางวัล
### ⏱️ เวลา (แนะนำ)
### 📋 การเตรียมห้องเรียน
### 💡 เคล็ดลับครู`
  };

  const prompt = gamePrompts[selectedGameType] || gamePrompts.quiz;

  try {
    const result = await callGemini(prompt, `คุณเป็นผู้เชี่ยวชาญด้านการสร้างเกมเพื่อการศึกษา (Educational Game Designer) สร้างเกมที่สนุก มีส่วนร่วม และช่วยให้นักเรียนเรียนรู้เนื้อหาได้จริง ใช้ภาษาไทยที่ชัดเจน`);
    showResult('game-result', result, 'game-actions');
    stats.games++;
    saveStats();
    showToast('สร้างเกมการสอนสำเร็จ! 🎮', 'success');
  } catch (e) {
    showError('game-result', e.message);
    showToast(e.message, 'error');
  } finally {
    setGenerating(btn, false);
  }
}

// ============================================================
// ASSESSMENT
// ============================================================
function selectDiff(el) {
  document.querySelectorAll('#diffGroup .diff-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  selectedDiff = el.textContent.trim();
}

async function generateAssessment() {
  const topic = document.getElementById('ass-topic').value.trim();
  const level = document.getElementById('ass-level').value;
  const count = document.getElementById('ass-count').value;
  const focus = document.getElementById('ass-focus').value.trim();
  const showAnswer = document.getElementById('ass-answer').checked;

  if (!topic) { showToast('กรุณากรอกวิชา/หัวข้อ', 'error'); return; }

  const types = [...document.querySelectorAll('#panel-assessment .assess-type-item input:checked')]
    .map(cb => cb.value);
  if (types.length === 0) { showToast('กรุณาเลือกรูปแบบข้อสอบอย่างน้อย 1 ประเภท', 'error'); return; }

  const btn = document.querySelector('#panel-assessment .btn-generate');
  setGenerating(btn, true);
  showLoading('ass-result');

  const typesStr = types.join(', ');
  const perType = Math.ceil(parseInt(count) / types.length);

  const prompt = `สร้างแบบทดสอบมาตรฐานสำหรับ:

**วิชา/หัวข้อ:** ${topic}
**ระดับชั้น:** ${level}
**จำนวนข้อรวม:** ${count} ข้อ
**รูปแบบข้อสอบ:** ${typesStr}
**ระดับความยาก:** ${selectedDiff}
**เนื้อหาที่เน้น:** ${focus || 'ครอบคลุมทุกเนื้อหาหลัก'}
**แสดงเฉลย:** ${showAnswer ? 'ใช่' : 'ไม่'}

## 📝 แบบทดสอบ: ${topic}

**วิชา:** ${topic} | **ระดับชั้น:** ${level}
**คะแนนเต็ม:** ${count} คะแนน | **เวลา:** ${Math.ceil(parseInt(count) * 1.5)} นาที

**ชื่อ-นามสกุล:** _____________________________ **ชั้น:** _____ **เลขที่:** _____ **วันที่:** _______

---

${types.map(type => {
  const num = Math.ceil(parseInt(count) / types.length);
  return generateTypePrompt(type, num, topic, level, selectedDiff);
}).join('\n\n')}

${showAnswer ? `
---

## 🔑 เฉลยแบบทดสอบ

(ให้เฉลยพร้อมอธิบายเหตุผลสำหรับทุกข้อ)

### เกณฑ์การให้คะแนน
| คะแนน | ระดับ |
|---|---|
| ${Math.round(count * 0.8)}-${count} | ดีมาก |
| ${Math.round(count * 0.6)}-${Math.round(count * 0.79)} | ดี |
| ${Math.round(count * 0.5)}-${Math.round(count * 0.59)} | พอใช้ |
| 0-${Math.round(count * 0.49)} | ต้องปรับปรุง |
` : ''}

ใช้ภาษาไทยที่ถูกต้อง ชัดเจน เหมาะกับระดับ${level} ข้อสอบต้องวัดได้จริง`;

  try {
    const result = await callGemini(prompt, `คุณเป็นผู้เชี่ยวชาญด้านการสร้างแบบทดสอบและการวัดผลประเมินผลทางการศึกษาในประเทศไทย สร้างข้อสอบที่ถูกต้อง ครอบคลุม วัดได้จริง และตรงกับระดับชั้น ใช้ภาษาไทยราชการที่ถูกต้อง`);
    showResult('ass-result', result, 'ass-actions');
    stats.tests++;
    saveStats();
    showToast('สร้างแบบทดสอบสำเร็จ! 📝', 'success');
  } catch (e) {
    showError('ass-result', e.message);
    showToast(e.message, 'error');
  } finally {
    setGenerating(btn, false);
  }
}

function generateTypePrompt(type, num, topic, level, diff) {
  const typeMap = {
    'ปรนัย 4 ตัวเลือก': `### ตอนที่: ปรนัย (${num} ข้อ)
**คำชี้แจง:** เลือกคำตอบที่ถูกต้องที่สุดเพียงข้อเดียว (ข้อละ 1 คะแนน)

(สร้าง ${num} ข้อ แต่ละข้อมี 4 ตัวเลือก ก-ง ระดับ${diff})
**ข้อ 1.** [คำถาม]
   ก. [ตัวเลือก]   ข. [ตัวเลือก]   ค. [ตัวเลือก]   ง. [ตัวเลือก]`,

    'ถูกหรือผิด': `### ตอนที่: ถูกหรือผิด (${num} ข้อ)
**คำชี้แจง:** พิจารณาว่าข้อความต่อไปนี้ถูกหรือผิด เขียน ✓ หน้าข้อความที่ถูก และ ✗ หน้าข้อความที่ผิด

(สร้าง ${num} ข้อ ระดับ${diff})
_____ 1. [ข้อความ]`,

    'เติมคำในช่องว่าง': `### ตอนที่: เติมคำในช่องว่าง (${num} ข้อ)
**คำชี้แจง:** เติมคำหรือข้อความในช่องว่างให้สมบูรณ์ถูกต้อง

(สร้าง ${num} ข้อ ระดับ${diff})
1. [ประโยคที่มีช่องว่าง ___________]`,

    'จับคู่': `### ตอนที่: จับคู่ (${num} คู่)
**คำชี้แจง:** จับคู่คำในคอลัมน์ซ้ายกับความหมายในคอลัมน์ขวา

| คอลัมน์ ก | | คอลัมน์ ข |
|---|---|---|
| 1. [คำ] | ก. | [ความหมาย] |
(สร้างจนครบ ${num} คู่ ระดับ${diff})`,

    'ตอบสั้น': `### ตอนที่: ตอบสั้น (${num} ข้อ)
**คำชี้แจง:** ตอบคำถามให้สั้น กระชับ และถูกต้อง

(สร้าง ${num} ข้อ ระดับ${diff})
1. [คำถาม]
   ตอบ: .............................`,

    'อัตนัย': `### ตอนที่: อัตนัย (${num} ข้อ)
**คำชี้แจง:** อธิบายหรือตอบคำถามต่อไปนี้ให้ครบถ้วนสมบูรณ์

(สร้าง ${num} ข้อ ระดับ${diff} พร้อมบอกคะแนนแต่ละข้อ)
1. [คำถาม] (____คะแนน)
   ตอบ: ...(เว้นที่ว่างสำหรับตอบ)...`
  };
  return typeMap[type] || '';
}

// ============================================================
// CHAT
// ============================================================
function setupChatInput() {
  const input = document.getElementById('chatInput');
  if (!input) return;
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });
}

function useSuggestion(el) {
  const input = document.getElementById('chatInput');
  if (input) { input.value = el.textContent; input.focus(); }
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
}

function addChatMessage(role, text, isTyping = false) {
  const area = document.getElementById('chatMessages');
  if (!area) return null;

  const div = document.createElement('div');
  div.className = `chat-msg ${role === 'user' ? 'user-msg' : 'ai-msg'}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'user' ? '👩‍🏫' : '🤖';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  if (isTyping) {
    bubble.innerHTML = `<div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>`;
  } else if (role === 'user') {
    bubble.textContent = text;
  } else {
    bubble.innerHTML = marked.parse(text);
  }

  div.appendChild(avatar);
  div.appendChild(bubble);
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
  return div;
}

async function sendChat() {
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  const text = input?.value?.trim();
  if (!text || sendBtn?.disabled) return;

  if (!apiKey) { openSettings(); return; }

  input.value = '';
  input.style.height = 'auto';

  // Add user message
  addChatMessage('user', text);

  // Add to history
  chatHistory.push({ role: 'user', parts: [{ text }] });

  // Disable send btn
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;margin:0"></div>';
  }

  // Show typing indicator
  const typingEl = addChatMessage('ai', '', true);

  try {
    const response = await callGeminiChat(chatHistory);

    // Remove typing indicator
    typingEl?.remove();

    // Add AI message
    addChatMessage('ai', response);

    // Add to history
    chatHistory.push({ role: 'model', parts: [{ text: response }] });

    // Limit history to last 20 messages
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

    // Save
    storage.set('ata_chat', JSON.stringify(chatHistory));

  } catch (e) {
    typingEl?.remove();
    addChatMessage('ai', `⚠️ เกิดข้อผิดพลาด: ${e.message}\n\nกรุณาลองใหม่อีกครั้ง`);
    showToast(e.message, 'error');
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
    }
    document.getElementById('chatMessages')?.scrollTo(0, document.getElementById('chatMessages').scrollHeight);
  }
}

function clearChat() {
  if (!confirm('ต้องการล้างประวัติการสนทนาทั้งหมด?')) return;
  chatHistory = [];
  storage.remove('ata_chat');
  const area = document.getElementById('chatMessages');
  if (area) {
    area.innerHTML = `<div class="chat-msg ai-msg">
      <div class="msg-avatar">🤖</div>
      <div class="msg-bubble">
        <p><strong>สวัสดีครับ! เริ่มการสนทนาใหม่ได้เลยครับ 🎓</strong></p>
      </div>
    </div>`;
  }
  showToast('ล้างประวัติการสนทนาแล้ว', 'info');
}

function restoreChat() {
  if (chatHistory.length === 0) return;
  const area = document.getElementById('chatMessages');
  if (!area) return;

  // Clear default welcome message
  area.innerHTML = '';

  // Restore last 10 messages
  const recentHistory = chatHistory.slice(-10);
  recentHistory.forEach(msg => {
    if (msg.role === 'user') {
      addChatMessage('user', msg.parts[0].text);
    } else {
      addChatMessage('ai', msg.parts[0].text);
    }
  });
}

// ============================================================
// UTILITIES
// ============================================================
function printOutput(boxId) {
  const box = document.getElementById(boxId);
  if (!box || box.querySelector('.empty-state') || box.querySelector('.loading-wrap')) {
    showToast('ไม่มีเนื้อหาสำหรับพิมพ์', 'error'); return;
  }

  const content = box.innerHTML;
  const printWin = window.open('', '_blank');
  printWin.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>AI Teacher Assistant</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  body { font-family: 'Sarabun', sans-serif; font-size: 13px; line-height: 1.8; color: #111; padding: 20px 30px; max-width: 800px; margin: 0 auto; }
  h1 { font-size: 18px; border-bottom: 2px solid #333; padding-bottom: 8px; }
  h2 { font-size: 15px; color: #333; margin: 14px 0 6px; border-left: 3px solid #7C3AED; padding-left: 8px; }
  h3 { font-size: 13px; font-weight: 700; margin: 10px 0 4px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
  th { background: #f0f0f0; padding: 7px 10px; border: 1px solid #ccc; text-align: left; font-weight: 700; }
  td { padding: 6px 10px; border: 1px solid #ddd; }
  ul, ol { padding-left: 18px; }
  li { margin-bottom: 2px; }
  code { background: #f5f5f5; padding: 1px 4px; border-radius: 3px; font-size: 11px; }
  pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
  blockquote { border-left: 3px solid #ccc; padding: 6px 12px; background: #f9f9f9; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<div style="text-align:right;font-size:11px;color:#999;margin-bottom:12px">
  พิมพ์โดย AI Teacher Assistant • ${new Date().toLocaleDateString('th-TH')}
</div>
${content}
</body></html>`);
  printWin.document.close();
  printWin.onload = () => { printWin.print(); };
}

function copyOutput(boxId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  const text = box.innerText;
  if (!text.trim() || box.querySelector('.empty-state')) {
    showToast('ไม่มีเนื้อหาสำหรับคัดลอก', 'error'); return;
  }
  navigator.clipboard.writeText(text).then(() => {
    showToast('คัดลอกเนื้อหาสำเร็จ!', 'success');
  }).catch(() => {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('คัดลอกเนื้อหาสำเร็จ!', 'success');
  });
}

// ============================================================
// TOAST
// ============================================================
let toastTimer;
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  const icon = document.getElementById('toastIcon');
  const msgEl = document.getElementById('toastMsg');
  if (!toast) return;

  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
  toast.className = `toast ${type}`;
  icon.className = `fas ${icons[type] || icons.info}`;
  msgEl.textContent = msg;

  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

// Close modal on backdrop click
document.addEventListener('click', (e) => {
  if (e.target.id === 'apiModal') {
    if (apiKey) document.getElementById('apiModal').classList.remove('active');
  }
});

// Keyboard shortcut: Escape to close modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('apiModal');
    if (modal?.classList.contains('active') && apiKey) {
      modal.classList.remove('active');
    }
  }
});
