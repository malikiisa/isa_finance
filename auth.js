/**
 * FinTrack - Client-Side Authentication Module
 */

const AUTH_CREDENTIALS = {
    usernameHash: "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918", // SHA-256 for "admin"
    passwordHash: "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918"  // SHA-256 for "admin"
};

/**
 * Generate SHA-256 hex string using Web Crypto API
 */
async function sha256(text) {
    const msgBuffer = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Session verification:
 * Redirects unauthenticated users to login.html
 * Redirects authenticated users from login.html back to index.html
 */
function checkSession() {
    const isAuth = sessionStorage.getItem("authenticated") === "true";
    const currentFile = window.location.pathname.split('/').pop().toLowerCase();
    const isLoginPage = currentFile === "login.html";

    if (!isAuth && !isLoginPage) {
        window.location.href = "login.html";
    } else if (isAuth && isLoginPage) {
        window.location.href = "index.html";
    }
}

/**
 * Handle form login submission
 */
async function handleLogin(event) {
    if (event) event.preventDefault();

    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const errorDiv = document.getElementById('login-error');

    if (!usernameInput || !passwordInput) return;

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    const userHash = await sha256(username);
    const passHash = await sha256(password);

    if (userHash === AUTH_CREDENTIALS.usernameHash && passHash === AUTH_CREDENTIALS.passwordHash) {
        sessionStorage.setItem("authenticated", "true");
        window.location.href = "index.html";
    } else {
        if (errorDiv) {
            errorDiv.classList.remove('hidden');
            errorDiv.classList.add('flex');
        }
        passwordInput.value = '';
        passwordInput.focus();
    }
}

/**
 * Toggle password visibility helper
 */
function togglePasswordVisibility() {
    const passInput = document.getElementById('login-password');
    const toggleIcon = document.getElementById('toggle-password-icon');
    if (!passInput || !toggleIcon) return;

    if (passInput.type === 'password') {
        passInput.type = 'text';
        toggleIcon.textContent = 'visibility_off';
    } else {
        passInput.type = 'password';
        toggleIcon.textContent = 'visibility';
    }
}

/**
 * Quick lock / logout
 */
function logout() {
    sessionStorage.removeItem("authenticated");
    window.location.href = "login.html";
}

// Check session on load
checkSession();
