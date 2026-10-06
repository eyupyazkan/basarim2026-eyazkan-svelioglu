(function () {
  var q = new URLSearchParams(location.search).get('theme'), t = null;
  try { t = q || localStorage.getItem('mxsi.theme'); } catch (e) { t = q; }
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
})();
