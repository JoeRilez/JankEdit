export const DEFAULTS = {
  fontSize:    14,
  tabSize:      4,
  wordWrap:  false,
  minimap:    true,
  lineNumbers: true,
  autoSave:   true,
}

export function loadSettings() {
  try {
    const saved = localStorage.getItem('jankedit-settings')
    return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(s) {
  localStorage.setItem('jankedit-settings', JSON.stringify(s))
}
