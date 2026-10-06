import {
  encodeArchitecture,
  getChallenge,
  DIMENSION_LABELS,
  type Architecture,
  type ArchitectureEvaluation,
} from '@/lib/architecture'

/** Absolute link that reopens this design, e.g. …/#/simulator?challenge=video-platform&architecture=… */
export function shareUrl(arch: Architecture): string {
  const params = new URLSearchParams({ challenge: arch.challengeId, architecture: encodeArchitecture(arch) })
  return `${window.location.origin}${window.location.pathname}#/simulator?${params.toString()}`
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older browsers or insecure contexts: fall back to a hidden textarea.
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.setAttribute('readonly', '')
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      el.remove()
      return ok
    } catch {
      return false
    }
  }
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Text version of the result card, for pasting anywhere. */
export function shareText(arch: Architecture, evaluation: ArchitectureEvaluation): string {
  const title = getChallenge(arch.challengeId)?.title ?? arch.challengeId
  const s = evaluation.scores
  return [
    'ARCHITECTURE LAB',
    '',
    `I designed a ${title}`,
    '',
    `Architecture Score ${evaluation.overallScore.toFixed(1)} / 10`,
    `${DIMENSION_LABELS.scalability} ${s.scalability.value.toFixed(1)} · ${DIMENSION_LABELS.reliability} ${s.reliability.value.toFixed(1)} · ${DIMENSION_LABELS.performance} ${s.performance.value.toFixed(1)}`,
    '',
    'Can you design it better?',
    shareUrl(arch),
  ].join('\n')
}

/**
 * Draws the result as a 1200×630 social card (the Open Graph size) and
 * returns it as a PNG. Plain canvas drawing: no screenshot library needed.
 */
export function renderResultCard(
  title: string,
  evaluation: ArchitectureEvaluation,
  footer = window.location.host,
): Promise<Blob | null> {
  const W = 1200
  const H = 630
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  const font = (size: number, weight = 400, mono = false) =>
    `${weight} ${size}px ${mono ? '"JetBrains Mono", ui-monospace, monospace' : 'Inter, ui-sans-serif, system-ui, sans-serif'}`

  ctx.fillStyle = '#0a0a0b'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }

  ctx.fillStyle = '#34d399'
  ctx.font = font(22, 600, true)
  ctx.fillText('ARCHITECTURE LAB', 72, 96)
  ctx.fillStyle = '#a1a1aa'
  ctx.font = font(30)
  ctx.fillText('I designed a', 72, 170)
  ctx.fillStyle = '#fafafa'
  ctx.font = font(54, 700)
  ctx.fillText(title, 72, 236)

  ctx.fillStyle = '#a1a1aa'
  ctx.font = font(24)
  ctx.fillText('Architecture Score', 72, 330)
  ctx.fillStyle = '#fafafa'
  ctx.font = font(96, 700, true)
  const score = evaluation.overallScore.toFixed(1)
  ctx.fillText(score, 72, 432)
  const w = ctx.measureText(score).width
  ctx.fillStyle = '#71717a'
  ctx.font = font(40, 500, true)
  ctx.fillText('/ 10', 72 + w + 16, 432)

  const rows: Array<[string, number]> = [
    ['Scalability', evaluation.scores.scalability.value],
    ['Reliability', evaluation.scores.reliability.value],
    ['Performance', evaluation.scores.performance.value],
  ]
  rows.forEach(([label, value], i) => {
    const y = 318 + i * 56
    ctx.fillStyle = '#a1a1aa'
    ctx.font = font(24)
    ctx.fillText(label, 640, y)
    ctx.fillStyle = '#232327'
    ctx.fillRect(820, y - 16, 220, 12)
    ctx.fillStyle = value >= 7.5 ? '#34d399' : value >= 5 ? '#fbbf24' : '#f87171'
    ctx.fillRect(820, y - 16, 22 * value, 12)
    ctx.fillStyle = '#fafafa'
    ctx.font = font(24, 600, true)
    ctx.fillText(value.toFixed(1), 1060, y)
  })

  ctx.fillStyle = '#fafafa'
  ctx.font = font(30, 600)
  ctx.fillText('Can you design it better?', 72, 540)
  ctx.fillStyle = '#71717a'
  ctx.font = font(22, 400, true)
  ctx.fillText(footer, 72, 580)

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
