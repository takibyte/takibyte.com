  
  const indicator = document.getElementById('scrollIndicator');
  window.addEventListener('scroll', () => {
    if (window.scrollY > window.innerHeight * 0.2) {
      indicator.classList.add('hidden');
    } else {
      indicator.classList.remove('hidden');
    }
  }, { passive: true });