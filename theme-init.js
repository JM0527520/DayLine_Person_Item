(function () {
  var preference = 'system';
  try {
    var saved = localStorage.getItem('dayline-theme');
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch (_) { /* The system theme also works when browser storage is unavailable. */ }
  var theme = preference === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  var density = 'comfortable';
  try { if (localStorage.getItem('dayline-density') === 'standard') density = 'standard'; } catch (_) {}
  document.documentElement.dataset.density = density;
})();
