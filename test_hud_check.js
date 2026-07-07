// Test script to check HUD element
(function() {
  const hud = document.querySelector('#lt-chart-hud');
  if (hud) {
    console.log('HUD_EXISTS: yes');
    console.log('HUD_INNER: ' + hud.innerHTML.substring(0, 500));
    const rect = hud.getBoundingClientRect();
    console.log('HUD_RECT: top=' + rect.top + ' left=' + rect.left + ' width=' + rect.width + ' height=' + rect.height);
    console.log('HUD_STYLE: display=' + getComputedStyle(hud).display + ' visibility=' + getComputedStyle(hud).visibility + ' opacity=' + getComputedStyle(hud).opacity);
  } else {
    console.log('HUD_EXISTS: no');
  }
})();
