let emojiMap = {};
let popup, matches = [];
let selectedIndex = 0;
let inputEl;

// Load emoji data
console.log("Emoji autocomplete script loaded");
window.addEventListener('focus', () => {
  console.log('Tab focused – re-initializing emoji autocomplete');
  initWhenReady();
});

fetch(chrome.runtime.getURL('emoji-data.json'))
  .then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
  .then(data => {
    emojiMap = data;
    console.log(`emoji-data.json loaded (${Object.keys(data).length} entries)`);
  })
  .catch(err => console.error('Failed to load emoji-data.json:', err));

// Create the suggestion popup
function createPopup() {
  popup = document.createElement('div');
  popup.className = 'emoji-autocomplete';
  document.body.appendChild(popup);
  popup.style.display = 'none';
}

// Show suggestions
function updatePopup(aliases, { top, left }) {
  const usage = JSON.parse(localStorage.getItem('emojiUsage') || '{}');
  aliases.sort((a, b) => {
    const ua = usage[a] || 0;
    const ub = usage[b] || 0;
    if (ua !== ub) return ub - ua;         
    return a.localeCompare(b);             
  });
  popup.innerHTML = '';
  matches = aliases;

  aliases.forEach((alias, i) => {
    const div = document.createElement('div');
    div.setAttribute('data-emoji', emojiMap[alias]);
    div.textContent = `:${alias}`;
    if (i === selectedIndex) div.classList.add('selected');
    div.addEventListener('mousedown', e => {
      e.preventDefault();
      insertEmoji(alias);
    });
    popup.appendChild(div);
  });

  // Temporarily display off-screen to calculate height
  popup.style.visibility = 'hidden';
  popup.style.top = '0px';
  popup.style.left = '0px';
  popup.style.display = 'block';

  // Measure popup height once rendered
  const popupHeight = popup.offsetHeight;

  // Position it above the caret by default
  popup.style.top = `${top - popupHeight - 5}px`;
  popup.style.left = `${left}px`;
  popup.style.visibility = 'visible';
}

// Calculate where to place the popup
function getCaretCoordinates() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return { top: 0, left: 0 };
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  const rect = range.getClientRects()[0];
  return rect
    ? { top: rect.top + window.scrollY, left: rect.left + window.scrollX }
    : { top: 0, left: 0 };
}

// Hide popup when clicking outside it or the inputEl
document.addEventListener('mousedown', e => {
  const target = e.target;
  if (popup.style.display === 'block') {
    if (
      !popup.contains(target) &&
      (!inputEl || !inputEl.contains(target))
    ) {
      popup.style.display = 'none';
    }
  }
});

// Replace alias in the input field
function insertEmoji(alias) {
  console.group('insertEmoji Debug');
  console.log('Alias:', alias);

  const sel = window.getSelection();
  if (!sel.rangeCount) {
    console.log('No selection');
    console.groupEnd();
    return;
  }

  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  console.log('Before insertion, text:', node.textContent);
  console.log('Caret offset:', range.startOffset);

  const beforeCaret = node.textContent.slice(0, range.startOffset);
  const match = /:(\w{1,30})$/.exec(beforeCaret);
  console.log('BeforeCaret:', beforeCaret);
  console.log('Regex match:', match);

  if (!match) {
    console.warn('No alias match');
    console.groupEnd();
    return;
  }

  const emoji = emojiMap[alias];
  const aliasStart = beforeCaret.length - match[0].length;
  const afterCaret = node.textContent.slice(range.startOffset);
  const newText = beforeCaret.slice(0, aliasStart) + emoji + afterCaret;
  node.textContent = newText;

  const newOffset = aliasStart + emoji.length;
  range.setStart(node, newOffset);
  range.setEnd(node, newOffset);
  sel.removeAllRanges();
  sel.addRange(range);

  popup.style.display = 'none';
  selectedIndex = 0;

  // Ensure IG recognizes this change
  inputEl.focus();
  const evt = new Event('input', { bubbles: true });
  inputEl.dispatchEvent(evt);

  console.log('After insertion, text:', node.textContent);
  console.groupEnd();

  const usage = JSON.parse(localStorage.getItem('emojiUsage') || '{}');
  usage[alias] = (usage[alias] || 0) + 1;
  localStorage.setItem('emojiUsage', JSON.stringify(usage));
}

function setupInput(el) {
  inputEl = el;

  inputEl.addEventListener('keydown', e => {
    // only respond when popup is visible
    if (popup.style.display === 'block') {
      if (['ArrowDown','ArrowUp'].includes(e.key)) {
        e.preventDefault();
        selectedIndex = e.key === 'ArrowDown'
          ? (selectedIndex + 1) % matches.length
          : (selectedIndex - 1 + matches.length) % matches.length;
        updatePopup(matches, getCaretCoordinates());
        return;
      }

      if (['Tab','Enter'].includes(e.key)) {
        e.preventDefault();
        insertEmoji(matches[selectedIndex]);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        popup.style.display = 'none';
        return;
      }
    }
  });

  inputEl.addEventListener('keyup', e => {
  if ([
    'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
    'Tab','Enter','Escape',
    'Shift','Control','Alt','Meta'
  ].includes(e.key)) {
    return;
  }

  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const node = sel.getRangeAt(0).startContainer;
  const text = node.textContent.slice(0, sel.getRangeAt(0).startOffset);
  const match = /:(\w{1,30})$/.exec(text);

  if (!match) {
    if (popup.style.display === 'block') popup.style.display = 'none';
    return;
  }

  const partial = match[1].toLowerCase();
  let aliases = Object.keys(emojiMap).filter(a => a.includes(partial));

  const usage = JSON.parse(localStorage.getItem('emojiUsage') || '{}');
  aliases.sort((a, b) => (usage[b] || 0) - (usage[a] || 0));

  selectedIndex = 0;
  updatePopup(aliases.slice(0, 8), getCaretCoordinates());
});

}

// Detect when IG's DM input is ready
function initWhenReady() {
  const observedContainer = document.querySelector('main'); 
  if (!observedContainer) return console.warn('No main container to observe');

  const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    m.addedNodes.forEach(node => {
      if (node.nodeType === 1) {
        const input = node.querySelector && node.querySelector('[contenteditable="true"]');
        if (input && input !== inputEl) {
          console.log('New input found');
          createPopup();
          setupInput(input);
        }
      }
    });
  }
});

  observer.observe(document.body, { subtree: true, childList: true });
}

function observeForChanges() {
  const main = document.querySelector('main');
  if (!main) return;
  new MutationObserver(() => {
    const input = document.querySelector('[contenteditable="true"]');
    if (input && input !== inputEl) {
      console.log('Detected new chat input');
      createPopup();
      setupInput(input);
    }
  }).observe(main, { childList: true, subtree: true });
}

// On extension load:
initWhenReady();
observeForChanges();