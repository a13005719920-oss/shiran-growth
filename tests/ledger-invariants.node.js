#!/usr/bin/env node
/* ===== 学习计划 OS · 积分账本不变式（headless，400 步随机操作）=====
 *
 * 用最小 DOM stub 在 Node 里加载**仓库真实**的 data.js + app.js + enhancements.js，
 * 随机执行「打卡/撤销/跳过/取消跳过/复习/跳过复习/兑换/连点兑换」，
 * 每一步都校验积分账本的结构不变式。与 tests/logic.test.js（真实浏览器点击路径）互补。
 *
 * 跑法： node tests/ledger-invariants.node.js
 * 只读项目文件，不改数据；退出码 0 = 全部通过。
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
// 默认取本文件所在目录的上一级（仓库根）；被复制到临时目录跑时用 SHIRAN_PROJECT_DIR 指向项目
const DIR = process.env.SHIRAN_PROJECT_DIR ? path.resolve(process.env.SHIRAN_PROJECT_DIR) : path.resolve(__dirname, '..');

// ---------- 最小 DOM ----------
function mkEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(), id: '', className: '', _html: '', textContent: '', value: '',
    style: {}, dataset: {}, children: [], parentNode: null,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false } },
    appendChild(c) { c.parentNode = el; el.children.push(c); return c },
    insertBefore(c) { c.parentNode = el; el.children.unshift(c); return c },
    querySelector(sel) {
      if (sel === '.tb-top') { if (!el.__tbtop) { el.__tbtop = mkEl('div'); el.__tbtop.__card = el } return el.__tbtop }
      if (sel === '.skip-btn') return (el.__tbtop && el.__tbtop.children.find(b => /skip-btn/.test(b.className))) || null;
      return null;
    },
    querySelectorAll(sel) { return sel === '.tc' ? el.children.filter(c => /(^| )tc( |$)/.test(c.className)) : [] },
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null },
    focus() {}, remove() {}, scrollTo() {}, closest() { return null },
  };
  Object.defineProperty(el, 'innerHTML', { get() { return el._html }, set(v) { el._html = v; el.children = [] } });
  return el;
}
const byId = new Map();
const doc = {
  createElement: mkEl,
  getElementById(id) { if (!byId.has(id)) { const e = mkEl('div'); e.id = id; byId.set(id, e) } return byId.get(id) },
  querySelector() { return null }, querySelectorAll() { return [] },
  documentElement: mkEl('html'), body: mkEl('body'), addEventListener() {}, removeEventListener() {},
};
const mkStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear(), key: i => [...m.keys()][i], get length() { return m.size } } };
const sandbox = {
  console, JSON, Math, Date, parseInt, parseFloat, isNaN, String, Number, Boolean, Array, Object, Set, Map, Error, RegExp, Promise,
  document: doc, localStorage: mkStore(), sessionStorage: mkStore(),
  setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  alert() {}, confirm: () => true, prompt: () => 'x',
  navigator: { userAgent: 'node-verify' }, location: { href: 'http://localhost/', protocol: 'http:' },
};
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);
for (const f of ['data.js', 'app.js', 'enhancements.js']) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f });
const ev = code => vm.runInContext(code, ctx);

// ---------- 夹具 ----------
const DAYS = JSON.parse(ev('JSON.stringify(PLAN.weeks.map(w=>w.days.map(d=>d.tasks.map(t=>t.level))))'));
const MODS = JSON.parse(ev('JSON.stringify(PLAN.weeks.map(w=>w.days.map(d=>d.tasks.map(t=>t.module))))'));
ev(`localStorage.removeItem(STORE_KEY);
    app = { version: 3, activeChild: 'c1', children: { c1: JSON.parse(JSON.stringify(DEFAULT_CHILD)) } };
    delete app.children.c1.v4; saveApp();`);
const TODAY = new Date().toISOString().slice(0, 10);
ev(`s().v4 = { skipped:{}, skipStreak:{}, lastSkipDate:{}, reviewQueue:{}, reviewDone:{}, challenges:{} };
    s().v4.reviewQueue['${TODAY}'] = PLAN.weeks[0].days[0].tasks.slice(0,3).map((t,i)=>({wk:0,dy:0,ti:i,module:t.module,title:t.title,scheduled:'${TODAY}'}));
    saveApp();`);
const REVIEW_KEYS = ['rev_0_0_0', 'rev_0_0_1', 'rev_0_0_2'];

// ---------- 工具 ----------
const rnd = (() => { let a = 20260924; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } })();
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const state = () => JSON.parse(ev('JSON.stringify({points:s().points,hist:s().pointsHistory,tasks:s().tasks,v4:{skipped:s().v4.skipped,skipStreak:s().v4.skipStreak,lastSkipDate:s().v4.lastSkipDate,reviewDone:s().v4.reviewDone,challenges:s().v4.challenges},perfectDays:s().perfectDays})'));
const setView = (wi, di) => ev(`currentWeek=${wi + 1}; currentDay=${di}; renderHome();`);
const cardEl = (wi, di, ti) => byId.get('dayContent').children.find(c => c.id === `tc-${wi}-${di}-${ti}`) || null;
const taskKeyOf = key => String(key).replace(/^skip3?:/, '').replace(/^task:/, '');

// ---------- 不变式 ----------
const fails = [];
function check(tag) {
  const st = state();
  const sum = st.hist.reduce((t, h) => t + (parseInt(h.points, 10) || 0), 0);
  const bad = [];
  if (sum !== st.points) bad.push(`总积分(${st.points}) ≠ 流水之和(${sum})`);
  const skipRecs = st.hist.filter(h => /^skip3?:/.test(String(h.key || '')));
  const baseRecs = st.hist.filter(h => /^skip:/.test(String(h.key || '')));
  const taskRecs = st.hist.filter(h => /^task:/.test(String(h.key || '')));
  skipRecs.forEach(h => { const k = taskKeyOf(h.key); if (!st.v4.skipped[k]) bad.push(`孤儿扣分记录 ${h.key}`) });
  Object.keys(st.v4.skipped).forEach(k => { if (!baseRecs.some(h => taskKeyOf(h.key) === k)) bad.push(`${k} 标记跳过但没有扣分记录`) });
  taskRecs.forEach(h => { const k = taskKeyOf(h.key); if (!st.tasks[k]) bad.push(`孤儿完成记录 ${h.key}`) });
  Object.keys(st.tasks).forEach(k => { if (st.tasks[k] && !taskRecs.some(h => taskKeyOf(h.key) === k)) bad.push(`${k} 已完成但没有加分记录`) });
  // 每条带 key 的流水必须是唯一的（跳过与连跳罚分现在是两个不同 key）
  const byKey = {};
  st.hist.forEach(h => { if (h.key) byKey[h.key] = (byKey[h.key] || 0) + 1 });
  Object.entries(byKey).forEach(([k, n]) => { if (n > 1) bad.push(`key ${k} 出现 ${n} 条流水`) });
  Object.entries(st.v4.challenges || {}).forEach(([w, ch]) => {
    const n = st.hist.filter(h => h.key === `chal:${w}:${ch.type}`).length;
    if (ch.achieved && n !== 1) bad.push(`周挑战 W${w} 已达成但有 ${n} 条奖励流水`);
    if (!ch.achieved && n !== 0) bad.push(`周挑战 W${w} 未达成却有奖励流水`);
  });
  if (bad.length) fails.push({ tag, bad: bad.slice(0, 4) });
  return bad.length === 0;
}

// ---------- 随机操作 ----------
const cov = { toggle: 0, undo: 0, skip: 0, unskip: 0, review: 0, reviewSkip: 0, redeem: 0, redeemBurst: 0, skip3day: 0, streak7: 0 };
const OPS = ['toggle', 'toggle', 'toggle', 'toggle', 'skip', 'skip', 'unskip', 'review', 'reviewSkip', 'redeem', 'redeemBurst', 'skip3day', 'streak7'];
for (let i = 0; i < 400; i++) {
  const op = pick(OPS);
  // 第 1 周会被首页“吸附到今天”，取不到指定天 → 只用第 2 周及以后
  const wi = 1 + Math.floor(rnd() * 7), di = Math.floor(rnd() * 7);
  const ti = Math.floor(rnd() * DAYS[wi][di].length);
  setView(wi, di);
  const c = cardEl(wi, di, ti);
  if (!c) { fails.push({ tag: `第${i}步 找不到任务卡`, bad: [`${wi}-${di}-${ti}`] }); continue }
  try {
    if (op === 'toggle' || op === 'undo') {
      const done = !!state().tasks[`${wi}-${di}-${ti}`];
      ev(`toggleTask(${wi},${di},${ti}); renderHome();`);
      cov[done ? 'undo' : 'toggle']++;
    } else if (op === 'skip' || op === 'unskip') {
      const b = c.querySelector('.skip-btn');
      // 已完成的卡片本来就不该有跳过按钮：这是产品规则，不是缺陷
      if (!b) {
        if (state().tasks[`${wi}-${di}-${ti}`]) { ev(`toggleTask(${wi},${di},${ti}); renderHome();`); cov.undo++ }
        else fails.push({ tag: `第${i}步 未完成的任务卡上没有跳过按钮`, bad: [`${wi}-${di}-${ti}`] });
        continue;
      }
      cov[/unskip/.test(b.className) ? 'unskip' : 'skip']++;
      b.onclick({ stopPropagation() {} }); ev('renderHome();');
    } else if (op === 'skip3day') {
      const mod = MODS[wi][di][ti];
      if (DAYS[wi][di][ti] === 'A') {
        ev(`s().v4.lastSkipDate['${mod}'] = new Date(Date.now()-86400000).toISOString().slice(0,10); s().v4.skipStreak['${mod}'] = 2;`);
        const b = cardEl(wi, di, ti).querySelector('.skip-btn');
        if (b && !/unskip/.test(b.className)) { b.onclick({ stopPropagation() {} }); ev('renderHome();'); cov.skip3day++ }
      }
    } else if (op === 'streak7') {
      ev(`s().streak = 7; s().lastDate = '${TODAY}'; s().maxStreak = 7;`);
      ev(`if (!isDone(${wi},${di},${ti})) { toggleTask(${wi},${di},${ti}); } renderHome();`);
      cov.streak7++;
    } else if (op === 'review') {
      const rk = pick(REVIEW_KEYS);
      sandbox.window._v4_completeReview(rk);
      sandbox.window._v4_completeReview(rk);   // 连点两次，验证不重复加分
      const n = state().hist.filter(h => h.key === 'rev:' + rk).length;
      if (n > 1) fails.push({ tag: `第${i}步 复习重复加分`, bad: [`${rk} 有 ${n} 条流水`] });
      cov.review++;
    } else if (op === 'reviewSkip') {
      sandbox.window._v4_skipReview(pick(REVIEW_KEYS)); cov.reviewSkip++;
    } else if (op === 'redeem') {
      if (state().points >= 30) { ev(`redeemReward('r1');`); cov.redeem++ }
    } else if (op === 'redeemBurst') {
      // 同一毫秒连点两次兑换：两条流水 key 必须不同（曾经撞 key）
      if (state().points >= 60) {
        const n = state().hist.length;
        ev(`redeemReward('r1'); redeemReward('r1');`);
        const recs = state().hist.slice(0, 2).filter(h => String(h.text).includes('兑换'));
        if (recs.length !== 2) fails.push({ tag: `第${i}步 连点兑换少了流水`, bad: [`${recs.length} 条`] });
        else if (recs[0].key === recs[1].key) fails.push({ tag: `第${i}步 连点兑换流水 key 撞车`, bad: [recs[0].key] });
        if (state().hist.length !== n + 2) fails.push({ tag: `第${i}步 连点兑换流水条数不对`, bad: [`${state().hist.length} vs ${n + 2}`] });
        cov.redeemBurst++;
      }
    }
  } catch (e) {
    fails.push({ tag: `第${i}步 ${op} 抛错`, bad: [String((e && e.message) || e)] });
  }
  check(`第${i}步 ${op}`);
}

// ---------- 输出 ----------
// 防复发：公开文件里不得再出现孩子原姓名。名字用码点拼出来，避免把名字本身写回仓库。
const OLD_NAME_FULL = String.fromCharCode(0x5218, 0x8bd7, 0x5189);
const OLD_NAME_PART = String.fromCharCode(0x8bd7, 0x5189);
const PUBLISHABLE = ['app.js', 'enhancements.js', 'sync.js', 'index.html', 'data.js', 'manifest.json', 'sync_data.json'];
const piLeaks = [];
PUBLISHABLE.forEach(f => {
  let txt = '';
  try { txt = fs.readFileSync(path.join(DIR, f), 'utf8'); } catch { return }
  if (txt.includes(OLD_NAME_FULL)) piLeaks.push(`${f}: 出现孩子原全名`);
  if (txt.includes(OLD_NAME_PART)) piLeaks.push(`${f}: 出现孩子原姓名简称`);
});
if (piLeaks.length) fails.push({ tag: 'PII 防复发检查', bad: piLeaks });
console.log('PII 防复发检查:', piLeaks.length === 0 ? 'PASS（7 个公开文件里无孩子原姓名）' : 'FAIL');

const st = state();
const sum = st.hist.reduce((t, h) => t + (parseInt(h.points, 10) || 0), 0);
console.log('操作覆盖:', JSON.stringify(cov));
console.log('末态:', JSON.stringify({ points: st.points, 流水: st.hist.length, 已完成任务: Object.keys(st.tasks).length, 跳过中: Object.keys(st.v4.skipped).length, 复习完成: Object.keys(st.v4.reviewDone).length, perfectDays: st.perfectDays }));
console.log('末态自检:', JSON.stringify({ 总积分: st.points, 流水之和: sum, 一致: st.points === sum }));
console.log('不变式失败步数:', fails.length);
fails.slice(0, 8).forEach(f => console.log('  ✗', f.tag, '→', f.bad.join(' | ')));
console.log(fails.length === 0 ? 'VERIFY: PASS (400 步随机操作，账本不变式全部成立)' : 'VERIFY: FAIL');
process.exit(fails.length === 0 ? 0 : 1);
