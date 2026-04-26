  
  const indicator = document.getElementById('scrollIndicator');
  window.addEventListener('scroll', () => {
    if (window.scrollY > window.innerHeight * 0.2) {
      indicator.classList.add('hidden');
    } else {
      indicator.classList.remove('hidden');
    }
  }, { passive: true });



// Binary letter reveal effect for "takibyte" title

const word = 'takibyte';

function getByte(char) {
  const code = char.charCodeAt(0);
  return Array.from({ length: 8 }, (_, i) => String((code >> (7 - i)) & 1));
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function animateChar(el, char, startDelay, bitSpeed) {
  el.textContent = '\u00a0'; // blank placeholder while waiting
  await sleep(startDelay);   // wait before this letter starts
  const bits = getByte(char);
  for (const bit of bits) {
    el.textContent = bit;
    await sleep(bitSpeed);   // speed of each bit flip
  }
  await sleep(400);          // pause on last bit before revealing letter
  el.textContent = char;
}

async function runEffect() {
  const titleEl = document.querySelector('.takibyte');
  const chars = [...word];

  // set up spans for each character with unique IDs
  titleEl.innerHTML = chars
    .map((_, i) => `<span id="bc${i}"></span>`)
    .join('');

  await sleep(10); // brief pause before starting

  // all letters cycle simultaneously
  await Promise.all(
    chars.map((ch, i) =>
      animateChar(document.getElementById('bc' + i), ch, i * 50, 200)
    )
  );
}

async function loop() {
  await runEffect();
  await sleep(4000); // wait x milliseconds after the effect finishes
  loop();
}

document.addEventListener('DOMContentLoaded', loop);
