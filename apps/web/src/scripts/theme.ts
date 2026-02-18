// Theme toggle logic
export function setupTheme() {
  const themeToggle = document.getElementById('theme-toggle')

  themeToggle?.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark')
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  })
}
