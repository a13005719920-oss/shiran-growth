/* ===== 冉冉成长计划 V3.0 SaaS 完整版 ===== */

// ===== Constants =====
const POINTS = { A: 10, B: 15, C: 20 };
const BONUS_STREAK7 = 50;
const BONUS_FULL_DAY = 30;

const BADGES_DEF = [
  { id: 'first_step', icon: '👣', name: '第一步', desc: '完成第一个任务', cond: s => s.totalDone >= 1 },
  { id: 'day10', icon: '📅', name: '坚持10天', desc: '打卡10天', cond: s => s.activeDays >= 10 },
  { id: 'day30', icon: '🌟', name: '坚持30天', desc: '打卡30天', cond: s => s.activeDays >= 30 },
  { id: 'streak7', icon: '🔥', name: '一周不断', desc: '连续7天打卡', cond: s => s.maxStreak >= 7 },
  { id: 'streak21', icon: '⚡', name: '习惯养成', desc: '连续21天打卡', cond: s => s.maxStreak >= 21 },
  { id: 'streak56', icon: '👑', name: '全程坚持', desc: '连续56天打卡', cond: s => s.maxStreak >= 56 },
  { id: 'points100', icon: '💯', name: '百分勇士', desc: '累计100积分', cond: s => s.points >= 100 },
  { id: 'points500', icon: '💎', name: '积分达人', desc: '累计500积分', cond: s => s.points >= 500 },
  { id: 'points1000', icon: '🏆', name: '积分王者', desc: '累计1000积分', cond: s => s.points >= 1000 },
  { id: 'week1', icon: '1️⃣', name: '第一周', desc: '完成W1全部A任务', cond: s => s.weeksComplete[1] },
  { id: 'week4', icon: '🎯', name: '半月达人', desc: '完成W1-W4全部A任务', cond: s => s.weeksComplete[1] && s.weeksComplete[2] && s.weeksComplete[3] && s.weeksComplete[4] },
  { id: 'week8', icon: '🎓', name: '阶段毕业', desc: '完成全部8周A任务', cond: s => [1,2,3,4,5,6,7,8].every(w => s.weeksComplete[w]) },
  { id: 'perfect_day', icon: '✨', name: '完美一天', desc: '一天全部任务完成', cond: s => s.perfectDays >= 1 },
  { id: 'perfect_week', icon: '🌈', name: '完美一周', desc: '一周每天全勤', cond: s => s.perfectWeeks >= 1 },
  { id: 'reader', icon: '📚', name: '阅读之星', desc: '完成50个阅读任务', cond: s => (s.moduleDone['阅读'] || 0) >= 50 },
  { id: 'math_whiz', icon: '🧮', name: '数学小能手', desc: '完成50个数学任务', cond: s => (s.moduleDone['数学'] || 0) >= 50 },
  { id: 'english_star', icon: '🇬🇧', name: '英语之星', desc: '完成50个英语任务', cond: s => (s.moduleDone['英语'] || 0) >= 50 },
  { id: 'independent', icon: '🎒', name: '自主达人', desc: '完成40个自主整理任务', cond: s => (s.moduleDone['自主整理'] || 0) >= 40 },
];

const DEFAULT_REWARDS = [
  { id: 'r1', icon: '📺', name: '看一集动画片', cost: 30 },
  { id: 'r2', icon: '🍦', name: '吃一个冰淇淋', cost: 50 },
  { id: 'r3', icon: '🎮', name: '玩30分钟游戏', cost: 80 },
  { id: 'r4', icon: '🎁', name: '选一个小玩具', cost: 200 },
  { id: 'r5', icon: '🎢', name: '周末去游乐园', cost: 500 },
];

const DEFAULT_CHILD = {
  id: 'shiran', name: '冉冉', avatar: '👧', grade: '一年级',
  points: 0, streak: 0, maxStreak: 0, lastDate: null,
  tasks: {}, records: {}, reviews: {}, health: {},
  rewards: [...DEFAULT_REWARDS],
  earnedBadges: [], pointsHistory: [],
  dayMode: 'normal',
  childModeOn: false,
  totalDone: 0, activeDays: 0, perfectDays: 0, perfectWeeks: 0,
  weeksComplete: {}, moduleDone: {},
};

const STORE_KEY = 'shiran_growth_v3';

// ===== State =====
let app = loadApp();
// 一次性迁移：老版本把默认档案的姓名写死在源码里，浏览器里已经存下来的数据还是旧名字。
// 只改默认档案（id === DEFAULT_CHILD.id），不动用户自己添加的孩子；只执行一次。
function migrateDefaultChildName(a) {
  if (a.nameMigratedV1) return false;
  a.nameMigratedV1 = true;
  const c = a.children && a.children[DEFAULT_CHILD.id];
  if (c && c.name !== DEFAULT_CHILD.name) { c.name = DEFAULT_CHILD.name; return true; }
  return false;
}
if (migrateDefaultChildName(app)) saveApp();
let currentWeek = getCurrentWeekNum();
let currentDay = 0;

function loadApp() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY));
    if (raw && raw.children) return raw;
  } catch {}
  return { version: 3, activeChild: 'shiran', children: { shiran: { ...DEFAULT_CHILD } } };
}
let saveWarned = false;
function saveApp() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(app));
  } catch (e) {
    // 隐私模式 / 存储被禁用 / 空间满时 localStorage 会抛错。
    // 不能让打卡流程崩掉，但必须明确提醒一次：进度只存在内存里，刷新会丢。
    if (!saveWarned) {
      saveWarned = true;
      try { showToast('⚠️ 本机存储不可用，进度可能保存不了'); } catch {}
    }
  }
  // 云端同步（防抖推送）
  if (typeof pushToCloud === 'function') pushToCloud(app);
}
function child() { return app.children[app.activeChild] || app.children[Object.keys(app.children)[0]]; }
function s() { return child(); }

// ===== 积分流水（唯一入口）=====
// 规则：任何积分变动都必须走下面两个函数，保证「总积分 === 积分流水之和」。
// 1) 不再把积分截断为 0（截断会让余额和流水对不上，跳过/撤销后无法精确退回）。
// 2) 不再丢弃历史记录（旧代码在超过 100 条时截断，同时会让总额与流水错开）。
// 3) 每条流水都带 key（如 task:0-1-2 / skip:0-1-2），撤销和取消跳过按 key 精确匹配。
//    注意：计划表里存在大量同名同分值的任务，按标题匹配会误删别的记录，所以必须用 key。
function addPoints(c, delta, text, key) {
  delta = Math.round(delta);
  c.points = (c.points || 0) + delta;
  const rec = { time: Date.now(), text: text, points: (delta >= 0 ? '+' : '-') + Math.abs(delta) };
  if (key) rec.key = key;
  c.pointsHistory.unshift(rec);
  return rec;
}

// 删除匹配的流水，并把该条流水里记录的分数等额退/扣回去（+10 → 扣10；-5 → 退5）。
// 带 key 的流水按 key 精确匹配；旧数据没有 key 时用 fallback(记录) 兜底，
// 且兜底最多删「最近一条」——同名同分值的旧记录不能被一次清空，否则会多退分。
// 返回对余额的实际影响（正数=退回加分，负数=撤销扣分，0=没找到）。
function revertPoints(c, key, fallback) {
  if (!key && !fallback) return 0;
  let delta = 0, fallbackUsed = false;
  for (let i = c.pointsHistory.length - 1; i >= 0; i--) {
    const h = c.pointsHistory[i];
    const byKey = !!(key && h.key === key);
    const byFallback = !!(fallback && !h.key && !fallbackUsed && fallback(h));
    if (!byKey && !byFallback) continue;
    if (byFallback) fallbackUsed = true;
    const v = parseInt(h.points, 10) || 0;
    c.points -= v;
    c.pointsHistory.splice(i, 1);
    delta -= v;
  }
  return delta;
}

function dKey(wi, di) { return `${wi}-${di}`; }
function hasRecord(c, key) { return !!key && c.pointsHistory.some(h => h.key === key); }
// 同一毫秒内连续两次同类操作（例如连点兑换）会撞出相同的 Date.now()，
// 所以流水 key 统一带上自增序号，保证 key 唯一。
let pointsSeq = 0;
function pointsUid() { return Date.now() + '-' + (++pointsSeq); }
// 自检：总积分是否等于流水之和（用于测试与排查，不修改数据）
function pointsConsistent(c) {
  const sum = (c.pointsHistory || []).reduce((t, h) => t + (parseInt(h.points, 10) || 0), 0);
  return { ok: sum === (c.points || 0), points: c.points || 0, sum: sum, diff: (c.points || 0) - sum };
}

// ===== Task helpers =====
function tKey(wi, di, ti) { return `${wi}-${di}-${ti}`; }
function isDone(wi, di, ti) { return !!s().tasks[tKey(wi, di, ti)]; }

function toggleTask(wi, di, ti) {
  const c = s();
  const k = tKey(wi, di, ti);
  const was = !!c.tasks[k];
  c.tasks[k] = !was;
  const task = PLAN.weeks[wi].days[di].tasks[ti];
  const pts = POINTS[task.level] || 10;
  if (c.tasks[k]) {
    // award points（带 key，撤销时能精确找到这一条）
    addPoints(c, pts, `完成 ${task.module}·${task.title.slice(0,15)}`, 'task:' + k);
    checkStreak();
    // float animation
    floatPoints(pts);
    // check perfect day
    const day = PLAN.weeks[wi].days[di];
    const allDone = day.tasks.every((_, t2) => c.tasks[tKey(wi, di, t2)]);
    if (allDone && !hasRecord(c, 'allin:' + dKey(wi, di))) {
      c.perfectDays = (c.perfectDays || 0) + 1;
      addPoints(c, BONUS_FULL_DAY, '全勤完成一天！', 'allin:' + dKey(wi, di));
      setTimeout(() => celebrate('🎉', '完美一天！', `今天全部完成！\n额外奖励 +${BONUS_FULL_DAY} 积分`, BONUS_FULL_DAY), 200);
    }
    // streak bonus：同一轮连续天数只发一次，避免当天每打一个勾都发一遍
    if (c.streak > 0 && c.streak % 7 === 0 && !hasRecord(c, 'streak:' + c.streak)) {
      addPoints(c, BONUS_STREAK7, `连续${c.streak}天！`, 'streak:' + c.streak);
      setTimeout(() => celebrate('🔥', `${c.streak}天连续打卡！`, `坚持就是胜利！\n额外奖励 +${BONUS_STREAK7} 积分`, BONUS_STREAK7), 1200);
    }
    // update module counts
    c.moduleDone[task.module] = (c.moduleDone[task.module] || 0) + 1;
    c.totalDone++;
  } else {
    // undo：按 key 精确删除这一次完成的积分记录，并等额扣回（旧数据无 key 时按标题+分值兜底）
    revertPoints(c, 'task:' + k, h => h.points === `+${pts}` && h.text.includes(`完成 ${task.module}·${task.title.slice(0,12)}`));
    c.totalDone = Math.max(0, c.totalDone - 1);
    c.moduleDone[task.module] = Math.max(0, (c.moduleDone[task.module] || 0) - 1);
    // 撤销后当天不再全勤 → 同时撤销“全勤完成一天”奖励，避免反复撤销/重打重复领奖
    const day = PLAN.weeks[wi].days[di];
    const stillAllDone = day.tasks.every((_, t2) => c.tasks[tKey(wi, di, t2)]);
    if (!stillAllDone && revertPoints(c, 'allin:' + dKey(wi, di), null) !== 0) {
      c.perfectDays = Math.max(0, (c.perfectDays || 0) - 1);
    }
  }
  // update max streak
  c.maxStreak = Math.max(c.maxStreak || 0, c.streak);
  checkBadges();
  saveApp();
}

function checkStreak() {
  const c = s();
  const t = new Date().toISOString().slice(0, 10);
  if (c.lastDate !== t) {
    const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    c.streak = (c.lastDate === y) ? c.streak + 1 : 1;
    c.lastDate = t;
    c.activeDays = (c.activeDays || 0) + 1;
  }
}

function checkBadges() {
  const c = s();
  c.earnedBadges = c.earnedBadges || [];
  BADGES_DEF.forEach(b => {
    if (!c.earnedBadges.includes(b.id) && b.cond(c)) {
      c.earnedBadges.push(b.id);
      addPoints(c, 30, `获得勋章「${b.name}」`, 'badge:' + b.id);
      setTimeout(() => showToast(`🎖️ 获得勋章：${b.name}！+30积分`), 800);
    }
  });
}

// ===== Week/Day calc =====
function getCurrentWeekNum() {
  const start = new Date(PLAN.startDate);
  const d = Math.floor((new Date() - start) / 86400000);
  return Math.max(1, Math.min(PLAN.totalWeeks, Math.floor(d / 7) + 1));
}
function getCurrentDayIdx() {
  const start = new Date(PLAN.startDate);
  const d = Math.floor((new Date() - start) / 86400000);
  return ((d % 7) + 7) % 7;
}

// ===== Day Mode =====
function setMode(mode, btn) {
  s().dayMode = mode;
  saveApp();
  document.querySelectorAll('.mode-toggle button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const modeMap = { normal: '正常', busy: '忙碌（保留A B减半 C取消）', rest: '休息（只做A）' };
  const cm = document.getElementById('curMode');
  if (cm) cm.textContent = modeMap[mode];
  renderHome();
  showToast(mode === 'normal' ? '正常模式' : mode === 'busy' ? '忙碌模式：C级已隐藏' : '休息模式：只显示A级');
}

function shouldShowTask(task) {
  const mode = s().dayMode || 'normal';
  if (mode === 'normal') return true;
  if (mode === 'rest') return task.level === 'A';
  if (mode === 'busy') return task.level === 'A' || task.level === 'B';
  return true;
}

// ===== Rendering: Home =====
function renderHome() {
  const c = s();
  // Ring
  let total = 0, done = 0;
  PLAN.weeks.forEach((w, wi) => w.days.forEach((d, di) => {
    total += d.tasks.length; d.tasks.forEach((_, ti) => { if (isDone(wi, di, ti)) done++; });
  }));
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  const C = 2 * Math.PI * 30;
  const ringFg = document.getElementById('ringFg');
  if (ringFg) { ringFg.style.strokeDasharray = C; ringFg.style.strokeDashoffset = C * (1 - pct / 100); }
  const rp = document.getElementById('ringPct'); if (rp) rp.textContent = pct + '%';
  const tp = document.getElementById('totalProg'); if (tp) tp.textContent = `${done} / ${total}`;
  const td = document.getElementById('totalDet');
  if (td) td.textContent = pct === 0 ? '开始打卡吧！' : pct < 25 ? '稳步推进中' : pct < 50 ? '保持节奏！' : pct < 75 ? '过半了，加油！' : pct < 100 ? '冲刺阶段！' : '🎉 全部完成！';

  // Streak
  const sb = document.getElementById('streakBadge'); if (sb) sb.textContent = `🔥${c.streak || 0}`;

  // Top name
  const tn = document.getElementById('topName'); if (tn) tn.textContent = `${c.name}的成长计划`;
  const ts = document.getElementById('topSub'); if (ts) ts.textContent = `第一阶段·8周 · ${c.grade}`;
  const av = document.getElementById('avatar'); if (av) av.textContent = c.avatar;

  // Mode toggle state
  document.querySelectorAll('.mode-toggle button').forEach((b, i) => {
    b.classList.toggle('active', ['normal', 'busy', 'rest'][i] === (c.dayMode || 'normal'));
  });

  // Week nav
  const wn = document.getElementById('weekNav');
  if (!wn) return;
  wn.innerHTML = '';
  PLAN.weeks.forEach((w, i) => {
    const tab = document.createElement('div');
    tab.className = 'w-tab' + (i === currentWeek - 1 ? ' active' : '');
    tab.innerHTML = `<div class="wn">W${w.weekNum}</div><div class="wt">${w.theme}</div>`;
    tab.onclick = () => { currentWeek = i + 1; currentDay = 0; renderHome(); };
    wn.appendChild(tab);
  });

  const week = PLAN.weeks[currentWeek - 1];
  if (!week) return;
  const todayIdx = (currentWeek === getCurrentWeekNum()) ? getCurrentDayIdx() : -1;
  if (currentDay === 0 && todayIdx >= 0) currentDay = todayIdx;

  // Day tabs
  const dt = document.getElementById('dayTabs');
  dt.innerHTML = '';
  week.days.forEach((day, di) => {
    const t = document.createElement('div');
    t.className = 'd-tab' + (di === currentDay ? ' active' : '');
    const dStr = day.date ? day.date.slice(5).replace('-', '/') : '';
    // dot if not all done
    const visibleTasks = day.tasks.filter(shouldShowTask);
    const anyUndone = visibleTasks.some((tk) => !isDone(currentWeek - 1, di, day.tasks.indexOf(tk)));
    if (anyUndone) t.classList.add('has-dot');
    t.innerHTML = `Day ${di + 1}<span class="dd"> ${dStr}</span>`;
    if (anyUndone) { const dot = document.createElement('span'); dot.className = 'ddot'; dot.style.cssText = 'position:absolute;top:3px;right:3px;width:6px;height:6px;border-radius:50%;background:var(--red)'; t.appendChild(dot); }
    t.onclick = () => { currentDay = di; renderHome(); };
    dt.appendChild(t);
  });

  // Day content
  const dc = document.getElementById('dayContent');
  dc.innerHTML = '';
  const day = week.days[currentDay];
  if (!day) return;

  // Health inputs
  const hKey = `${currentWeek - 1}-${currentDay}`;
  const health = c.health[hKey] || {};
  const todayLabel = (currentDay === todayIdx) ? '📍 ' : '';
  const dDate = day.date ? day.date.slice(5).replace('-', '/') : '';

  const visibleTasks = day.tasks.filter(shouldShowTask);
  const dayDone = visibleTasks.filter((tk) => {
    const origIdx = day.tasks.indexOf(tk);
    return isDone(currentWeek - 1, currentDay, origIdx);
  }).length;

  const hdr = document.createElement('div');
  hdr.className = 'dh';
  hdr.innerHTML = `<div><span class="dl">${todayLabel}${day.label || 'Day ' + (currentDay + 1)}</span><span class="dte"> ${dDate}${currentDay === todayIdx ? ' · 今天' : ''}</span></div><span class="dp">${dayDone}/${visibleTasks.length}</span>`;
  dc.appendChild(hdr);

  // Health row
  const hr = document.createElement('div');
  hr.className = 'health-row';
  hr.innerHTML = `
    <div class="health-input">
      <div class="hi-icon">🏃</div>
      <div class="hi-label">运动</div>
      <input type="number" min="0" max="300" value="${health.exercise || ''}" placeholder="—" onchange="saveHealth('${hKey}','exercise',this.value)">
      <div class="hi-unit">分钟</div>
    </div>
    <div class="health-input">
      <div class="hi-icon">😴</div>
      <div class="hi-label">睡眠</div>
      <input type="number" min="0" max="14" step="0.5" value="${health.sleep || ''}" placeholder="—" onchange="saveHealth('${hKey}','sleep',this.value)">
      <div class="hi-unit">小时</div>
    </div>`;
  dc.appendChild(hr);

  // Task cards
  day.tasks.forEach((task, ti) => {
    if (!shouldShowTask(task)) return;
    const done = isDone(currentWeek - 1, currentDay, ti);
    const mod = PLAN.modules[task.module] || { color: '#666', icon: '📌' };
    const hasDetail = task.detail && task.detail.length > 0;
    const hasTip = task.parentTip && task.parentTip.length > 0 && task.parentTip !== '—';
    const hasRecord = task.recordLabel && task.recordLabel.length > 0 && task.recordLabel !== '—';
    const rKey = `${currentWeek - 1}-${currentDay}-${ti}-rec`;
    const savedRec = c.records[rKey] || '';

    const card = document.createElement('div');
    card.className = 'tc' + (done ? ' done' : '') + (done ? ' collapsed' : '');
    card.id = `tc-${currentWeek - 1}-${currentDay}-${ti}`;
    let inner = `
      <div class="ck" onclick="event.stopPropagation();toggleAndRender(${currentWeek - 1},${currentDay},${ti})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg></div>
      <div class="tb-body">
        <div class="tb-top">
          <span class="mt" style="background:${mod.color}20;color:${mod.color}">${mod.icon} ${task.module}</span>
          <span class="lt ${task.level}">${task.level}</span>
          <span class="td">⏱${task.duration} · +${POINTS[task.level] || 10}分</span>
        </div>
        <div class="tt">${task.title}</div>`;
    if (hasDetail) inner += `<div class="detail">${task.detail}</div>`;
    if (hasTip) inner += `<div class="ptip">💡 ${task.parentTip}</div>`;
    if (hasRecord) inner += `<div class="rec"><span>📝</span><input placeholder="${task.recordLabel}" value="${savedRec}" onchange="saveRecord('${rKey}',this.value)" onclick="event.stopPropagation()"></div>`;
    inner += '<div class="eh">点击展开详情</div></div>';
    card.innerHTML = inner;
    card.onclick = function (e) {
      if (e.target.tagName === 'INPUT' || e.target.closest('.ck')) return;
      card.classList.toggle('expanded');
      if (done) card.classList.toggle('collapsed');
    };
    dc.appendChild(card);
  });

  // Review section (Sunday)
  if (day.isReview) {
    const rs = document.createElement('div');
    rs.className = 'rev-sec';
    // auto-calc A completion for this week
    let aDone = 0, aTotal = 0;
    week.days.forEach((d, di) => {
      d.tasks.forEach((t, ti) => {
        if (t.level === 'A') {
          aTotal++;
          if (isDone(currentWeek - 1, di, ti)) aDone++;
        }
      });
    });
    const aRate = aTotal > 0 ? Math.round(aDone / aTotal * 100) + '%' : '—';

    let html = '<h3>📋 周复盘</h3>';
    const rfs = [
      { key: 'progress', label: 'A完成率', ph: '自动统计', auto: aRate },
      { key: 'school', label: '校内进度/领先周数', ph: '如：第3单元 / 领先1周' },
      { key: 'improvement', label: '孩子的进步证据', ph: '如：能独立说完整句' },
      { key: 'hardest', label: '最难/最累的一项', ph: '如：数学缺数题' },
      { key: 'sleep', label: '睡眠/运动记录', ph: '如：睡眠9.5h 运动5天' },
      { key: 'change', label: '下周只改一件事', ph: '如：数学增加画图' },
      { key: 'support', label: '家长支持办法', ph: '如：提前准备实物' },
      { key: 'rhythm', label: '下周节奏', ph: '如：A全做 B减半' },
    ];
    rfs.forEach(rf => {
      const rk = `${currentWeek - 1}-${currentDay}-rev-${rf.key}`;
      const sv = c.reviews[rk] || (rf.auto ? rf.auto : '');
      html += `<div class="rev-item"><div class="rl">${rf.label}${rf.auto ? `<span class="auto-stat">自动 ${rf.auto}</span>` : ''}</div><input class="ri" placeholder="${rf.ph}" value="${sv}" onchange="setReview('${rk}',this.value)"></div>`;
    });
    const nk = `${currentWeek - 1}-${currentDay}-note`;
    const nt = c.reviews[nk] || '';
    html += `<div class="rev-item"><div class="rl">📝 其他记录</div><textarea class="rev-note" placeholder="有什么想记的写在这里..." onchange="setReview('${nk}',this.value)">${nt}</textarea></div>`;
    rs.innerHTML = html;
    dc.appendChild(rs);
  }
}

function toggleAndRender(wi, di, ti) {
  toggleTask(wi, di, ti);
  setTimeout(() => renderHome(), 100);
  setTimeout(() => checkWeekComplete(wi), 300);
}

function checkWeekComplete(wi) {
  const c = s();
  const week = PLAN.weeks[wi];
  if (!week) return;
  const allA = week.days.every((d, di) => d.tasks.every((t, ti) => t.level !== 'A' || c.tasks[tKey(wi, di, ti)]));
  if (allA && !c.weeksComplete[wi + 1]) {
    c.weeksComplete[wi + 1] = true;
    checkBadges();
    saveApp();
    setTimeout(() => celebrate('🏆', `W${wi + 1} 完成！`, '本周全部A任务完成！\n继续加油！', 0), 500);
  }
}

function saveRecord(k, v) { s().records[k] = v; saveApp(); }
function setReview(k, v) { s().reviews[k] = v; saveApp(); }
function saveHealth(hKey, field, val) {
  const c = s();
  if (!c.health[hKey]) c.health[hKey] = {};
  c.health[hKey][field] = val;
  saveApp();
}

// ===== Badges Page =====
function renderBadges() {
  const c = s();
  document.getElementById('pbPoints').textContent = c.points || 0;
  document.getElementById('pbStreak').textContent = `🔥 连续打卡 ${c.streak || 0} 天`;
  // 积分可能为负（跳过扣分超过余额时），明确提示孩子：完成任务就能补回
  const pc = document.querySelector('.points-banner .pb-label');
  if (pc) pc.textContent = (c.points || 0) < 0 ? `成长积分（欠 ${-c.points} 分，完成任务可补回）` : '成长积分';

  // Badges
  const bg = document.getElementById('badgeGrid');
  bg.innerHTML = '';
  BADGES_DEF.forEach(b => {
    const earned = (c.earnedBadges || []).includes(b.id);
    const cell = document.createElement('div');
    cell.className = 'badge-cell' + (earned ? ' earned' : ' locked');
    cell.innerHTML = `<div class="b-icon">${b.icon}</div><div class="b-name">${b.name}</div><div class="b-desc">${b.desc}</div>${earned ? '<div class="b-check">✅</div>' : ''}`;
    bg.appendChild(cell);
  });

  // Rewards
  const rl = document.getElementById('rewardList');
  rl.innerHTML = '';
  (c.rewards || []).forEach(r => {
    const can = c.points >= r.cost;
    const item = document.createElement('div');
    item.className = 'reward-item';
    item.innerHTML = `<div class="rw-info"><span class="rw-icon">${r.icon}</span><div><div class="rw-name">${r.name}</div><div class="rw-cost">需要 ${r.cost} 积分</div></div></div><button class="rw-btn" ${can ? '' : 'disabled'} onclick="redeemReward('${r.id}')">${can ? '兑换' : '不够'}</button>`;
    rl.appendChild(item);
  });

  // Points history
  const ph = document.getElementById('pointsHistory');
  ph.innerHTML = '';
  (c.pointsHistory || []).slice(0, 30).forEach(h => {
    const row = document.createElement('div');
    row.className = 'ph-row';
    const d = new Date(h.time);
    row.innerHTML = `<span>${h.text}</span><span style="font-weight:600;color:var(--gold)">${h.points}</span>`;
    ph.appendChild(row);
  });
  if (!c.pointsHistory || c.pointsHistory.length === 0) {
    ph.innerHTML = '<div style="text-align:center;padding:10px;color:var(--t3)">还没有积分记录</div>';
  }
}

function redeemReward(id) {
  const c = s();
  const r = (c.rewards || []).find(x => x.id === id);
  if (!r || c.points < r.cost) return;
  addPoints(c, -r.cost, `兑换「${r.name}」`, 'redeem:' + r.id + ':' + pointsUid());
  showToast(`✅ 已兑换「${r.name}」！消耗${r.cost}积分`);
  checkBadges();
  saveApp();
  renderBadges();
}

function addReward() {
  const name = document.getElementById('rwName').value.trim();
  const cost = parseInt(document.getElementById('rwCost').value);
  if (!name || !cost || cost <= 0) { showToast('请填写名称和积分'); return; }
  const c = s();
  c.rewards = c.rewards || [];
  c.rewards.push({ id: 'r' + Date.now(), icon: '🎁', name, cost });
  saveApp();
  document.getElementById('rwName').value = '';
  document.getElementById('rwCost').value = '';
  renderBadges();
  showToast('奖励已添加');
}

// ===== Stats Page =====
function renderStats() {
  const c = s();
  let totalDone = 0, totalTasks = 0;
  let dayMap = {};
  const ms = {};
  Object.keys(PLAN.modules).forEach(m => ms[m] = { done: 0, total: 0 });

  PLAN.weeks.forEach((w, wi) => {
    w.days.forEach((day, di) => {
      const dStr = day.date;
      if (!dayMap[dStr]) dayMap[dStr] = { done: 0, total: 0 };
      day.tasks.forEach((t, ti) => {
        totalTasks++; dayMap[dStr].total++;
        if (ms[t.module]) ms[t.module].total++;
        if (isDone(wi, di, ti)) { totalDone++; dayMap[dStr].done++; if (ms[t.module]) ms[t.module].done++; }
      });
    });
  });

  const sg = document.getElementById('statsGrid');
  sg.innerHTML = `
    <div class="sc"><div class="si">✅</div><div class="sn">${totalDone}</div><div class="sl">累计完成</div></div>
    <div class="sc"><div class="si">🔥</div><div class="sn">${c.streak || 0}</div><div class="sl">连续天数</div></div>
    <div class="sc"><div class="si">📅</div><div class="sn">${c.activeDays || 0}</div><div class="sl">打卡天数</div></div>
    <div class="sc"><div class="si">⭐</div><div class="sn">${totalTasks > 0 ? Math.round(totalDone / totalTasks * 100) : 0}%</div><div class="sl">完成率</div></div>`;

  const msEl = document.getElementById('moduleStats');
  msEl.innerHTML = '';
  Object.entries(ms).forEach(([m, st]) => {
    const mod = PLAN.modules[m];
    const pct = st.total > 0 ? Math.round(st.done / st.total * 100) : 0;
    const row = document.createElement('div');
    row.className = 'ms-row';
    row.innerHTML = `<span class="mi">${mod?.icon || '📌'}</span><span class="mn">${m}</span><div class="mb"><div class="mf" style="width:${pct}%;background:${mod?.color || '#666'}"></div></div><span class="mp">${st.done}/${st.total}</span>`;
    msEl.appendChild(row);
  });

  // Heatmap
  const hg = document.getElementById('heatGrid');
  hg.innerHTML = '';
  const start = new Date(PLAN.startDate);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 56; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const dStr = d.toISOString().slice(0, 10);
    const info = dayMap[dStr];
    const cell = document.createElement('div');
    let cls = 'heat-cell';
    if (info && info.total > 0) { if (info.done === info.total) cls += ' full'; else if (info.done > 0) cls += ' partial'; }
    if (dStr === today.toISOString().slice(0, 10)) cls += ' today';
    cell.className = cls;
    cell.textContent = `${d.getMonth() + 1}/${d.getDate()}`;
    hg.appendChild(cell);
  }

  // Exercise & Sleep charts (current week)
  const week = PLAN.weeks[currentWeek - 1];
  const exChart = document.getElementById('exerciseChart');
  const exLabels = document.getElementById('exerciseLabels');
  const slChart = document.getElementById('sleepChart');
  const slLabels = document.getElementById('sleepLabels');
  exChart.innerHTML = ''; exLabels.innerHTML = '';
  slChart.innerHTML = ''; slLabels.innerHTML = '';
  const dayNames = ['一', '二', '三', '四', '五', '六', '日'];
  if (week) {
    week.days.forEach((day, di) => {
      const hKey = `${currentWeek - 1}-${di}`;
      const h = c.health[hKey] || {};
      const ex = parseInt(h.exercise) || 0;
      const sl = parseFloat(h.sleep) || 0;
      const isToday = (di === getCurrentDayIdx() && currentWeek === getCurrentWeekNum());

      const exBar = document.createElement('div');
      exBar.className = 'chart-bar' + (isToday ? ' today' : '');
      exBar.style.height = Math.min(ex / 90 * 100, 100) + '%';
      exBar.title = ex + '分钟';
      exChart.appendChild(exBar);

      const slBar = document.createElement('div');
      slBar.className = 'chart-bar' + (isToday ? ' today' : '');
      slBar.style.height = Math.min(sl / 12 * 100, 100) + '%';
      slBar.title = sl + '小时';
      slChart.appendChild(slBar);

      const lbl = document.createElement('span');
      lbl.textContent = dayNames[di];
      exLabels.appendChild(lbl);
      const lbl2 = document.createElement('span');
      lbl2.textContent = dayNames[di];
      slLabels.appendChild(lbl2);
    });
  }
}

// ===== Resources Page =====
function renderResources() {
  const rl = document.getElementById('readingList');
  rl.innerHTML = '';
  (PLAN.readings || []).forEach(r => {
    const c = document.createElement('div');
    c.className = 'rd-card';
    c.innerHTML = `<span class="rid">${r.id}</span><div class="rtitle">${r.title}</div><div class="rtext">${r.text}</div><div class="rq">❓ ${r.questions}</div><div class="ra">💡 参考答案：${r.answers}</div>`;
    rl.appendChild(c);
  });
  const al = document.getElementById('assessList');
  al.innerHTML = '';
  (PLAN.assessments || []).forEach(a => {
    const c = document.createElement('div');
    c.className = 'as-card';
    let h = `<div class="aa">${a.area}</div>`;
    if (a.howToTest) h += `<div class="arow"><span class="al">怎么测：</span>${a.howToTest}</div>`;
    if (a.questions) h += `<div class="arow"><span class="al">题目：</span>${a.questions}</div>`;
    if (a.standard) h += `<div class="arow"><span class="al">标准：</span>${a.standard}</div>`;
    if (a.w1Start) h += `<div class="arow"><span class="al">W1起点：</span>${a.w1Start}</div>`;
    if (a.w6Result) h += `<div class="arow"><span class="al">W6结果：</span>${a.w6Result}</div>`;
    if (a.w8Result) h += `<div class="arow"><span class="al">W8结果：</span>${a.w8Result}</div>`;
    if (a.nextStep) h += `<div class="anext">→ ${a.nextStep}</div>`;
    c.innerHTML = h;
    al.appendChild(c);
  });
}

// ===== Settings =====
function renderSettings() {
  const cl = document.getElementById('childList');
  cl.innerHTML = '';
  Object.values(app.children).forEach(c => {
    const card = document.createElement('div');
    card.className = 'child-card' + (c.id === app.activeChild ? ' active' : '');
    card.style.cursor = 'pointer';
    card.innerHTML = `<span class="cc-avatar">${c.avatar}</span><div class="cc-info"><div class="cc-name">${c.name}</div><div class="cc-grade">${c.grade}</div></div><span class="cc-points">${c.points || 0}分</span>`;
    card.onclick = () => { app.activeChild = c.id; saveApp(); applyChildMode(); renderAll(); };
    cl.appendChild(card);
  });

  const cmSw = document.getElementById('childModeSw');
  if (s().childModeOn) cmSw.classList.add('on');

  const cm = document.getElementById('curMode');
  if (cm) {
    const modeMap = { normal: '正常', busy: '忙碌', rest: '休息' };
    cm.textContent = modeMap[s().dayMode || 'normal'];
  }

  const st = document.getElementById('setTotal');
  if (st) st.textContent = PLAN.weeks.reduce((s2, w) => s2 + w.days.reduce((s3, d) => s3 + d.tasks.length, 0), 0);
}

function addChild() {
  const name = prompt('孩子姓名：');
  if (!name) return;
  const id = 'child_' + Date.now();
  const nc = { ...DEFAULT_CHILD, id, name, avatar: '🧒', grade: '一年级', points: 0, streak: 0, tasks: {}, records: {}, reviews: {}, health: {}, rewards: [...DEFAULT_REWARDS], earnedBadges: [], pointsHistory: [], dayMode: 'normal', childModeOn: false, totalDone: 0, activeDays: 0, perfectDays: 0, perfectWeeks: 0, weeksComplete: {}, moduleDone: {}, maxStreak: 0, lastDate: null };
  app.children[id] = nc;
  app.activeChild = id;
  saveApp();
  renderSettings();
  renderAll();
  showToast('已添加：' + name);
}

function toggleChildMode() {
  const c = s();
  c.childModeOn = !c.childModeOn;
  saveApp();
  applyChildMode();
  const sw = document.getElementById('childModeSw');
  if (sw) sw.classList.toggle('on', c.childModeOn);
  showToast(c.childModeOn ? '👧 孩子模式已开启' : '家长模式');
}

function applyChildMode() {
  document.documentElement.classList.toggle('child-mode', !!s().childModeOn);
}

// ===== Data Export/Import/Report =====
function exportData() {
  const blob = new Blob([JSON.stringify(app, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `冉冉成长数据_${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  showToast('已导出数据');
}

function handleImport(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = (ev) => {
    try {
      const d = JSON.parse(ev.target.result);
      if (d.children) { app = d; saveApp(); renderAll(); showToast('导入成功'); }
      else showToast('文件格式不对');
    } catch { showToast('读取失败'); }
  };
  r.readAsText(f);
}

function exportReport() {
  const c = s();
  const week = PLAN.weeks[currentWeek - 1];
  let report = `冉冉成长周报\n${c.name} · ${c.grade} · W${currentWeek}（${week?.theme || ''}）\n生成时间：${new Date().toLocaleString('zh-CN')}\n\n`;

  // Week stats
  let wDone = 0, wTotal = 0;
  let aDone = 0, aTotal = 0;
  week?.days.forEach((d, di) => {
    d.tasks.forEach((t, ti) => {
      wTotal++;
      if (t.level === 'A') aTotal++;
      if (isDone(currentWeek - 1, di, ti)) {
        wDone++;
        if (t.level === 'A') aDone++;
      }
    });
  });
  report += `【本周完成情况】\n总任务：${wDone}/${wTotal}\nA任务完成：${aDone}/${aTotal}（${aTotal > 0 ? Math.round(aDone / aTotal * 100) : 0}%）\n连续打卡：${c.streak}天\n累计积分：${c.points}\n\n`;

  // Daily breakdown
  report += `【每日明细】\n`;
  week?.days.forEach((d, di) => {
    const done = d.tasks.filter((_, ti) => isDone(currentWeek - 1, di, ti)).length;
    const h = c.health[`${currentWeek - 1}-${di}`] || {};
    report += `Day${di + 1} ${d.label || ''}：${done}/${d.tasks.length} 运动${h.exercise || '—'}分 睡眠${h.sleep || '—'}h\n`;
  });

  // Review
  report += `\n【周复盘】\n`;
  const rfs = ['progress', 'school', 'improvement', 'hardest', 'sleep', 'change', 'support', 'rhythm'];
  const rfLabels = ['A完成率', '校内进度', '进步证据', '最难项', '睡眠运动', '下周调整', '支持办法', '下周节奏'];
  rfs.forEach((k, i) => {
    const v = c.reviews[`${currentWeek - 1}-6-rev-${k}`] || '';
    report += `${rfLabels[i]}：${v}\n`;
  });
  const note = c.reviews[`${currentWeek - 1}-6-note`] || '';
  report += `其他：${note}\n`;

  const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `冉冉周报_W${currentWeek}_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click(); URL.revokeObjectURL(url);
  showToast('周报已导出');
}

function confirmReset() {
  if (confirm('确定要清空当前孩子的所有打卡数据吗？此操作不可撤销！')) {
    const id = app.activeChild;
    app.children[id] = { ...DEFAULT_CHILD, id, name: s().name, avatar: s().avatar, grade: s().grade, rewards: [...DEFAULT_REWARDS] };
    saveApp(); renderAll();
    showToast('已重置');
  }
}

// ===== Navigation =====
function switchPage(name, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const p = document.getElementById('page-' + name);
  if (p) p.classList.add('active');
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  if (name === 'badges') renderBadges();
  if (name === 'stats') renderStats();
  if (name === 'resources') renderResources();
  if (name === 'settings') renderSettings();
}

// ===== Animations =====
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(window._tt);
  window._tt = setTimeout(() => t.classList.remove('show'), 2200);
}

function celebrate(emoji, title, msg, points) {
  const cel = document.getElementById('celebrate');
  cel.innerHTML = `<div class="cel-card"><div class="cel-emoji">${emoji}</div><div class="cel-title">${title}</div><div class="cel-msg">${msg.replace('\n', '<br>')}</div>${points > 0 ? `<div class="cel-points">+${points}</div>` : ''}<button class="cel-btn" onclick="closeCelebrate()">太棒了！</button></div>`;
  cel.classList.add('show');
  // confetti
  for (let i = 0; i < 20; i++) {
    setTimeout(() => {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + '%';
      c.style.top = '40%';
      c.style.background = ['#2D7A5F', '#C1B19F', '#F97316', '#3B82F6', '#EC4899'][Math.floor(Math.random() * 5)];
      c.style.animationDelay = (Math.random() * 0.5) + 's';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 2500);
    }, i * 50);
  }
}

function closeCelebrate() {
  document.getElementById('celebrate').classList.remove('show');
  renderAll();
}

function floatPoints(pts) {
  const f = document.createElement('div');
  f.className = 'points-float';
  f.textContent = `+${pts}`;
  f.style.left = (Math.random() * 40 + 30) + '%';
  f.style.top = '40%';
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1200);
}

// ===== Init =====
function renderAll() {
  renderHome();
  applyChildMode();
}

renderAll();
