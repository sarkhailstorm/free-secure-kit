(function () {
  // Dark is the default; only an explicit choice of light opts out.
  var light = false;
  try {
    light = localStorage.getItem('securekit:theme') === 'light';
  } catch (e) {}
  if (!light) document.documentElement.classList.add('dark');
})();
