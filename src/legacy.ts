// One-time move of browser storage from the app's former name (merfolk).
try {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('merfolk.')) continue;
    const next = `marmerlade.${key.slice('merfolk.'.length)}`;
    const value = localStorage.getItem(key);
    if (value !== null && localStorage.getItem(next) === null) localStorage.setItem(next, value);
    localStorage.removeItem(key);
  }
} catch { /* storage unavailable */ }
