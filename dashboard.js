// ============================================================
//  dashboard.js — Admin Dashboard Logic
// ============================================================

const PAGE_SIZE = 15;
let allRows   = [];
let filtered  = [];
let currentPage = 1;

const SERVICE_LABELS = {
  'ai-chatbot':    '🤖 AI Chat Bot',
  'ai-automation': '⚡ AI Automations',
  'ai-coding':     '💻 AI Coding',
  'local-ai':      '🖥️ Local AI PC',
  'n8n':           '🔗 N8n Services',
};

// ── Auth guard ───────────────────────────────────────────────
function getToken() {
  return localStorage.getItem('baikka_admin_token') || '';
}

async function guardAuth() {
  const token = getToken();
  if (!token) { window.location.replace('admin.html'); return false; }

  try {
    const res = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey':        CONFIG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) throw new Error('Token invalid');

    const data = await res.json();
    const email = data.email || localStorage.getItem('baikka_admin_email') || 'admin';
    document.getElementById('adminPill').textContent = email;
    return true;
  } catch (_) {
    localStorage.removeItem('baikka_admin_token');
    window.location.replace('admin.html');
    return false;
  }
}

function doLogout() {
  // Best-effort server-side logout
  fetch(`${CONFIG.SUPABASE_URL}/auth/v1/logout`, {
    method:  'POST',
    headers: {
      'apikey':        CONFIG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${getToken()}`
    }
  }).catch(()=>{});

  localStorage.removeItem('baikka_admin_token');
  localStorage.removeItem('baikka_admin_email');
  localStorage.removeItem('baikka_admin_refresh');
  window.location.replace('admin.html');
}

// ── Load data ────────────────────────────────────────────────
async function loadSubmissions() {
  setTableLoading(true);

  try {
    const res = await fetch(
      `${CONFIG.SUPABASE_URL}/rest/v1/contact_submissions?select=*&order=submitted_at.desc`,
      {
        headers: {
          'apikey':        CONFIG.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type':  'application/json'
        }
      }
    );

    if (res.status === 401) {
      window.location.replace('admin.html');
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    allRows = await res.json();
    filtered = [...allRows];
    currentPage = 1;

    renderStats();
    renderTable();
    showToast(`Loaded ${allRows.length} submission${allRows.length !== 1 ? 's' : ''}`);

  } catch (err) {
    console.error('Load error:', err);
    setTableError(err.message);
  }
}

// ── Stats ────────────────────────────────────────────────────
function renderStats() {
  const total = allRows.length;
  document.getElementById('statTotal').textContent = total;

  if (total === 0) {
    document.getElementById('statAvgBudget').textContent = '$0';
    document.getElementById('statTopService').textContent = '—';
    document.getElementById('statPipeline').textContent = '$0';
    return;
  }

  const avg = Math.round(allRows.reduce((s, r) => s + (r.budget || 0), 0) / total);
  document.getElementById('statAvgBudget').textContent = '$' + avg.toLocaleString();

  const pipeline = allRows.reduce((s, r) => s + (r.budget || 0), 0);
  document.getElementById('statPipeline').textContent = '$' + pipeline.toLocaleString();

  const svcCount = {};
  allRows.forEach(r => { svcCount[r.service] = (svcCount[r.service] || 0) + 1; });
  const top = Object.entries(svcCount).sort((a,b) => b[1]-a[1])[0];
  if (top) {
    const label = SERVICE_LABELS[top[0]] || top[0];
    document.getElementById('statTopService').textContent = label;
  }
}

// ── Table ────────────────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('tableBody');
  const pagination = document.getElementById('pagination');

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="8">
        <div class="table-empty">
          <div class="empty-icon">◈</div>
          <p>${allRows.length === 0 ? 'No submissions yet' : 'No results match your search'}</p>
        </div>
      </td></tr>`;
    pagination.style.display = 'none';
    return;
  }

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = slice.map((row, i) => {
    const rowNum = start + i + 1;
    const date   = row.submitted_at ? formatDate(row.submitted_at) : '—';
    const svcLabel = SERVICE_LABELS[row.service] || row.service || '—';

    return `
      <tr>
        <td style="color:var(--text-dim);font-size:10px;">${rowNum}</td>
        <td class="td-name">${esc(row.name)}</td>
        <td class="td-email">${esc(row.email)}</td>
        <td class="td-company">${row.company ? esc(row.company) : '<span style="color:var(--text-dim)">—</span>'}</td>
        <td class="td-role">${row.role ? esc(row.role) : '<span style="color:var(--text-dim)">—</span>'}</td>
        <td><span class="service-badge">${esc(svcLabel)}</span></td>
        <td class="td-budget">$${Number(row.budget || 0).toLocaleString()}</td>
        <td class="td-date">${date}</td>
      </tr>`;
  }).join('');

  // Pagination
  pagination.style.display = 'flex';
  document.getElementById('paginationInfo').textContent =
    `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)} of ${filtered.length}`;

  const pageBtns = document.getElementById('pageBtns');
  pageBtns.innerHTML = '';

  const prevBtn = makePageBtn('←', currentPage === 1, () => { currentPage--; renderTable(); });
  pageBtns.appendChild(prevBtn);

  // Page numbers
  const maxBtns = 5;
  let pageStart = Math.max(1, currentPage - 2);
  let pageEnd   = Math.min(totalPages, pageStart + maxBtns - 1);
  if (pageEnd - pageStart < maxBtns - 1) pageStart = Math.max(1, pageEnd - maxBtns + 1);

  for (let p = pageStart; p <= pageEnd; p++) {
    const pb = makePageBtn(p, false, () => { currentPage = p; renderTable(); });
    if (p === currentPage) pb.classList.add('active');
    pageBtns.appendChild(pb);
  }

  const nextBtn = makePageBtn('→', currentPage >= totalPages, () => { currentPage++; renderTable(); });
  pageBtns.appendChild(nextBtn);
}

function makePageBtn(label, disabled, onClick) {
  const btn = document.createElement('button');
  btn.className = 'page-btn';
  btn.textContent = label;
  btn.disabled = disabled;
  if (!disabled) btn.addEventListener('click', onClick);
  return btn;
}

// ── Search / filter ─────────────────────────────────────────
function filterTable() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  if (!q) {
    filtered = [...allRows];
  } else {
    filtered = allRows.filter(r =>
      (r.name  || '').toLowerCase().includes(q) ||
      (r.email || '').toLowerCase().includes(q) ||
      (r.company || '').toLowerCase().includes(q) ||
      (r.role || '').toLowerCase().includes(q) ||
      (r.service || '').toLowerCase().includes(q)
    );
  }
  currentPage = 1;
  renderTable();
}

// ── Export CSV ───────────────────────────────────────────────
function exportCSV() {
  if (filtered.length === 0) { showToast('Nothing to export'); return; }

  const headers = ['#','Name','Email','Company','Role','Service','Budget','Submitted At'];
  const rows = filtered.map((r, i) => [
    i + 1,
    csvCell(r.name),
    csvCell(r.email),
    csvCell(r.company || ''),
    csvCell(r.role    || ''),
    csvCell(SERVICE_LABELS[r.service] || r.service || ''),
    r.budget || 0,
    csvCell(r.submitted_at || '')
  ]);

  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `baikka-submissions-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${filtered.length} rows`);
}

function csvCell(val) {
  const s = String(val).replace(/"/g, '""');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
}

// ── Helpers ─────────────────────────────────────────────────
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  } catch { return iso; }
}

function setTableLoading(on) {
  if (!on) return;
  document.getElementById('tableBody').innerHTML = `
    <tr><td colspan="8">
      <div class="table-loading">
        <div class="spinner"></div>
        <p style="letter-spacing:.1em;color:var(--text-muted);">Loading submissions…</p>
      </div>
    </td></tr>`;
  document.getElementById('pagination').style.display = 'none';
}

function setTableError(msg) {
  document.getElementById('tableBody').innerHTML = `
    <tr><td colspan="8">
      <div class="table-empty">
        <div class="empty-icon" style="color:var(--error);">⚠</div>
        <p style="color:var(--error);">Failed to load: ${esc(msg)}</p>
        <p style="margin-top:8px;font-size:10px;">Check your Supabase config and RLS policies</p>
      </div>
    </td></tr>`;
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const ok = await guardAuth();
  if (ok) loadSubmissions();
});
