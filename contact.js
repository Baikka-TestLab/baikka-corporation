// ============================================================
//  contact.js — Contact Form Logic
//  Saves to: Supabase DB + n8n webhook + Google Sheets (opt)
// ============================================================

const gmailRx = /^[a-zA-Z0-9._%+\-]+@gmail\.com$/i;

function validate(id, condition) {
  const field = document.getElementById('f-' + id);
  if (!field) return condition;
  if (!condition) { field.classList.add('invalid'); return false; }
  field.classList.remove('invalid');
  return true;
}

async function submitForm() {
  const name    = document.getElementById('fullName').value.trim();
  const email   = document.getElementById('email').value.trim();
  const company = document.getElementById('company').value.trim();
  const role    = document.getElementById('role').value.trim();
  const service = document.getElementById('service').value;
  const rawBudget = document.getElementById('budget').value;
  const budget  = Number(rawBudget);

  const nameOk    = validate('name',    name.length > 1);
  const emailOk   = validate('email',   gmailRx.test(email));
  const serviceOk = validate('service', service !== '');
  const budgetOk  = validate('budget',  rawBudget !== "" && !isNaN(budget) && budget > 0);

  if (!nameOk || !emailOk || !serviceOk || !budgetOk) return;

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(0,0,0,0.3);border-top-color:#000;border-radius:50%;animation:spin .6s linear infinite;margin-right:8px;vertical-align:middle;"></span> Sending…';

  const payload = {
    name, email,
    company: company || null,
    role:    role    || null,
    service,
    budget,
    submitted_at: new Date().toISOString()
  };

  try {
    // 1) Save to Supabase
    await saveToSupabase(payload);

    // 2) Trigger n8n automation (fire & forget — don't block on failure)
    triggerN8n(payload).catch(()=>{});

    // 3) Save to Google Sheets if enabled
    if (CONFIG.SHEETS_ENABLED) {
      saveToSheets(payload).catch(()=>{});
    }

    // Show success
    document.getElementById('formInner').classList.add('hide');
    document.getElementById('successOverlay').classList.add('show');

  } catch (err) {
    console.error('Submission error:', err);
    btn.disabled = false;
    btn.innerHTML = 'Submit Request <span class="arrow">→</span>';
    showFormError(err.message || 'Submission failed. Please try again.');
  }
}

// ── Supabase insert ──────────────────────────────────────────
async function saveToSupabase(payload) {
  const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/contact_submissions`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        CONFIG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
      'Prefer':        'return=minimal'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Database error: ${res.status}. ${err}`);
  }
}

// ── n8n webhook ─────────────────────────────────────────────
async function triggerN8n(payload) {
  await fetch(CONFIG.N8N_WEBHOOK_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload)
  });
}

// ── Google Sheets (Apps Script web app) ─────────────────────
async function saveToSheets(payload) {
  await fetch(CONFIG.SHEETS_WEBHOOK_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload)
  });
}

// ── Form error banner ───────────────────────────────────────
function showFormError(msg) {
  let banner = document.getElementById('formErrorBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'formErrorBanner';
    banner.style.cssText = `
      background:rgba(255,77,109,0.08);border:1px solid rgba(255,77,109,0.25);
      border-radius:10px;padding:12px 16px;font-size:11px;color:#ff4d6d;
      letter-spacing:.04em;text-align:center;margin-top:16px;
    `;
    document.querySelector('.submit-area').appendChild(banner);
  }
  banner.textContent = msg;
  banner.style.display = 'block';
}

// ── Clear invalid on input ───────────────────────────────────
function attachClearOnInput() {
  const fieldMap = { fullName:'name', email:'email', service:'service', budget:'budget' };
  Object.entries(fieldMap).forEach(([elId, fieldKey]) => {
    const el = document.getElementById(elId);
    if (!el) return;
    el.addEventListener('input', () => {
      const f = document.getElementById('f-' + fieldKey);
      if (f) f.classList.remove('invalid');
      const banner = document.getElementById('formErrorBanner');
      if (banner) banner.style.display = 'none';
    });
  });
}

// Add keyframe for spinner
const style = document.createElement('style');
style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
document.head.appendChild(style);

document.addEventListener('DOMContentLoaded', attachClearOnInput);
