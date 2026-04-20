import { call, tokens, onTokenChange, stringify } from './api.js';

const $ = (sel) => document.querySelector(sel);
const val = (id) => document.getElementById(id).value.trim();
const num = (id) => {
  const v = val(id);
  return v === '' ? undefined : Number(v);
};
const checked = (id) => document.getElementById(id).checked;

function show(key, data) {
  const el = document.querySelector(`[data-out="${key}"]`);
  if (!el) return;
  if (typeof data === 'string') {
    el.textContent = data;
  } else {
    el.textContent = stringify(data);
  }
}

// Base URL 표시. 개발은 vite proxy, 배포는 nginx reverse proxy 가 /api → 백엔드.
(function initBaseDisplay() {
  const label = location.hostname === 'localhost'
    ? 'vite dev proxy → /api'
    : `${location.origin} (nginx → api.dev.gakhalmo.klr.kr)`;
  document.getElementById('base-url').textContent = label;
})();

// 세션 토큰 패널 자동 갱신
onTokenChange(() => {
  const a = tokens.access();
  document.getElementById('tok-access').textContent =
    a ? a.slice(0, 24) + '...(' + a.length + '자)' : '(없음)';
});

// 모임 날짜 기본값: 오늘 + 7일
(function initDefaults() {
  const d = new Date(); d.setDate(d.getDate() + 7);
  const iso = d.toISOString().slice(0, 10);
  const set = (id) => { const el = document.getElementById(id); if (el && !el.value) el.value = iso; };
  set('mc-date');
  set('dc-date');
})();

// === 단일 이벤트 위임 ===
document.body.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  e.preventDefault();
  const action = btn.dataset.action;
  try {
    await handle(action, btn);
  } catch (err) {
    console.error(err);
    show('auth', `ERROR: ${err.message || err}`);
  }
});

async function handle(action, btn) {
  switch (action) {
    // ============ Auth ============
    case 'logout':
      tokens.clear();
      document.getElementById('tok-me').textContent = '(/me 눌러서 확인)';
      return;

    case 'auth-register': {
      const r = await call('POST', '/api/v1/auth/register', {
        auth: false,
        body: { email: val('reg-email'), password: val('reg-pw'), name: val('reg-name') },
      });
      return show('auth', r);
    }

    case 'auth-login': {
      const r = await call('POST', '/api/v1/auth/login', {
        auth: false,
        body: { email: val('login-email'), password: val('login-pw') },
      });
      if (r.ok) tokens.set(r.body.access_token, r.body.refresh_token);
      return show('auth', r);
    }

    case 'auth-me': {
      const r = await call('GET', '/api/v1/auth/me');
      if (r.ok) {
        document.getElementById('tok-me').textContent =
          `${r.body.name} · ${r.body.email} · id=${r.body.id}`;
      }
      return show('auth', r);
    }

    case 'auth-refresh': {
      const rt = tokens.refresh();
      if (!rt) return show('auth', 'refresh_token 없음. 먼저 로그인하세요.');
      const r = await call('POST', '/api/v1/auth/refresh', {
        auth: false,
        body: { refresh_token: rt },
      });
      if (r.ok) tokens.set(r.body.access_token, r.body.refresh_token);
      return show('auth', r);
    }

    case 'auth-me-patch': {
      const body = {};
      if (val('me-name')) body.name = val('me-name');
      if (val('me-bio')) body.bio = val('me-bio');
      if (val('me-job')) body.job = val('me-job');
      const tagStr = val('me-tags');
      if (tagStr) body.tags = tagStr.split(',').map(s => s.trim()).filter(Boolean);
      const r = await call('PATCH', '/api/v1/auth/me', { body });
      return show('auth', r);
    }

    case 'auth-google':
      // 리디렉션 흐름은 브라우저 탑레벨 네비게이션이어야 함 (CORS 미적용).
      window.open(location.origin + '/api/v1/auth/google/login', '_blank');
      return show('auth', '새 탭에서 Google OAuth 플로우 확인.');

    // ============ Regions ============
    case 'region-search': {
      const r = await call('GET', '/api/v1/regions/search', {
        auth: false,
        query: { q: val('region-q'), limit: num('region-limit') },
      });
      renderRegionHits(r.ok ? r.body : []);
      return show('region', r);
    }

    case 'region-popular': {
      const r = await call('GET', '/api/v1/regions/popular', { auth: false });
      renderRegionHits(r.ok ? r.body : []);
      return show('region', r);
    }

    case 'region-get': {
      const r = await call('GET', `/api/v1/regions/${num('region-id')}`, { auth: false });
      return show('region', r);
    }

    // ============ Meeting Create ============
    case 'meeting-create': {
      const mode = val('mc-mode');
      const body = {
        title: val('mc-title'),
        mode,
        region_id: mode === 'offline' ? num('mc-region-id') : null,
        location_name: mode === 'offline' ? val('mc-location-name') : null,
        location_address: mode === 'offline' ? val('mc-location-address') : null,
        meeting_date: val('mc-date'),
        meeting_time: val('mc-time'),
        goal: val('mc-goal'),
        max_participants: num('mc-max'),
        description: val('mc-desc') || null,
        is_recurring: checked('mc-recurring'),
        recurrence: null,
      };
      if (body.is_recurring) {
        body.recurrence = {
          frequency: val('mc-freq'),
          end_date: val('mc-end') || null,
        };
      }
      const r = await call('POST', '/api/v1/meetings/', { body });
      if (r.ok) {
        document.getElementById('ml-meeting-id').value = r.body.id;
        document.getElementById('pt-meeting-id').value = r.body.id;
        document.getElementById('pt-host-meeting-id').value = r.body.id;
      }
      return show('meeting-create', r);
    }

    // ============ Meeting List ============
    case 'meeting-list': {
      const r = await call('GET', '/api/v1/meetings/', {
        auth: false,
        query: {
          offset: num('ml-offset'),
          limit: num('ml-limit'),
          mode: val('ml-mode'),
          region_id: num('ml-region-id'),
          goal: val('ml-goal'),
          status: val('ml-status'),
          date_from: val('ml-from'),
          date_to: val('ml-to'),
        },
      });
      renderMeetingCards(r.ok ? r.body : []);
      return show('meeting-list', r);
    }

    case 'meeting-hosted': {
      const r = await call('GET', `/api/v1/meetings/hosted/${val('ml-user-id')}`, {
        auth: false,
        query: { offset: num('ml-offset'), limit: num('ml-limit') },
      });
      renderMeetingCards(r.ok ? r.body : []);
      return show('meeting-list', r);
    }

    case 'meeting-participated': {
      const r = await call('GET', `/api/v1/meetings/participated/${val('ml-user-id')}`, {
        auth: false,
        query: { offset: num('ml-offset'), limit: num('ml-limit') },
      });
      renderMeetingCards(r.ok ? r.body : []);
      return show('meeting-list', r);
    }

    case 'meeting-get': {
      const r = await call('GET', `/api/v1/meetings/${val('ml-meeting-id')}`, { auth: false });
      return show('meeting-list', r);
    }

    case 'meeting-delete-inline': {
      const id = btn.dataset.id;
      if (!confirm(`${id} 삭제?`)) return;
      const r = await call('DELETE', `/api/v1/meetings/${id}`);
      return show('meeting-list', r);
    }

    // ============ Participants ============
    case 'participant-join': {
      const r = await call('POST', `/api/v1/meetings/${val('pt-meeting-id')}/participants`);
      return show('participant', r);
    }

    case 'participant-leave': {
      const r = await call('DELETE', `/api/v1/meetings/${val('pt-meeting-id')}/participants/me`);
      return show('participant', r);
    }

    case 'participant-approve': {
      const r = await call(
        'POST',
        `/api/v1/meetings/${val('pt-host-meeting-id')}/participants/${val('pt-participant-id')}/approve`,
        { body: val('pt-reason') ? { reason: val('pt-reason') } : undefined },
      );
      return show('participant', r);
    }

    case 'participant-reject': {
      const r = await call(
        'POST',
        `/api/v1/meetings/${val('pt-host-meeting-id')}/participants/${val('pt-participant-id')}/reject`,
        { body: val('pt-reason') ? { reason: val('pt-reason') } : undefined },
      );
      return show('participant', r);
    }

    // ============ H. 홈 피드 ============
    case 'feed-mode': {
      designFeed.mode = btn.dataset.val;
      activate(btn, '[data-action="feed-mode"]');
      return loadFeed();
    }
    case 'feed-goal': {
      designFeed.goal = designFeed.goal === btn.dataset.val ? '' : btn.dataset.val;
      activate(btn, '[data-action="feed-goal"]');
      return loadFeed();
    }
    case 'feed-time': {
      designFeed.time = btn.dataset.val;
      activate(btn, '[data-action="feed-time"]');
      return loadFeed();
    }
    case 'feed-region': {
      const id = Number(btn.dataset.id);
      designFeed.regionId = designFeed.regionId === id ? null : id;
      activate(btn, '[data-action="feed-region"]');
      return loadFeed();
    }
    case 'feed-regions-load':
      return loadPopularRegions();
    case 'feed-refresh':
      return loadFeed();
    case 'feed-page':
      designFeed.page += (btn.dataset.val === 'next' ? 1 : -1);
      if (designFeed.page < 1) designFeed.page = 1;
      return loadFeed();

    // ============ I. 모임 상세 ============
    case 'design-detail-load':
      return loadDesignDetail(val('dd-meeting-id'));
    case 'dd-join': {
      const r = await call('POST', `/api/v1/meetings/${val('dd-meeting-id')}/participants`);
      show('design-detail', r);
      if (r.ok) loadDesignDetail(val('dd-meeting-id'));
      return;
    }
    case 'dd-leave': {
      const r = await call('DELETE', `/api/v1/meetings/${val('dd-meeting-id')}/participants/me`);
      show('design-detail', r);
      if (r.ok) loadDesignDetail(val('dd-meeting-id'));
      return;
    }

    // ============ J. 디자인 개설 폼 ============
    case 'dc-mode':
      designCreate.mode = btn.dataset.val;
      activate(btn, '[data-action="dc-mode"]');
      return;
    case 'dc-region':
      designCreate.regionId = Number(btn.dataset.id);
      activate(btn, '[data-action="dc-region"]');
      return;
    case 'dc-goal':
      designCreate.goal = btn.dataset.val;
      activate(btn, '[data-action="dc-goal"]');
      return;
    case 'dc-max':
      designCreate.max = Number(btn.dataset.val);
      activate(btn, '[data-action="dc-max"]');
      return;
    case 'design-create-meeting':
      return submitDesignCreate();

    // ============ K. 마이페이지 ============
    case 'mypage-load':
      return loadMypage();
    case 'mypage-save-profile':
      return saveMypageProfile();
    case 'mypage-add-tag': {
      const t = val('mp-new-tag');
      if (!t) return;
      const tag = t.startsWith('#') ? t : '#' + t;
      const tags = [...(mypageState.me?.tags || [])];
      if (!tags.includes(tag)) tags.push(tag);
      const r = await call('PATCH', '/api/v1/auth/me', { body: { tags } });
      if (r.ok) {
        mypageState.me = r.body;
        document.getElementById('mp-new-tag').value = '';
        renderMyTags();
      }
      show('mypage', r);
      return;
    }
    case 'mypage-remove-tag': {
      const t = btn.dataset.tag;
      const tags = (mypageState.me?.tags || []).filter(x => x !== t);
      const r = await call('PATCH', '/api/v1/auth/me', { body: { tags } });
      if (r.ok) {
        mypageState.me = r.body;
        renderMyTags();
      }
      show('mypage', r);
      return;
    }
    case 'mypage-tab':
      mypageState.tab = btn.dataset.val;
      activate(btn, '[data-action="mypage-tab"]');
      renderMypageMeetings();
      return;

    // ============ L. 알림 ============
    case 'notif-load':
      return loadNotifications();
    case 'notif-mark-read': {
      const id = btn.dataset.id;
      const r = await call('POST', `/api/v1/notifications/${id}/read`);
      show('notif', r);
      if (r.ok) loadNotifications();
      return;
    }
    case 'notif-read-all': {
      const r = await call('POST', '/api/v1/notifications/read-all');
      show('notif', r);
      if (r.ok) loadNotifications();
      return;
    }
    case 'notif-delete': {
      const id = btn.dataset.id;
      const r = await call('DELETE', `/api/v1/notifications/${id}`);
      show('notif', r);
      if (r.ok) loadNotifications();
      return;
    }
    case 'notif-prefs-save': {
      const prefs = {
        participant_pending: checked('pref-pp'),
        new_message: checked('pref-msg'),
        connection_requested: checked('pref-conn'),
        review_requested: checked('pref-review'),
      };
      const r = await call('PATCH', '/api/v1/auth/me', { body: { notification_prefs: prefs } });
      show('notif', r);
      return;
    }

    // ============ M. 회고 & 출석 ============
    case 'review-create': {
      const meetingId = val('rv-meeting-id');
      const body = {
        reviewee_id: val('rv-reviewee'),
        rating: num('rv-rating'),
        content: val('rv-content') || null,
      };
      const r = await call('POST', `/api/v1/meetings/${meetingId}/reviews`, { body });
      return show('review', r);
    }
    case 'review-list': {
      const userId = val('rv-user-id');
      const r = await call('GET', `/api/v1/users/${userId}/reviews`, { auth: false });
      return show('review', r);
    }
    case 'attendance-mark': {
      const meetingId = val('att-meeting-id');
      const userId = val('att-user-id');
      const r = await call('POST', `/api/v1/meetings/${meetingId}/attendance/${userId}`, {
        body: { status: val('att-status') },
      });
      return show('review', r);
    }
    case 'attendance-rate': {
      const userId = val('att-rate-user-id');
      const r = await call('GET', `/api/v1/users/${userId}/attendance-rate`, { auth: false });
      return show('review', r);
    }

    // ============ N. 연결 (Connection) ============
    case 'connect-request': {
      const userId = val('conn-target-user');
      const r = await call('POST', `/api/v1/users/${userId}/connect`);
      return show('connection', r);
    }
    case 'connect-accept': {
      const id = val('conn-id');
      const r = await call('POST', `/api/v1/connections/${id}/accept`);
      return show('connection', r);
    }
    case 'connect-remove': {
      const id = val('conn-id');
      if (!confirm(`connection ${id} 제거?`)) return;
      const r = await call('DELETE', `/api/v1/connections/${id}`);
      return show('connection', r);
    }
    case 'connect-list': {
      const userId = val('conn-list-user');
      const direction = val('conn-direction') || 'followers';
      const statusSel = val('conn-status-filter');
      const q = { direction };
      if (statusSel) q.status = statusSel;
      const r = await call('GET', `/api/v1/users/${userId}/connections`, {
        auth: false,
        query: q,
      });
      return show('connection', r);
    }
    case 'connect-count': {
      const userId = val('conn-list-user');
      const r = await call('GET', `/api/v1/users/${userId}/connections/count`, { auth: false });
      return show('connection', r);
    }

    // ============ O. 채팅 ============
    case 'chat-rooms':
      return loadChatRooms();
    case 'chat-messages': {
      const roomId = val('chat-room-id');
      const r = await call('GET', `/api/v1/chat/rooms/${roomId}/messages`, {
        query: { limit: 50 },
      });
      show('chat', r);
      if (r.ok) renderChatMessages(r.body);
      return;
    }
    case 'chat-send': {
      const roomId = val('chat-room-id');
      const body = { content: val('chat-content') };
      const r = await call('POST', `/api/v1/chat/rooms/${roomId}/messages`, { body });
      show('chat', r);
      if (r.ok) {
        document.getElementById('chat-content').value = '';
        // 즉시 목록 갱신 — WS 미연결 시에도 UI 업데이트.
        const msgs = await call('GET', `/api/v1/chat/rooms/${roomId}/messages`, { query: { limit: 50 } });
        if (msgs.ok) renderChatMessages(msgs.body);
      }
      return;
    }
    case 'chat-read': {
      const roomId = val('chat-room-id');
      const r = await call('POST', `/api/v1/chat/rooms/${roomId}/read`);
      return show('chat', r);
    }
    case 'chat-ws-connect':
      return connectWebSocket();
    case 'chat-ws-disconnect':
      return disconnectWebSocket();
    case 'chat-pick-room':
      // 내부 dom 리스너가 값 세팅. switch 에선 no-op.
      return;

    default:
      console.warn('unknown action', action);
  }
}

// =================== H. 홈 피드 지원 ===================
const designFeed = { mode: '', goal: '', time: '', regionId: null, page: 1, pageSize: 9 };

async function loadPopularRegions() {
  const r = await call('GET', '/api/v1/regions/popular', { auth: false });
  if (!r.ok) return show('feed', r);
  const regions = r.body;

  const feedBox = document.getElementById('feed-region-chips');
  feedBox.innerHTML = '';
  for (const rg of regions) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.action = 'feed-region';
    b.dataset.id = rg.id;
    b.textContent = `#${shortRegion(rg.full_name)}`;
    b.title = `[${rg.id}] ${rg.full_name}`;
    feedBox.appendChild(b);
  }

  const dcBox = document.getElementById('dc-region-chips');
  if (dcBox) {
    dcBox.innerHTML = '';
    for (const rg of regions) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.dataset.action = 'dc-region';
      b.dataset.id = rg.id;
      b.textContent = `#${shortRegion(rg.full_name)}`;
      b.title = `[${rg.id}] ${rg.full_name}`;
      dcBox.appendChild(b);
    }
  }

  show('feed', `/regions/popular 로드 — ${regions.length}건 반영`);
}

function timeBucket(timeStr) {
  const h = Number(String(timeStr).slice(0, 2));
  if (h >= 6 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

async function loadFeed() {
  const query = {
    offset: (designFeed.page - 1) * designFeed.pageSize,
    limit: designFeed.pageSize,
    mode: designFeed.mode,
    region_id: designFeed.regionId || undefined,
    goal: designFeed.goal,
  };
  const r = await call('GET', '/api/v1/meetings/', { auth: false, query });
  const box = document.getElementById('feed-cards');
  box.innerHTML = '';
  let items = r.ok ? r.body : [];
  if (designFeed.time) items = items.filter(m => timeBucket(m.meeting_time) === designFeed.time);

  for (const m of items) {
    const remain = m.max_participants - m.current_participants;
    const card = document.createElement('div');
    card.className = 'design-card';
    card.innerHTML = `
      <div class="dc-head">
        <strong>${escape(m.title)}</strong>
        <span class="badge badge-blue">${escape(m.status)}</span>
        ${m.is_full ? '<span class="badge badge-red">마감됨</span>' : ''}
      </div>
      <div class="dc-tags">
        ${m.region ? `<span class="chip-tag chip-orange">#${escape(shortRegion(m.region.full_name))}</span>` : ''}
        <span class="chip-tag chip-blue">#${timeLabel(m.meeting_time)}</span>
        <span class="chip-tag chip-green">#${escape(m.goal)}</span>
        ${m.is_recurring ? '<span class="chip-tag chip-orange">#정기</span>' : ''}
      </div>
      <div class="dc-meta">
        🕐 ${m.meeting_date} ${String(m.meeting_time).slice(0,5)}<br />
        📍 ${escape(m.location_name || '(온라인)')}<br />
        👥 ${m.current_participants}/${m.max_participants}명 · ${m.is_full ? '<span class="danger">마감</span>' : `<span class="ok">${remain}자리 남았어요</span>`}
      </div>
      <div class="dc-foot">
        호스트 · ${escape(m.host?.name || '—')}${m.host?.job ? ` · ${escape(m.host.job)}` : ''}
        <button data-action="feed-pick" data-id="${m.id}" class="chip">이 id 복사→상세</button>
      </div>
    `;
    box.appendChild(card);
  }
  box.querySelectorAll('[data-action="feed-pick"]').forEach(b => {
    b.addEventListener('click', () => {
      document.getElementById('dd-meeting-id').value = b.dataset.id;
      loadDesignDetail(b.dataset.id);
    });
  });

  document.getElementById('feed-count').textContent = items.length;
  document.getElementById('feed-page-label').textContent = `page ${designFeed.page}`;
  show('feed', `HTTP ${r.status} · filtered=${items.length} · raw=${Array.isArray(r.body) ? r.body.length : 0}`);
}

function shortRegion(full) {
  if (!full) return '';
  const parts = full.split(' ');
  return parts[parts.length - 1];
}
function timeLabel(t) {
  const b = timeBucket(t);
  return { morning: '오전', afternoon: '오후', evening: '저녁', night: '밤' }[b] || t;
}
function activate(btn, sel) {
  document.querySelectorAll(sel).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// =================== I. 모임 상세 ===================
async function loadDesignDetail(id) {
  if (!id) return show('design-detail', 'meeting_id 필수');
  const r = await call('GET', `/api/v1/meetings/${id}`, { auth: false });
  show('design-detail', r);
  if (!r.ok) return;
  const m = r.body;

  // 호스트 공개 프로필(job, bio, tags) 을 별도 조회 — MeetingResponse.host 는 UserSummary 라 job/tags 만 포함
  const hostPub = await call('GET', `/api/v1/users/${m.host.id}`, { auth: false });
  const host = hostPub.ok ? hostPub.body : m.host;

  document.getElementById('dd-mock').hidden = false;
  document.getElementById('dd-status').textContent = m.status === 'recruiting' ? (m.is_full ? '모집 마감' : '모집 중') : m.status;
  document.getElementById('dd-recurrence').textContent = m.series_id
    ? `↻ 시리즈 소속 (${m.series_id.slice(0,8)}...) · 회차/요일 파생은 클라이언트 계산`
    : '단발성';
  document.getElementById('dd-title').textContent = m.title;
  document.getElementById('dd-tags').innerHTML = `
    <span class="chip-tag chip-orange">#${m.mode === 'offline' ? '오프라인' : '온라인'}</span>
    <span class="chip-tag chip-blue">#${timeLabel(m.meeting_time)}</span>
    <span class="chip-tag chip-green">#${escape(m.goal)}</span>
    ${m.is_recurring ? '<span class="chip-tag chip-orange">#정기</span>' : ''}
  `;
  const dateStr = m.meeting_date;
  const dayName = ['일','월','화','수','목','금','토'][new Date(dateStr).getDay()];
  document.getElementById('dd-datetime').textContent = `${dateStr} (${dayName}) · ${String(m.meeting_time).slice(0,5)}`;
  document.getElementById('dd-location').textContent = m.mode === 'online'
    ? '온라인 (참여 후 링크 공개)'
    : `${m.location_name || '—'}${m.location_address ? ' · ' + m.location_address : ''}`;
  const remain = m.max_participants - m.current_participants;
  document.getElementById('dd-counts').textContent = `${m.current_participants}/${m.max_participants}명 · ${m.is_full ? '마감' : remain + '자리 남았어요'}`;
  document.getElementById('dd-desc').textContent = m.description || '(설명 없음)';

  document.getElementById('dd-count-label').textContent = `${m.current_participants}/${m.max_participants}명`;
  const plist = document.getElementById('dd-participants');
  plist.innerHTML = '';
  for (const p of m.participants || []) {
    const tagsHtml = (p.user.tags || []).map(t => `<span class="chip-tag chip-blue">${escape(t)}</span>`).join(' ')
      || '<span class="lbl partial">태그 미설정</span>';
    plist.innerHTML += `
      <div class="pp-card">
        <strong>${escape(p.user.name)}</strong>
        ${p.user.job ? `<span class="chip-tag chip-green">${escape(p.user.job)}</span>` : ''}
        ${p.user.id === m.host.id ? '<span class="badge badge-dark">호스트</span>' : ''}
        <span class="badge badge-green">${p.status}</span>
        <div>${tagsHtml}</div>
      </div>
    `;
  }
  if (remain > 0) {
    plist.innerHTML += `<div class="pp-empty">+ 아직 ${remain}자리 남았어요 — 참여해 보세요!</div>`;
  }

  const hostTagsHtml = (host.tags || []).map(t => `<span class="chip-tag chip-blue">${escape(t)}</span>`).join(' ')
    || '<span class="lbl partial">태그 미설정</span>';
  document.getElementById('dd-host').innerHTML = `
    <strong>${escape(host.name)}</strong>
    ${host.job ? `<span class="chip-tag chip-green">${escape(host.job)}</span>` : '<span class="lbl partial">직무 미입력</span>'}
    ${host.bio ? `<p class="dd-desc">${escape(host.bio)}</p>` : '<p class="dd-desc">(소개 없음)</p>'}
    <div class="dd-tags">${hostTagsHtml}</div>
  `;

  document.getElementById('dd-aside-date').textContent = `${dateStr} (${dayName})`;
  document.getElementById('dd-aside-counts').textContent = `${m.current_participants}/${m.max_participants}명 · ${m.is_full ? '마감' : remain + '자리 남음'}`;
  const pr = document.getElementById('dd-progress');
  pr.max = m.max_participants;
  pr.value = m.current_participants;
}

// =================== J. 디자인 개설 폼 ===================
const designCreate = { mode: 'offline', goal: '공부', regionId: null, max: 6 };

(function initDcMaxChips() {
  const box = document.getElementById('dc-max-chips');
  if (!box) return;
  for (let n = 2; n <= 8; n++) {
    const b = document.createElement('button');
    b.className = 'chip' + (n === 6 ? ' active' : '');
    b.dataset.action = 'dc-max';
    b.dataset.val = n;
    b.textContent = n;
    box.appendChild(b);
  }
})();

async function submitDesignCreate() {
  const mode = designCreate.mode;
  const body = {
    title: val('dc-title') || '제목 없음',
    mode,
    region_id: mode === 'offline' ? designCreate.regionId : null,
    location_name: mode === 'offline' ? (val('dc-location') || null) : null,
    location_address: null,
    meeting_date: val('dc-date'),
    meeting_time: val('dc-time'),
    goal: designCreate.goal,
    max_participants: designCreate.max,
    description: val('dc-desc') || null,
    is_recurring: checked('dc-recurring'),
    recurrence: null,
  };
  if (body.is_recurring) {
    body.recurrence = {
      frequency: val('dc-freq') || 'WEEKLY',
      end_date: val('dc-end') || null,
    };
  }
  const r = await call('POST', '/api/v1/meetings/', { body });
  show('design-create', r);
  if (r.ok) {
    document.getElementById('dd-meeting-id').value = r.body.id;
  }
}

// =================== K. 마이페이지 ===================
const mypageState = { tab: 'upcoming', meetings: { upcoming: [], past: [] }, me: null };

function renderMyTags() {
  const box = document.getElementById('mp-tags');
  const tags = mypageState.me?.tags || [];
  box.innerHTML = tags.map(t => `
    <span class="chip-tag chip-orange">
      ${escape(t)}
      <button data-action="mypage-remove-tag" data-tag="${escape(t)}" class="chip-x">×</button>
    </span>
  `).join(' ') || '<em>(아직 태그 없음)</em>';
}

async function loadMypage() {
  const me = await call('GET', '/api/v1/auth/me');
  if (!me.ok) return show('mypage', me);
  mypageState.me = me.body;

  const hosted = await call('GET', `/api/v1/meetings/hosted/${me.body.id}`, { auth: false, query: { limit: 50 } });
  const joined = await call('GET', `/api/v1/meetings/participated/${me.body.id}`, { auth: false, query: { limit: 50 } });

  document.getElementById('mp-mock').hidden = false;
  document.getElementById('mp-name').textContent = me.body.name;
  document.getElementById('mp-job').textContent = me.body.job ? `· ${me.body.job}` : '(직무 미입력)';
  document.getElementById('mp-bio').textContent = me.body.bio || '(소개 없음)';

  // 편집 폼 prefill
  if (document.getElementById('mp-edit-name')) {
    document.getElementById('mp-edit-name').value = me.body.name || '';
    document.getElementById('mp-edit-bio').value = me.body.bio || '';
    document.getElementById('mp-edit-job').value = me.body.job || '';
  }

  const all = [
    ...(hosted.ok ? hosted.body : []).map(m => ({ ...m, _role: 'host' })),
    ...(joined.ok ? joined.body : []).map(m => ({ ...m, _role: 'participant' })),
  ];
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = all.filter(m => m.meeting_date >= today);
  const past = all.filter(m => m.meeting_date < today);
  mypageState.meetings = { upcoming, past };

  document.getElementById('mp-joined').textContent = joined.ok ? joined.body.length : 0;
  document.getElementById('mp-upcoming').textContent = upcoming.length;
  document.getElementById('mp-tab-upcoming').textContent = upcoming.length;
  document.getElementById('mp-tab-past').textContent = past.length;

  // 실수치 반영 — attendance rate 와 connection count.
  const attRate = await call('GET', `/api/v1/users/${me.body.id}/attendance-rate`, { auth: false });
  if (attRate.ok) {
    const { attended, total_recorded, rate } = attRate.body;
    document.getElementById('mp-attendance').textContent = total_recorded === 0
      ? '— (기록 없음)'
      : `${Math.round(rate * 100)}% (${attended}/${total_recorded})`;
  }
  const connCount = await call('GET', `/api/v1/users/${me.body.id}/connections/count`, { auth: false });
  if (connCount.ok) {
    document.getElementById('mp-connections').textContent = connCount.body.count;
  }

  // 알림 설정 체크박스 prefill
  const prefs = me.body.notification_prefs || {};
  const setPref = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.checked = prefs[key] !== false;  // 기본값 true
  };
  setPref('pref-pp', 'participant_pending');
  setPref('pref-msg', 'new_message');
  setPref('pref-conn', 'connection_requested');
  setPref('pref-review', 'review_requested');

  renderMyTags();
  renderMypageMeetings();
  show('mypage', `me=${me.body.id} · hosted=${hosted.body?.length ?? 'x'} · joined=${joined.body?.length ?? 'x'} · upcoming=${upcoming.length} · past=${past.length}`);
}

async function saveMypageProfile() {
  const body = {};
  if (val('mp-edit-name')) body.name = val('mp-edit-name');
  body.bio = val('mp-edit-bio') || null;
  body.job = val('mp-edit-job') || null;
  const r = await call('PATCH', '/api/v1/auth/me', { body });
  if (r.ok) {
    mypageState.me = r.body;
    document.getElementById('mp-name').textContent = r.body.name;
    document.getElementById('mp-job').textContent = r.body.job ? `· ${r.body.job}` : '(직무 미입력)';
    document.getElementById('mp-bio').textContent = r.body.bio || '(소개 없음)';
  }
  show('mypage', r);
}

function renderMypageMeetings() {
  const box = document.getElementById('mp-meetings');
  const items = mypageState.meetings?.[mypageState.tab] || [];
  box.innerHTML = items.map(m => {
    const isPast = m.meeting_date < new Date().toISOString().slice(0, 10);
    const statusLabel = isPast
      ? (m.is_full ? '정원 충족 · 종료' : '종료')
      : m.status === 'recruiting' ? (m.is_full ? '모집 마감' : '모집 중') : m.status;
    return `
      <div class="mp-meeting">
        <div>
          <span class="badge badge-green">${statusLabel}</span>
          ${m._role === 'host' ? '<span class="badge badge-dark">호스트</span>' : ''}
          ${m.is_recurring ? '<span class="badge badge-blue">정기</span>' : ''}
        </div>
        <strong>${escape(m.title)}</strong>
        <div class="chip-row">
          ${m.region ? `<span class="chip-tag chip-orange">#${escape(shortRegion(m.region.full_name))}</span>` : ''}
          <span class="chip-tag chip-blue">#${timeLabel(m.meeting_time)}</span>
          <span class="chip-tag chip-green">#${escape(m.goal)}</span>
        </div>
        <div>🕐 ${m.meeting_date} · ${String(m.meeting_time).slice(0,5)} 📍 ${escape(m.location_name || '(온라인)')}</div>
      </div>
    `;
  }).join('') || '<em>(해당 탭에 모임 없음)</em>';
}

function renderRegionHits(list) {
  const box = document.getElementById('region-results');
  box.innerHTML = '';
  for (const r of list) {
    const span = document.createElement('span');
    span.className = 'region-hit';
    span.textContent = `[${r.id}] ${r.full_name}`;
    span.title = '클릭 시 모임 개설/목록 필터의 region_id 에 반영';
    span.addEventListener('click', () => {
      document.getElementById('mc-region-id').value = r.id;
      document.getElementById('ml-region-id').value = r.id;
      document.getElementById('region-id').value = r.id;
    });
    box.appendChild(span);
  }
}

function renderMeetingCards(list) {
  const box = document.getElementById('meeting-cards');
  box.innerHTML = '';
  for (const m of list) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <strong>${escape(m.title)}</strong>
      <small>[${m.mode}] ${m.status} · ${m.current_participants}/${m.max_participants}${m.is_full ? ' · FULL' : ''}${m.is_recurring ? ' · recurring' : ''}</small><br />
      <code>${m.id}</code> · ${m.meeting_date} ${m.meeting_time} · goal=${m.goal}
      ${m.region ? ` · ${escape(m.region.full_name)}` : ''}
      <br />
      <button data-action="use-meeting" data-id="${m.id}">이 meeting_id 사용</button>
      <button data-action="meeting-delete-inline" data-id="${m.id}" class="danger">삭제</button>
    `;
    box.appendChild(card);
  }
  box.querySelectorAll('[data-action="use-meeting"]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.dataset.id;
      document.getElementById('ml-meeting-id').value = id;
      document.getElementById('pt-meeting-id').value = id;
      document.getElementById('pt-host-meeting-id').value = id;
    });
  });
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// =================== L. 알림 ===================
async function loadNotifications() {
  const list = await call('GET', '/api/v1/notifications', { query: { limit: 30 } });
  const count = await call('GET', '/api/v1/notifications/unread-count');
  if (!list.ok) return show('notif', list);

  document.getElementById('notif-unread').textContent = count.ok ? count.body.unread : '?';
  const box = document.getElementById('notif-list');
  box.innerHTML = list.body.map(n => `
    <div class="mp-meeting">
      <strong>${escape(n.type)}</strong>
      ${n.read_at ? '<span class="badge badge-green">읽음</span>' : '<span class="badge badge-red">새</span>'}
      <div><code>${escape(JSON.stringify(n.payload))}</code></div>
      <small>${n.created_at}</small>
      ${n.read_at ? '' : `<button data-action="notif-mark-read" data-id="${n.id}" class="chip">읽음 처리</button>`}
      <button data-action="notif-delete" data-id="${n.id}" class="chip danger">삭제</button>
    </div>
  `).join('') || '<em>(알림 없음)</em>';
  show('notif', `${list.body.length}건 로드, 미읽음 ${count.body?.unread ?? '?'}`);
}

// =================== O. 채팅 ===================
let chatSocket = null;
function renderChatMessages(list) {
  const box = document.getElementById('chat-messages');
  // 최신순 응답을 시간 역순으로 뒤집어서 아래가 최신.
  const ordered = [...list].reverse();
  box.innerHTML = ordered.map(m => `
    <div class="pp-card">
      <strong>${escape(m.user?.name || '?')}</strong>
      ${m.user?.job ? `<span class="chip-tag chip-green">${escape(m.user.job)}</span>` : ''}
      <small>${m.created_at}</small>
      <div>${escape(m.content)}</div>
    </div>
  `).join('') || '<em>(메시지 없음)</em>';
  box.scrollTop = box.scrollHeight;
}

async function loadChatRooms() {
  const r = await call('GET', '/api/v1/chat/rooms');
  if (!r.ok) return show('chat', r);
  const box = document.getElementById('chat-rooms-list');
  box.innerHTML = r.body.map(room => `
    <div class="mp-meeting">
      <strong>room ${room.id.slice(0,8)}</strong>
      · meeting ${room.meeting_id.slice(0,8)}
      · 참여 ${room.participants.length}명
      · 미읽음 ${room.unread}
      ${room.last_message ? `<div><em>최신: ${escape(room.last_message.content.slice(0,40))}</em></div>` : ''}
      <button data-action="chat-pick-room" data-id="${room.id}" class="chip">이 방 선택</button>
    </div>
  `).join('') || '<em>(참여한 채팅방 없음)</em>';
  box.querySelectorAll('[data-action="chat-pick-room"]').forEach(b => {
    b.addEventListener('click', () => {
      document.getElementById('chat-room-id').value = b.dataset.id;
    });
  });
  show('chat', `${r.body.length}개 채팅방`);
}

function connectWebSocket() {
  if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
    show('chat', 'WebSocket 이미 연결됨');
    return;
  }
  const token = tokens.access();
  if (!token) {
    show('chat', '로그인 먼저 해주세요 (WS 는 토큰 필수)');
    return;
  }
  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProto}//${location.host}/api/v1/ws?token=${encodeURIComponent(token)}`;
  chatSocket = new WebSocket(wsUrl);

  const wsBox = document.getElementById('chat-ws-log');
  const append = (txt) => {
    wsBox.textContent += `[${new Date().toLocaleTimeString()}] ${txt}\n`;
    wsBox.scrollTop = wsBox.scrollHeight;
  };
  chatSocket.addEventListener('open', () => append('✅ WS open'));
  chatSocket.addEventListener('close', (e) => append(`❌ WS close code=${e.code}`));
  chatSocket.addEventListener('error', () => append('⚠️ WS error'));
  chatSocket.addEventListener('message', (e) => {
    append(`📩 ${e.data}`);
    // 현재 선택된 room 과 동일하면 메시지 목록 새로고침.
    try {
      const data = JSON.parse(e.data);
      if (data.event === 'new_message') {
        const currentRoom = val('chat-room-id');
        if (currentRoom === data.message.room_id) {
          call('GET', `/api/v1/chat/rooms/${currentRoom}/messages`, { query: { limit: 50 } })
            .then(r => r.ok && renderChatMessages(r.body));
        }
      }
    } catch {}
  });
  show('chat', 'WebSocket 연결 중...');
}

function disconnectWebSocket() {
  if (chatSocket) {
    chatSocket.close();
    chatSocket = null;
    show('chat', 'WebSocket 종료');
  }
}
