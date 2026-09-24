/* ===== V4 增强模块 ===== */
/* 1. 跳过/扣分机制  2. 间隔复习  3. 周挑战 */
/* 通过包装 renderHome 实现注入，不修改原有代码 */

(function() {
'use strict';

// ===== 工具 =====
function todayStr() { return new Date().toISOString().slice(0,10); }
function dateOffset(days) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}

// 确保增强状态存在
function ensureState() {
  const c = s();
  if (!c.v4) {
    c.v4 = {
      skipped: {},        // taskKey -> true
      skipStreak: {},     // module -> 连续跳过天数
      lastSkipDate: {},   // module -> 日期
      reviewQueue: {},    // dateStr -> [{ wk, dy, ti, module, title }]
      reviewDone: {},     // reviewKey -> true
      challenges: {},     // weekNum -> { type, progress, achieved, claimed }
    };
  }
  return c.v4;
}

// ===== 1. 跳过/扣分 =====
function skipTask(wi, di, ti) {
  const c = s();
  const v4 = ensureState();
  const k = tKey(wi, di, ti);
  const task = PLAN.weeks[wi]?.days?.[di]?.tasks?.[ti];
  if (!task) return;

  // 如果已完成，不允许跳过
  if (c.tasks[k]) return;

  v4.skipped[k] = true;
  const pts = Math.min(POINTS[task.level] || 10, 5); // 最多扣5分
  c.points = Math.max(0, c.points - pts);
  c.pointsHistory.unshift({
    time: Date.now(),
    text: `跳过 ${task.module}·${task.title.slice(0,12)}`,
    points: `-${pts}`
  });
  if (c.pointsHistory.length > 100) c.pointsHistory.length = 100;

  // 连续跳过统计
  const mod = task.module;
  const today = todayStr();
  if (v4.lastSkipDate[mod] === dateOffset(-1)) {
    v4.skipStreak[mod] = (v4.skipStreak[mod] || 0) + 1;
  } else {
    v4.skipStreak[mod] = 1;
  }
  v4.lastSkipDate[mod] = today;

  // 连续3天跳过同一模块 → 额外提醒
  if (v4.skipStreak[mod] >= 3 && task.level === 'A') {
    const extra = 5;
    c.points = Math.max(0, c.points - extra);
    c.pointsHistory.unshift({
      time: Date.now(),
      text: `${mod}连续3天未做，需关注`,
      points: `-${extra}`
    });
    showToast(`💡 ${mod}连续3天跳过了，这科要多关注哦`);
  } else {
    showToast(`已跳过，扣${pts}分。没关系，明天继续！`);
  }

  saveApp();
  setTimeout(() => renderHome(), 100);
}

function unskipTask(wi, di, ti) {
  const c = s();
  const v4 = ensureState();
  const k = tKey(wi, di, ti);
  delete v4.skipped[k];
  // 不退分（已经扣了）
  saveApp();
  setTimeout(() => renderHome(), 100);
}

// ===== 2. 间隔复习 =====
// 完成任务时加入复习队列（3天后复习）
function scheduleReview(wi, di, ti) {
  const c = s();
  const v4 = ensureState();
  const task = PLAN.weeks[wi]?.days?.[di]?.tasks?.[ti];
  if (!task) return;
  const reviewDate = dateOffset(3); // 3天后复习
  if (!v4.reviewQueue[reviewDate]) v4.reviewQueue[reviewDate] = [];
  // 避免重复添加
  const exists = v4.reviewQueue[reviewDate].some(r => r.wk === wi && r.dy === di && r.ti === ti);
  if (!exists) {
    v4.reviewQueue[reviewDate].push({
      wk: wi, dy: di, ti: ti,
      module: task.module,
      title: task.title,
      scheduled: todayStr()
    });
  }
}

function getTodayReviews() {
  const v4 = ensureState();
  const today = todayStr();
  return v4.reviewQueue[today] || [];
}

function completeReview(reviewKey, reviewItem) {
  const c = s();
  const v4 = ensureState();
  v4.reviewDone[reviewKey] = true;
  c.points += 5;
  c.pointsHistory.unshift({
    time: Date.now(),
    text: `复习 ${reviewItem.module}·${reviewItem.title.slice(0,12)}`,
    points: '+5'
  });
  if (c.pointsHistory.length > 100) c.pointsHistory.length = 100;
  showToast('复习完成！+5分 🎉');
  saveApp();
  setTimeout(() => renderHome(), 100);
}

// ===== 3. 周挑战 =====
const CHALLENGES = [
  { id: 'fullA5', icon: '🔥', name: '全勤达人', desc: '本周5天全部完成A任务', target: 5, reward: 100 },
  { id: 'perfect3', icon: '✨', name: '完美三天', desc: '本周3天完成所有任务', target: 3, reward: 150 },
  { id: 'readAll', icon: '📚', name: '阅读之星', desc: '本周完成全部阅读任务', target: 7, reward: 50 },
];

function getWeekChallenge(weekNum) {
  const v4 = ensureState();
  if (!v4.challenges[weekNum]) {
    // 每周轮换挑战类型
    const idx = (weekNum - 1) % CHALLENGES.length;
    v4.challenges[weekNum] = {
      type: CHALLENGES[idx].id,
      progress: 0,
      achieved: false,
      claimed: false
    };
  }
  return v4.challenges[weekNum];
}

function updateChallenge(weekNum) {
  const c = s();
  const v4 = ensureState();
  const ch = getWeekChallenge(weekNum);
  if (ch.achieved) return;

  const def = CHALLENGES.find(d => d.id === ch.type);
  if (!def) return;
  const week = PLAN.weeks[weekNum - 1];
  if (!week) return;

  let progress = 0;
  if (ch.type === 'fullA5') {
    // 统计本周多少天全部A任务完成
    week.days.forEach((day, di) => {
      const allADone = day.tasks.every((t, ti) => t.level !== 'A' || c.tasks[tKey(weekNum-1, di, ti)]);
      if (allADone) progress++;
    });
  } else if (ch.type === 'perfect3') {
    // 统计本周多少天全部任务完成
    week.days.forEach((day, di) => {
      const allDone = day.tasks.every((t, ti) => c.tasks[tKey(weekNum-1, di, ti)]);
      if (allDone) progress++;
    });
  } else if (ch.type === 'readAll') {
    // 统计本周完成多少天的阅读任务
    week.days.forEach((day, di) => {
      const readTask = day.tasks.findIndex(t => t.module === '阅读');
      if (readTask >= 0 && c.tasks[tKey(weekNum-1, di, readTask)]) progress++;
    });
  }

  ch.progress = progress;
  if (progress >= def.target && !ch.achieved) {
    ch.achieved = true;
    c.points += def.reward;
    c.pointsHistory.unshift({
      time: Date.now(),
      text: `完成周挑战「${def.name}」`,
      points: `+${def.reward}`
    });
    saveApp();
    setTimeout(() => celebrate(def.icon, `挑战完成！${def.name}`, `本周目标达成！\n额外奖励 +${def.reward} 积分`, def.reward), 500);
  }
}

// ===== 包装 toggleTask：完成后触发复习+挑战 =====
const _origToggle = toggleTask;
toggleTask = function(wi, di, ti) {
  const wasDone = isDone(wi, di, ti);
  _origToggle(wi, di, ti);
  const nowDone = isDone(wi, di, ti);
  // 新完成 → 安排复习 + 更新挑战
  if (!wasDone && nowDone) {
    scheduleReview(wi, di, ti);
    updateChallenge(currentWeek);
  }
  // 取消完成 → 更新挑战进度
  if (wasDone && !nowDone) {
    updateChallenge(currentWeek);
  }
};

// ===== 包装 renderHome：注入复习区+挑战栏+跳过按钮 =====
const _origRenderHome = renderHome;
renderHome = function() {
  _origRenderHome();

  // 注入挑战栏
  injectChallengeBanner();

  // 注入复习区
  injectReviewSection();

  // 注入跳过按钮
  injectSkipButtons();
};

// ===== 注入：挑战栏 =====
function injectChallengeBanner() {
  const c = s();
  const v4 = ensureState();
  const weekNum = currentWeek;
  const ch = getWeekChallenge(weekNum);
  const def = CHALLENGES.find(d => d.id === ch.type);
  if (!def) return;

  // 移除旧挑战栏
  const old = document.getElementById('challengeBanner');
  if (old) old.remove();

  const dc = document.getElementById('dayContent');
  if (!dc) return;

  const banner = document.createElement('div');
  banner.id = 'challengeBanner';
  banner.className = 'challenge-banner' + (ch.achieved ? ' achieved' : '');
  banner.innerHTML = `
    <div class="ch-icon">${def.icon}</div>
    <div class="ch-body">
      <div class="ch-title">${def.name} ${ch.achieved ? '✅' : ''}</div>
      <div class="ch-desc">${def.desc} · 奖励 +${def.reward}分</div>
      <div class="ch-bar"><div class="ch-fill" style="width:${Math.min(ch.progress/def.target*100,100)}%"></div></div>
    </div>
    <div class="ch-progress">${Math.min(ch.progress, def.target)}/${def.target}</div>
  `;
  dc.insertBefore(banner, dc.firstChild);
}

// ===== 注入：复习区 =====
function injectReviewSection() {
  const c = s();
  const v4 = ensureState();
  const reviews = getTodayReviews();
  if (reviews.length === 0) return;

  const dc = document.getElementById('dayContent');
  if (!dc) return;
  // 挑战栏后面插入
  const banner = document.getElementById('challengeBanner');
  const refNode = banner ? banner.nextSibling : dc.firstChild;

  const uncompleted = reviews.filter(r => {
    const rk = `rev_${r.wk}_${r.dy}_${r.ti}`;
    return !v4.reviewDone[rk];
  });
  if (uncompleted.length === 0) return;

  const section = document.createElement('div');
  section.id = 'reviewSection';
  section.className = 'review-section';
  let html = '<div class="rev-head">🔄 今日复习（间隔重复）</div>';
  uncompleted.forEach((r, i) => {
    const rk = `rev_${r.wk}_${r.dy}_${r.ti}`;
    const mod = PLAN.modules[r.module] || { icon: '📌', color: '#666' };
    html += `
      <div class="rev-card" data-rk="${rk}" data-idx="${i}">
        <div class="rev-tag" style="background:${mod.color}20;color:${mod.color}">${mod.icon} ${r.module}</div>
        <div class="rev-title">${r.title.slice(0, 40)}</div>
        <div class="rev-actions">
          <button class="rev-done" onclick="window._v4_completeReview('${rk}', ${i})">复习了 +5</button>
          <button class="rev-skip" onclick="window._v4_skipReview('${rk}', ${i})">跳过</button>
        </div>
      </div>`;
  });
  section.innerHTML = html;
  dc.insertBefore(section, refNode);
}

// 全局回调
window._v4_completeReview = function(rk, idx) {
  const reviews = getTodayReviews();
  const item = reviews[idx];
  if (item) completeReview(rk, item);
};
window._v4_skipReview = function(rk, idx) {
  const v4 = ensureState();
  v4.reviewDone[rk] = true; // 标记为已处理，不再显示
  saveApp();
  renderHome();
};

// ===== 注入：跳过按钮 =====
function injectSkipButtons() {
  const c = s();
  const v4 = ensureState();
  const dc = document.getElementById('dayContent');
  if (!dc) return;

  // 给每个未完成的任务卡加跳过按钮
  dc.querySelectorAll('.tc').forEach(card => {
    const id = card.id;
    if (!id.startsWith('tc-')) return;
    const parts = id.split('-'); // tc-{wi}-{di}-{ti}
    if (parts.length !== 4) return;
    const wi = parseInt(parts[1]);
    const di = parseInt(parts[2]);
    const ti = parseInt(parts[3]);
    const k = tKey(wi, di, ti);
    if (c.tasks[k]) return; // 已完成不加跳过
    if (card.querySelector('.skip-btn')) return; // 已有跳过按钮
    if (v4.skipped[k]) {
      // 已跳过 → 显示取消跳过
      card.classList.add('skipped');
      const btn = document.createElement('button');
      btn.className = 'skip-btn unskip';
      btn.textContent = '取消跳过';
      btn.onclick = function(e) { e.stopPropagation(); unskipTask(wi, di, ti); };
      card.querySelector('.tb-top')?.appendChild(btn);
    } else {
      const btn = document.createElement('button');
      btn.className = 'skip-btn';
      btn.textContent = '跳过';
      btn.onclick = function(e) { e.stopPropagation(); skipTask(wi, di, ti); };
      card.querySelector('.tb-top')?.appendChild(btn);
    }
  });
}

// ===== 初始化 =====
ensureState();

// 首次加载时重新渲染，确保增强功能注入
setTimeout(() => { renderHome(); }, 200);

})();
