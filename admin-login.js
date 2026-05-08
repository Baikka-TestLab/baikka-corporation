// ============================================================
//  admin-login.js — Admin Login via Supabase Auth
// ============================================================

// If already logged in, skip to dashboard
(async function checkSession() {
  try {
    const res = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey':        CONFIG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${getStoredToken()}`
      }
    });
    if (res.ok) {
      window.location.replace('dashboard.html');
    }
  } catch (_) {}
})();

function getStoredToken() {
  return localStorage.getItem('baikka_admin_token') || '';
}

function validate(id, condition) {
  const field = document.getElementById('f-' + id);
  if (!field) return condition;
  if (!condition) { field.classList.add('invalid'); return false; }
  field.classList.remove('invalid');
  return true;
}

async function doLogin() {
  const email = document.getElementById('adminEmail').value.trim();
  const pass  = document.getElementById('adminPass').value;

  const emailOk = validate('adminEmail', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  const passOk  = validate('adminPass',  pass.length > 0);
  if (!emailOk || !passOk) return;

  const btn = document.getElementById('loginBtn');
  const errBox = document.getElementById('globalError');
  errBox.classList.remove('show');

  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spinner"></span> Verifying…';

  try {
    const res = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey':       CONFIG.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ email, password: pass })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error_description || data.msg || 'Invalid credentials');
    }

    // Store token and user info
    localStorage.setItem('baikka_admin_token', data.access_token);
    localStorage.setItem('baikka_admin_email', email);
    if (data.refresh_token) {
      localStorage.setItem('baikka_admin_refresh', data.refresh_token);
    }

    window.location.replace('dashboard.html');

  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = 'Access Dashboard <span class="arrow" style="margin-left:8px;">→</span>';
    errBox.textContent = err.message || 'Authentication failed. Please try again.';
    errBox.classList.add('show');

    // Shake the card
    const card = document.querySelector('.login-card');
    card.style.animation = 'none';
    card.offsetHeight;
    card.style.animation = 'shake .4s ease';
  }
}

// Allow Enter key to submit
document.addEventListener('DOMContentLoaded', () => {
  const inputs = ['adminEmail', 'adminPass'];
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
      el.addEventListener('input',   () => {
        document.getElementById('globalError').classList.remove('show');
        const map = { adminEmail: 'adminEmail', adminPass: 'adminPass' };
        const f = document.getElementById('f-' + id);
        if (f) f.classList.remove('invalid');
      });
    }
  });

  // Add shake keyframe
  const style = document.createElement('style');
  style.textContent = `
    @keyframes shake {
      0%,100%{transform:translateX(0)}
      20%    {transform:translateX(-8px)}
      40%    {transform:translateX(8px)}
      60%    {transform:translateX(-5px)}
      80%    {transform:translateX(5px)}
    }
  `;
  document.head.appendChild(style);
});
