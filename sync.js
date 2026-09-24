/* ===== 云端同步模块 ===== */
/* 通过 GitHub API 读写 sync_data.json 实现多设备同步 */

const SYNC_CONFIG = {
  // Token 不硬编码在代码里，运行时从 localStorage 读取（首次输入后记住）
  get token() { return localStorage.getItem('shiran_sync_token') || ''; },
  set token(v) { localStorage.setItem('shiran_sync_token', v); },
  owner: 'a13005719920-oss',
  repo: 'shiran-growth',
  branch: 'main',
  path: 'sync_data.json',
  apiBase: 'https://api.github.com/repos/a13005719920-oss/shiran-growth/contents/sync_data.json',
  rawUrl: 'https://raw.githubusercontent.com/a13005719920-oss/shiran-growth/main/sync_data.json',
};

let syncSha = null;       // 当前文件的 GitHub SHA，用于更新时冲突检测
let syncTimer = null;     // 防抖定时器
let isSyncing = false;    // 防止并发同步

// 同步状态指示器（注入到页面右上角）
function initSyncIndicator() {
  const el = document.createElement('div');
  el.id = 'syncIndicator';
  el.style.cssText = 'position:fixed;top:8px;right:12px;z-index:500;font-size:12px;color:rgba(255,255,255,.6);display:flex;align-items:center;gap:4px;pointer-events:none';
  el.innerHTML = '<span id="syncIcon">⏳</span><span id="syncText">同步中…</span>';
  document.body.appendChild(el);
}

// Token 输入弹窗（首次使用时）
function ensureToken() {
  if (SYNC_CONFIG.token) return Promise.resolve(true);
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:28px;max-width:340px;width:90%;text-align:center">
        <div style="font-size:40px;margin-bottom:8px">☁️</div>
        <div style="font-size:18px;font-weight:700;color:#2D7A5F;margin-bottom:6px">首次同步设置</div>
        <div style="font-size:13px;color:#666;margin-bottom:16px;line-height:1.5">输入同步密钥，开启多设备数据同步。<br>只需输入一次，之后自动记住。</div>
        <input id="tokenInput" type="password" placeholder="粘贴同步密钥（github_pat_开头）" style="width:100%;padding:12px;border-radius:10px;border:1px solid #ddd;font-size:14px;text-align:center;outline:none;margin-bottom:12px;box-sizing:border-box" onkeydown="if(event.key==='Enter'){document.getElementById('tokenBtn').click()}">
        <button id="tokenBtn" style="width:100%;padding:12px;border-radius:10px;background:#2D7A5F;color:#fff;font-size:16px;font-weight:700;border:none;cursor:pointer">开启同步</button>
        <div id="tokenErr" style="color:#e53e3e;font-size:13px;margin-top:8px;display:none">密钥无效，请检查后重试</div>
      </div>`;
    document.body.appendChild(overlay);
    const btn = overlay.querySelector('#tokenBtn');
    const input = overlay.querySelector('#tokenInput');
    const err = overlay.querySelector('#tokenErr');
    input.focus();
    btn.onclick = async () => {
      const v = input.value.trim();
      if (!v.startsWith('github_pat_')) { err.style.display = 'block'; return; }
      // 验证 token
      try {
        const res = await fetch(`https://api.github.com/repos/${SYNC_CONFIG.owner}/${SYNC_CONFIG.repo}/contents/sync_data.json`, {
          headers: { 'Authorization': `Bearer ${v}`, 'Accept': 'application/vnd.github+json' }
        });
        if (!res.ok) throw new Error();
        SYNC_CONFIG.token = v;
        overlay.remove();
        resolve(true);
      } catch {
        err.style.display = 'block';
        err.textContent = '密钥验证失败，请检查';
      }
    };
    // 不立即 resolve，等用户输入
  });
}

// 在 Token 就绪后自动拉取
async function initSync() {
  initSyncIndicator();
  if (!SYNC_CONFIG.token) {
    setSyncStatus('🔒', '需设置');
    await ensureToken(); // 等待用户输入 token
    if (!SYNC_CONFIG.token) return; // 用户没输入
  }
  setSyncStatus('⏳', '同步中…');
  await pullAndMerge();
  startAutoPull();
}

function setSyncStatus(icon, text) {
  const ic = document.getElementById('syncIcon');
  const tx = document.getElementById('syncText');
  if (ic) ic.textContent = icon;
  if (tx) tx.textContent = text;
}

// 从云端拉取数据
async function pullFromCloud() {
  try {
    setSyncStatus('⏳', '同步中…');
    const res = await fetch(`${SYNC_CONFIG.apiBase}?ref=${SYNC_CONFIG.branch}`, {
      headers: {
        'Authorization': `Bearer ${SYNC_CONFIG.token}`,
        'Accept': 'application/vnd.github+json',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    syncSha = data.sha;
    // 修复：atob 不支持 UTF-8 中文，用 TextDecoder 正确解码
    const binary = atob(data.content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const content = JSON.parse(new TextDecoder('utf-8').decode(bytes));
    setSyncStatus('☁️', '已同步');
    return content;
  } catch (e) {
    setSyncStatus('⚠️', '同步失败');
    console.warn('pull failed:', e);
    return null;
  }
}

// 推送数据到云端（带防抖 + 自动重试）
function pushToCloud(data) {
  if (isSyncing) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    isSyncing = true;
    setSyncStatus('⏳', '上传中…');
    try {
      const content = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
      const res = await fetch(SYNC_CONFIG.apiBase, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${SYNC_CONFIG.token}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `打卡更新 by ${navigator.userAgent.includes('iPhone') ? '爸爸' : '设备'} ${new Date().toISOString().slice(0,16)}`,
          content: content,
          sha: syncSha,
          branch: SYNC_CONFIG.branch,
        }),
      });
      if (res.ok) {
        const r = await res.json();
        syncSha = r.content.sha;
        setSyncStatus('☁️', '已同步');
      } else if (res.status === 409) {
        // SHA 冲突：对方刚改过，先拉取再重试
        await pullAndMerge();
        syncSha = null;
        await pullFromCloud();
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (e) {
      setSyncStatus('⚠️', '同步失败');
      console.warn('push failed:', e);
      // 失败后30秒重试
      setTimeout(() => pushToCloud(data), 30000);
    } finally {
      isSyncing = false;
    }
  }, 2000); // 2秒防抖：连续打卡只推一次
}

// 智能合并：云端优先，但保留本地独有的打卡
function mergeData(localApp, cloudData) {
  if (!cloudData || !cloudData.children) return localApp;

  const cloud = cloudData;
  const merged = JSON.parse(JSON.stringify(localApp));

  for (const childId of Object.keys(merged.children)) {
    const localChild = merged.children[childId];
    const cloudChild = cloud.children[childId];
    if (!cloudChild) continue;

    // tasks：合并双方的打卡（取并集）
    const mergedTasks = { ...cloudChild.tasks || {} };
    if (localChild.tasks) {
      for (const k of Object.keys(localChild.tasks)) {
        if (localChild.tasks[k]) mergedTasks[k] = true;
      }
    }
    localChild.tasks = mergedTasks;

    // points：取较大值（避免互相覆盖导致积分回退）
    localChild.points = Math.max(localChild.points || 0, cloudChild.points || 0);
    localChild.totalDone = Math.max(localChild.totalDone || 0, cloudChild.totalDone || 0);
    localChild.activeDays = Math.max(localChild.activeDays || 0, cloudChild.activeDays || 0);
    localChild.maxStreak = Math.max(localChild.maxStreak || 0, cloudChild.maxStreak || 0);
    localChild.streak = Math.max(localChild.streak || 0, cloudChild.streak || 0);
    localChild.lastDate = localChild.lastDate > (cloudChild.lastDate || '') ? localChild.lastDate : (cloudChild.lastDate || localChild.lastDate);
    localChild.perfectDays = Math.max(localChild.perfectDays || 0, cloudChild.perfectDays || 0);
    localChild.perfectWeeks = Math.max(localChild.perfectWeeks || 0, cloudChild.perfectWeeks || 0);

    // records：合并
    if (cloudChild.records) {
      localChild.records = { ...cloudChild.records, ...(localChild.records || {}) };
    }
    // reviews：合并
    if (cloudChild.reviews) {
      localChild.reviews = { ...cloudChild.reviews, ...(localChild.reviews || {}) };
    }
    // health：合并
    if (cloudChild.health) {
      localChild.health = { ...cloudChild.health, ...(localChild.health || {}) };
    }
    // earnedBadges：取并集
    const cloudBadges = cloudChild.earnedBadges || [];
    const localBadges = localChild.earnedBadges || [];
    const badgeSet = new Set([...localBadges, ...cloudBadges]);
    localChild.earnedBadges = [...badgeSet];

    // moduleDone：取较大值
    if (cloudChild.moduleDone) {
      for (const m of Object.keys(cloudChild.moduleDone)) {
        localChild.moduleDone[m] = Math.max(localChild.moduleDone[m] || 0, cloudChild.moduleDone[m] || 0);
      }
    }
    // weeksComplete：取并集
    if (cloudChild.weeksComplete) {
      for (const w of Object.keys(cloudChild.weeksComplete)) {
        if (cloudChild.weeksComplete[w]) localChild.weeksComplete[w] = true;
      }
    }

    // pointsHistory：合并去重（按 time+text）
    const cloudHistory = cloudChild.pointsHistory || [];
    const localHistory = localChild.pointsHistory || [];
    const histSet = new Map();
    [...cloudHistory, ...localHistory].forEach(h => {
      const key = `${h.time}_${h.text}`;
      if (!histSet.has(key)) histSet.set(key, h);
    });
    localChild.pointsHistory = [...histSet.values()]
      .sort((a, b) => b.time - a.time)
      .slice(0, 100);

    // rewards：保留本地（用户可能自定义）
    if (!localChild.rewards || localChild.rewards.length === 0) {
      localChild.rewards = cloudChild.rewards || localChild.rewards;
    }
  }

  return merged;
}

// 启动时拉取云端数据并与本地合并
async function pullAndMerge() {
  const cloudData = await pullFromCloud();
  if (cloudData && cloudData.children) {
    app = mergeData(app, cloudData);
    localStorage.setItem(STORE_KEY, JSON.stringify(app));
    if (typeof renderAll === 'function') renderAll();
    setSyncStatus('☁️', '已同步');
  }
}

// 定时拉取（每30秒检查一次云端有没有新数据）
function startAutoPull() {
  setInterval(async () => {
    if (isSyncing) return;
    const cloudData = await pullFromCloud();
    if (cloudData && cloudData.children) {
      const oldApp = JSON.stringify(app);
      app = mergeData(app, cloudData);
      if (JSON.stringify(app) !== oldApp) {
        localStorage.setItem(STORE_KEY, JSON.stringify(app));
        if (typeof renderAll === 'function') renderAll();
      }
    }
  }, 30000);
}
