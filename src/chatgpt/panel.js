'use strict';
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => window.chatgptPanel.action(button.dataset.action)));
window.chatgptPanel.onStatus(status => {
  const label = document.getElementById('status');
  label.textContent = status.message;
  label.classList.toggle('error', status.failed);
  document.getElementById('pin').setAttribute('aria-pressed', String(status.pinned));
  document.getElementById('pin').textContent = status.pinned ? 'Unpin' : 'Pin';
});
window.chatgptPanel.action('ready');
