(function () {
  var KEY = 'free-secure-kit:theme';
  var LEGACY = 'securekit:theme';
  var choice = null;
  try {
    choice = localStorage.getItem(KEY);
    if (choice === null) {
      // Saved before the rename, so a returning visitor keeps their choice.
      choice = localStorage.getItem(LEGACY);
      if (choice !== null) {
        localStorage.setItem(KEY, choice);
        localStorage.removeItem(LEGACY);
      }
    }
  } catch (e) {}
  // Dark is the default; only an explicit choice of light opts out.
  if (choice !== 'light') document.documentElement.classList.add('dark');
})();
