// Click-to-reveal logic for the algqual part pages.
// Every qual problem carries a tiny dot, a <span class="dot-target"
// data-prob="N">. Tap that dot twenty times within five seconds and the
// worked solution for that problem unfolds underneath it.
//
// Each page builds a global SOLUTIONS object keyed by the data-prob string.
// The values are HTML. A missing or null entry shows a short placeholder, so
// the trigger still does something visible.

function initDotTriggers() {
  const dots = document.querySelectorAll('.dot-target')

  dots.forEach(dot => {
    let clicks = []
    dot.addEventListener('click', e => {
      e.stopPropagation()
      const now = Date.now()
      clicks.push(now)
      // drop anything older than the five-second window
      while (clicks.length && now - clicks[0] > 5000) clicks.shift()
      if (clicks.length >= 20) {
        clicks = []
        toggleSolution(dot)
      }
    })
  })

  function toggleSolution(dot) {
    const li = dot.closest('li') || dot.parentElement
    const key = dot.dataset.prob

    // opened once already? just flip it shut or back open
    const existing = li.querySelector(':scope > .solution-panel')
    if (existing) {
      existing.classList.toggle('hidden')
      return
    }

    const filled = typeof SOLUTIONS !== 'undefined' && SOLUTIONS[key] != null
    // each newline in a sketch becomes a <br>, so it reads as a stack of
    // short lines rather than one dense block
    const bodyHtml = filled
      ? SOLUTIONS[key].replace(/\n/g, '<br>')
      : '<em>Solution not yet available.</em>'

    const panel = document.createElement('div')
    panel.className = 'solution-panel'
    panel.innerHTML = '<span class="solution-label">Solution &middot; ' + key + '</span>' + bodyHtml
    li.appendChild(panel)

    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise([panel])
    }
  }
}
