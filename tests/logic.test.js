/* ===== 学习计划 OS · 积分/打卡/撤销/跳过/取消跳过/复习/周挑战 逻辑回归测试 =====
 *
 * 目的：把「总积分 === 积分流水之和」当成硬约束。每个场景结束都会 verifyInvariant()。
 * 所有操作都走真实 UI（点任务勾选框、点跳过/取消跳过、点复习按钮），不直接改数据，
 * 只有"模拟旧数据"的场景例外（会注明）。
 *
 * 跑法（本地静态服务器打开 index.html 之后，在浏览器控制台执行）：
 *   const s=document.createElement('script');s.src='./tests/logic.test.js';
 *   s.onload=()=>{const r=runLogicTests();console.table(r.results);console.log(r.summary)};
 *   document.body.appendChild(s);
 *
 * 注意：测试会清空 localStorage 里的 STORE_KEY，跑之前先导出要保留的数据。
 * 说明：测试用第 2 周（wi=1）的任务，因为首页在"当前周"会把 currentDay 吸附到今天，
 *       用第 2 周可以稳定测任意一天。
 */
(function () {
  'use strict';

  const R = [];
  let SC = '';
  const log = [];
  function scenario(name) { SC = name; }
  function t(name, cond, detail) {
    R.push({ scenario: SC, test: name, pass: !!cond, detail: detail === undefined ? '' : String(detail) });
  }
  function hist(fn) { return (s().pointsHistory || []).filter(fn || (() => true)); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function inv(label) {
    const pc = pointsConsistent(s());
    t(label + ' · 总积分=流水之和', pc.ok, `points=${pc.points} sum=${pc.sum} diff=${pc.diff}`);
    return pc;
  }

  // ---------- UI 驱动 ----------
  function setView(wi, di) { currentWeek = wi + 1; currentDay = di; renderHome(); }
  function card(wi, di, ti) { return document.getElementById('tc-' + wi + '-' + di + '-' + ti); }
  function clickCheck(wi, di, ti) {
    if (currentWeek !== wi + 1 || currentDay !== di) setView(wi, di);
    const c = card(wi, di, ti);
    if (!c) throw new Error(`找不到任务卡 ${wi}-${di}-${ti}`);
    c.querySelector('.ck').click();   // 真实勾选路径 toggleAndRender()
    renderHome();                     // 立刻刷新，跳过 100ms 定时器
  }
  function clickSkip(wi, di, ti, times) {
    if (currentWeek !== wi + 1 || currentDay !== di) setView(wi, di);
    const c = card(wi, di, ti);
    if (!c) throw new Error(`找不到任务卡 ${wi}-${di}-${ti}`);
    const b = c.querySelector('.skip-btn');
    if (!b) throw new Error(`任务 ${wi}-${di}-${ti} 上没有跳过按钮`);
    const n = times || 1;
    for (let i = 0; i < n; i++) b.click();   // 同一个 DOM 按钮连点 = 双击
    renderHome();
  }
  function tasksOf(wi, di) { return PLAN.weeks[wi].days[di].tasks; }
  function ptsOf(wi, di, ti) { return POINTS[tasksOf(wi, di)[ti].level] || 10; }
  function firstA(wi, di) { return tasksOf(wi, di).findIndex(x => x.level === 'A'); }

  // ---------- 状态夹具 ----------
  function newChild(id, name) {
    const c = JSON.parse(JSON.stringify(DEFAULT_CHILD));
    c.id = id; c.name = name || id;
    c.earnedBadges = BADGES_DEF.map(b => b.id); // 测试期间屏蔽勋章加分，便于精确断言
    c.v4 = { skipped: {}, skipStreak: {}, lastSkipDate: {}, reviewQueue: {}, reviewDone: {}, challenges: {} };
    return c;
  }
  function install(children) {
    localStorage.removeItem(STORE_KEY);
    app = { version: 3, activeChild: 'c1', children: children };
    saveApp();
    setView(1, 0);
  }
  function freshOneKid() { install({ c1: newChild('c1', '测试一号') }); }
  function freshTwoKids() { install({ c1: newChild('c1', '测试一号'), c2: newChild('c2', '测试二号') }); }
  function earnAtLeast(wi, di, need) {
    const n = tasksOf(wi, di).length;
    for (let ti = 0; ti < n && s().points < need; ti++) clickCheck(wi, di, ti);
  }

  // ================= 场景 =================
  function s01() {
    scenario('01 打卡与撤销打卡');
    freshOneKid();
    clickCheck(1, 0, 0);
    t('打卡后得到该任务分值', s().points === ptsOf(1, 0, 0), `points=${s().points} 期望=${ptsOf(1, 0, 0)}`);
    t('流水 1 条且带 task key', hist().length === 1 && hist()[0].key === 'task:1-0-0', JSON.stringify(hist()[0]));
    t('任务标记为完成', isDone(1, 0, 0) === true);
    clickCheck(1, 0, 0);
    t('撤销后回到 0 分', s().points === 0, `points=${s().points}`);
    t('撤销后流水清零', hist().length === 0, `len=${hist().length}`);
    t('撤销后任务未完成', isDone(1, 0, 0) === false);
    t('撤销后 totalDone 回 0', s().totalDone === 0, `totalDone=${s().totalDone}`);
    inv('01');
  }

  function s02() {
    scenario('02 同名同分值任务不误删别的记录（关键回归）');
    freshOneKid();
    // 找两个不同天、标题与等级都相同的任务
    let pair = null;
    const d0 = tasksOf(1, 0);
    for (let ti = 0; ti < d0.length && !pair; ti++) {
      for (let dj = 1; dj < 7 && !pair; dj++) {
        const j = tasksOf(1, dj).findIndex(x => x.title === d0[ti].title && x.level === d0[ti].level);
        if (j >= 0) pair = { ai: ti, dj: dj, aj: j, title: d0[ti].title, level: d0[ti].level };
      }
    }
    t('计划表里确实存在同名任务', !!pair, pair ? `第0天#${pair.ai} 与 第${pair.dj}天#${pair.aj}（${pair.level}级）` : '未找到');
    if (!pair) return;
    clickCheck(1, 0, pair.ai);
    clickCheck(1, pair.dj, pair.aj);
    const two = ptsOf(1, 0, pair.ai) + ptsOf(1, pair.dj, pair.aj);
    t('两天都打卡后积分为两者之和', s().points === two, `points=${s().points} 期望=${two}`);
    clickCheck(1, pair.dj, pair.aj); // 只撤销第 dj 天那条
    t('撤销只扣掉对应任务的分', s().points === ptsOf(1, 0, pair.ai), `points=${s().points}`);
    t('另一天的同名任务仍是已完成', isDone(1, 0, pair.ai) === true);
    t('被撤销的任务已完成标记已清除', isDone(1, pair.dj, pair.aj) === false);
    t('流水只剩另一天那条', hist().length === 1 && hist()[0].key === `task:1-0-${pair.ai}`, JSON.stringify(hist()));
    inv('02');
  }

  function s03() {
    scenario('03 跳过扣分与重复点击');
    freshOneKid();
    const ai = firstA(1, 0);
    clickSkip(1, 0, ai, 2); // 连点两次
    t('跳过只扣一次（5分）', s().points === -5, `points=${s().points}`);
    t('只有 1 条扣分记录', hist(x => String(x.text).startsWith('跳过')).length === 1, JSON.stringify(hist()));
    t('扣分记录带 skip key', hist().length === 1 && hist()[0].key === `skip:1-0-${ai}`, JSON.stringify(hist()));
    t('跳过不等于完成', isDone(1, 0, ai) === false);
    inv('03');
  }

  function s04() {
    scenario('04 取消跳过 = 退回积分 + 删除扣分记录');
    freshOneKid();
    const ai = firstA(1, 0);
    clickCheck(1, 0, 1); // 先有点余额，便于看清数字
    const before = s().points, nBefore = hist().length;
    clickSkip(1, 0, ai);
    t('跳过扣 5 分', s().points === before - 5, `points=${s().points}`);
    clickSkip(1, 0, ai); // 按钮已变成“取消跳过”
    t('取消跳过退回 5 分（余额复原）', s().points === before, `points=${s().points} before=${before}`);
    t('扣分记录被删除', hist().length === nBefore && !hist().some(x => String(x.text).startsWith('跳过')), JSON.stringify(hist()));
    t('skipped 标记已清除', !s().v4.skipped[`1-0-${ai}`]);
    inv('04 · 取消跳过');
    // 连点“取消跳过”两次（同一个按钮节点）：第二次必须什么都不做
    clickSkip(1, 0, ai); // 重新跳过，取得“取消跳过”按钮
    setView(1, 0);
    const ub = card(1, 0, ai).querySelector('.skip-btn.unskip');
    t('按钮已切换为“取消跳过”', !!ub && ub.textContent === '取消跳过', ub ? ub.textContent : '无按钮');
    const p2 = s().points;
    if (ub) { ub.click(); ub.click(); }
    renderHome();
    t('连点“取消跳过”只退一次分', s().points === p2 + 5, `points=${s().points} 期望=${p2 + 5}`);
    t('连点后没有残留扣分记录', hist(x => String(x.text).startsWith('跳过')).length === 0, JSON.stringify(hist()));
    inv('04 · 双击取消跳过');
  }

  function s05() {
    scenario('05 连续3天跳过的额外扣分也随取消跳过一并退回');
    freshOneKid();
    const ai = firstA(1, 0);
    const mod = tasksOf(1, 0)[ai].module;
    // 伪造“昨天也跳过、连跳2天、今天再来一次”的状态
    s().v4.lastSkipDate[mod] = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    s().v4.skipStreak[mod] = 2;
    clickCheck(1, 0, 1);
    const before = s().points;
    clickSkip(1, 0, ai);
    t('跳过+连续3天共扣 10 分', s().points === before - 10, `points=${s().points} before=${before}`);
    t('单次扣分与连跳罚分各 1 条、key 分开记账', hist(x => x.key === `skip:1-0-${ai}`).length === 1 && hist(x => x.key === `skip3:1-0-${ai}`).length === 1, JSON.stringify(hist().map(x => x.key)));
    t('连跳计数到 3', s().v4.skipStreak[mod] === 3, `=${s().v4.skipStreak[mod]}`);
    clickSkip(1, 0, ai);
    t('取消跳过把 10 分全部退回', s().points === before, `points=${s().points}`);
    t('2 条扣分记录都被删除', hist(x => /^skip3?:/.test(String(x.key || ''))).length === 0, JSON.stringify(hist().map(x => x.key)));
    t('连跳计数回退到 2', s().v4.skipStreak[mod] === 2, `=${s().v4.skipStreak[mod]}`);
    inv('05');
  }

  function s06() {
    scenario('06 复习：重复点击不重复加分、条目不错位');
    freshOneKid();
    const td = today();
    s().v4.reviewQueue[td] = [
      { wk: 0, dy: 0, ti: 0, module: '阅读', title: '复习测试条目甲', scheduled: td },
      { wk: 0, dy: 1, ti: 1, module: '数学', title: '复习测试条目乙', scheduled: td },
    ];
    setView(1, 0);
    let sec = document.getElementById('reviewSection');
    t('今日复习区已注入', !!sec);
    if (!sec) return;
    let btns = sec.querySelectorAll('.rev-done');
    t('渲染出 2 张复习卡', btns.length === 2, `len=${btns.length}`);
    btns[0].click(); btns[0].click(); // 连点两次
    t('重复点击只加一次 5 分', s().points === 5, `points=${s().points}`);
    t('加分记录 1 条且是“甲”', hist().length === 1 && hist()[0].text.includes('甲'), JSON.stringify(hist()));
    t('流水 key 是 rev:rev_0_0_0', hist()[0].key === 'rev:rev_0_0_0', JSON.stringify(hist()[0]));
    renderHome(); // 重排后剩下的“乙”变成第 1 张卡（旧代码按下标取条目会错位成“甲”）
    sec = document.getElementById('reviewSection');
    btns = sec ? sec.querySelectorAll('.rev-done') : [];
    t('重排后只剩 1 张复习卡', btns.length === 1, `len=${btns.length}`);
    if (btns.length) btns[0].click();
    t('第二张卡加的分记在“乙”上', hist(x => x.key === 'rev:rev_0_1_1').length === 1 && hist(x => x.key === 'rev:rev_0_1_1')[0].text.includes('乙'), JSON.stringify(hist()));
    t('两条复习流水共 +10', hist(x => x.points === '+5').length === 2 && s().points === 10, `points=${s().points}`);
    inv('06');
  }

  function s07() {
    scenario('07 周挑战：达成一次、撤销不重复发');
    freshOneKid();
    for (let dj = 0; dj <= 2; dj++) {
      const n = tasksOf(1, dj).length;
      for (let ti = 0; ti < n; ti++) clickCheck(1, dj, ti); // 第2周前3天全部完成 → perfect3
    }
    const ch = s().v4.challenges['2'];
    t('本周挑战类型是“完美三天”', ch && ch.type === 'perfect3', JSON.stringify(ch));
    t('挑战已达成', !!ch && ch.achieved === true);
    t('挑战奖励只发一次（+150）', hist(x => x.key === 'chal:2:perfect3').length === 1, JSON.stringify(hist(x => String(x.key || '').startsWith('chal'))));
    inv('07 · 达成');
    clickCheck(1, 0, 0); // 撤销一个任务
    t('撤销后不重复发挑战奖励', hist(x => x.key === 'chal:2:perfect3').length === 1);
    t('挑战进度随撤销下降', s().v4.challenges['2'].progress === 2, `progress=${s().v4.challenges['2'].progress}`);
    inv('07 · 撤销后');
    const raw = JSON.parse(localStorage.getItem(STORE_KEY));
    t('挑战进度已落盘（刷新不丢）', raw.children.c1.v4.challenges['2'].progress === 2, JSON.stringify(raw.children.c1.v4.challenges));
  }

  function s08() {
    scenario('08 全勤一天 +30 不重复领');
    freshOneKid();
    const n = tasksOf(1, 0).length;
    for (let ti = 0; ti < n; ti++) clickCheck(1, 0, ti);
    t('全勤奖励 1 条', hist(x => x.key === 'allin:1-0').length === 1, JSON.stringify(hist().slice(0, 3)));
    t('perfectDays=1', s().perfectDays === 1, `=${s().perfectDays}`);
    inv('08 · 全勤');
    clickCheck(1, 0, 0);
    t('撤销后全勤奖励被收回', hist(x => x.key === 'allin:1-0').length === 0, JSON.stringify(hist(x => x.key === 'allin:1-0')));
    t('perfectDays 回到 0', s().perfectDays === 0, `=${s().perfectDays}`);
    inv('08 · 撤销后');
    clickCheck(1, 0, 0);
    t('重新完成后全勤奖励仍只有 1 条', hist(x => x.key === 'allin:1-0').length === 1);
    t('perfectDays 回到 1', s().perfectDays === 1);
    inv('08 · 重新完成');
  }

  function s09() {
    scenario('09 连续7天奖励只发一次（原来当天每打一个勾都发）');
    freshOneKid();
    s().streak = 7; s().lastDate = today();
    for (let ti = 0; ti < 3; ti++) clickCheck(1, 0, ti);
    t('7天奖励只有 1 条', hist(x => x.key === 'streak:7').length === 1, JSON.stringify(hist().map(x => x.text)));
    inv('09');
  }

  function s10() {
    scenario('10 兑换奖励与积分不足');
    freshOneKid();
    earnAtLeast(1, 0, 90);
    const before = s().points;
    redeemReward('r1'); // 30 分
    t('兑换扣 30 分', s().points === before - 30, `points=${s().points}`);
    t('兑换流水 1 条', hist(x => String(x.text).includes('兑换')).length === 1);
    inv('10 · 兑换后');
    redeemReward('r5'); // 500 分，余额不足
    t('积分不足时不扣分', s().points === before - 30, `points=${s().points}`);
    t('积分不足时不产生流水', hist(x => String(x.text).includes('游乐园')).length === 0);
    inv('10 · 不足');
    // 同一毫秒内连点两次兑换：两条流水 key 必须不同（曾经撞成同一条 key）
    const n = hist().length;
    redeemReward('r1'); redeemReward('r1');
    const recs = hist(x => String(x.text).includes('兑换')).slice(0, 2);
    t('连点两次兑换扣 60 分', s().points === before - 30 - 60, `points=${s().points}`);
    t('连点两次兑换产生两条不同 key 的流水', recs.length === 2 && recs[0].key !== recs[1].key, JSON.stringify(recs.map(x => x.key)));
    t('兑换流水共 3 条', hist().length === n + 2, `${hist().length} vs ${n + 2}`);
    inv('10 · 连点兑换');
  }

  function s11() {
    scenario('11 刷新持久化（内存 vs localStorage）');
    freshOneKid();
    clickCheck(1, 0, 0);
    clickSkip(1, 0, 1);
    const raw = JSON.parse(localStorage.getItem(STORE_KEY));
    const rc = raw.children.c1;
    t('积分已落盘', rc.points === s().points, `${rc.points} vs ${s().points}`);
    t('积分流水已落盘', JSON.stringify(rc.pointsHistory) === JSON.stringify(s().pointsHistory));
    t('打卡标记已落盘', rc.tasks['1-0-0'] === true);
    t('跳过标记已落盘', rc.v4.skipped['1-0-1'] === true);
    t('localStorage 里没有 token 类字段', !/token|ghp_|pat/i.test(localStorage.getItem(STORE_KEY)), '');
    inv('11');
  }

  function s12() {
    scenario('12 两个孩子数据隔离');
    freshTwoKids();
    clickCheck(1, 0, 0);
    clickSkip(1, 0, 1);
    const c1snap = JSON.stringify(s());
    const c1points = s().points;
    app.activeChild = 'c2'; saveApp(); setView(1, 0);
    t('切到 c2 后积分是 c2 自己的（0）', s().points === 0, `points=${s().points}`);
    t('c2 看不到 c1 的打卡', isDone(1, 0, 0) === false);
    t('c2 看不到 c1 的跳过', !s().v4.skipped['1-0-1']);
    clickCheck(1, 0, 0);
    clickSkip(1, 0, 1);
    t('c2 独立记分', s().points === ptsOf(1, 0, 0) - 5, `points=${s().points}`);
    inv('12 · c2');
    app.activeChild = 'c1'; saveApp(); setView(1, 0);
    t('切回 c1 数据未被污染', JSON.stringify(s()) === c1snap, `c1points=${c1points}`);
    inv('12 · c1');
    app.activeChild = 'c2';
    t('同一时刻两个孩子各自一致', pointsConsistent(s()).ok);
    app.activeChild = 'c1';
    renderSettings();
    t('设置页孩子档案显示 2 个', document.querySelectorAll('#childList .child-card').length === 2, `len=${document.querySelectorAll('#childList .child-card').length}`);
  }

  function s13() {
    scenario('13 勋章加分也走同一入口');
    freshOneKid();
    s().earnedBadges = []; // 本场景放开勋章
    clickCheck(1, 0, 0);
    const b = hist(x => String(x.key || '').startsWith('badge:'));
    t('第一枚勋章有加分流水', b.length >= 1, JSON.stringify(b));
    t('勋章流水带 badge key', b.length >= 1 && b.every(x => /^badge:/.test(x.key)));
    inv('13');
  }

  function s14() {
    scenario('14 余额为负时也能正常显示');
    freshOneKid();
    clickSkip(1, 0, firstA(1, 0)); // 0 分 → -5
    renderBadges();
    t('积分显示 -5', document.getElementById('pbPoints').textContent === '-5', document.getElementById('pbPoints').textContent);
    t('给出“欠分”提示', document.querySelector('.points-banner .pb-label').textContent.includes('欠 5 分'), document.querySelector('.points-banner .pb-label').textContent);
    inv('14');
  }

  function s15() {
    scenario('15 花掉积分后撤销打卡仍然一致');
    freshOneKid();
    earnAtLeast(1, 0, 30);
    redeemReward('r1');
    const bal = s().points;
    clickCheck(1, 0, 0); // 撤销一个已完成任务：余额可能被扣成负数
    t('撤销按流水原值扣回（余额可负）', s().points === bal - ptsOf(1, 0, 0), `points=${s().points} bal=${bal}`);
    inv('15');
  }

  function s16() {
    scenario('16 旧数据（无 key 的流水）撤销兜底');
    freshOneKid();
    const task = tasksOf(1, 0)[0], p = ptsOf(1, 0, 0);
    // 模拟旧版本留下的数据：已完成、流水没有 key
    s().tasks['1-0-0'] = true;
    s().points = p;
    s().pointsHistory = [{ time: Date.now() - 5000, text: `完成 ${task.module}·${task.title.slice(0, 15)}`, points: `+${p}` }];
    clickCheck(1, 0, 0); // 取消完成 → 走兜底匹配
    t('旧流水被兜底删除', s().pointsHistory.length === 0, JSON.stringify(s().pointsHistory));
    t('余额回到 0', s().points === 0, `points=${s().points}`);
    inv('16');
  }

  function s17() {
    scenario('17 旧数据兜底只能删一条（同名记录不被一次清空）');
    freshOneKid();
    const task = tasksOf(1, 0)[0], p = ptsOf(1, 0, 0);
    // 同名同分值的两条旧记录（旧版没有 key，只能靠文字匹配）
    s().tasks['1-0-0'] = true;
    s().points = p * 2;
    s().pointsHistory = [
      { time: Date.now() - 1000, text: `完成 ${task.module}·${task.title.slice(0, 15)}`, points: `+${p}` },
      { time: Date.now() - 5000, text: `完成 ${task.module}·${task.title.slice(0, 15)}`, points: `+${p}` },
    ];
    clickCheck(1, 0, 0);
    t('只删掉最近一条旧记录', s().pointsHistory.length === 1, JSON.stringify(s().pointsHistory));
    t('余额只扣回一条的分', s().points === p, `points=${s().points}`);
    inv('17');
  }

  function s18() {
    scenario('18 存储不可用（隐私模式/空间满）时打卡不崩、内存状态仍正确');
    freshOneKid();
    // 用 defineProperty 打桩，跑完 delete 掉临时属性：直接赋值会给 localStorage 留下
    // own property（Object.keys(localStorage) 会多出 'setItem'），污染后续检查。
    Object.defineProperty(localStorage, 'setItem', { value: () => { throw new Error('QuotaExceededError'); }, configurable: true, writable: true });
    let threw = null;
    try {
      clickCheck(1, 0, 0);
      clickSkip(1, 0, 1);
    } catch (e) { threw = String(e && e.message || e); }
    delete localStorage.setItem;
    t('打卡/跳过没有把异常抛到界面上', threw === null, threw);
    t('setItem 打桩已完全撤掉（原型方法恢复）', Object.keys(localStorage).indexOf('setItem') === -1, JSON.stringify(Object.keys(localStorage)));
    const p0 = ptsOf(1, 0, 0), pen = Math.min(ptsOf(1, 0, 1), 5);
    t('内存里的积分仍然正确', s().points === p0 - pen, `points=${s().points} 期望=${p0 - pen}`);
    t('内存里的流水仍然正确', hist().length === 2, JSON.stringify(hist()));
    inv('18');
  }

  function s19() {
    scenario('19 默认档案改名迁移：只做一次、不动其他孩子');
    freshOneKid();
    const OLD = String.fromCharCode(0x5218, 0x8bd7, 0x5189); // 老版本写死的姓名（码点拼，避免把名字写回仓库）
    const a = {
      version: 3, activeChild: 'shiran',
      children: {
        shiran: Object.assign(JSON.parse(JSON.stringify(DEFAULT_CHILD)), { name: OLD }),
        c2: { id: 'c2', name: '测试二号' },
      },
    };
    const changed = migrateDefaultChildName(a);
    t('默认档案被改名成新名字', changed === true && a.children.shiran.name === DEFAULT_CHILD.name, `name=${a.children.shiran.name}`);
    t('其他孩子档案不受影响', a.children.c2.name === '测试二号', `name=${a.children.c2.name}`);
    t('只执行一次（第二次不再改）', migrateDefaultChildName(a) === false);
    t('迁移标志已写入', a.nameMigratedV1 === true);
    inv('19');
  }

  // ================= 运行 =================
  function runLogicTests() {
    R.length = 0; log.length = 0;
    const scenarios = [s01, s02, s03, s04, s05, s06, s07, s08, s09, s10, s11, s12, s13, s14, s15, s16, s17, s18, s19];
    scenarios.forEach(fn => {
      try { fn(); }
      catch (e) {
        t('场景抛错', false, (e && e.message) || String(e));
        console.error('[logic.test] 场景失败', SC, e);
      }
    });
    // 收尾：恢复一个干净的单孩子库，避免把测试数据留给用户
    localStorage.removeItem(STORE_KEY);
    const pass = R.filter(x => x.pass).length;
    const summary = {
      total: R.length, pass: pass, fail: R.length - pass,
      failed: R.filter(x => !x.pass).map(x => `${x.scenario} → ${x.test} (${x.detail})`),
    };
    console.log('[logic.test]', summary);
    return { results: R, summary: summary };
  }

  window.runLogicTests = runLogicTests;
  window.__lastLogicTestSummary = null;
})();
