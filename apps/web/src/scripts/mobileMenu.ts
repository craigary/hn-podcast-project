// Mobile menu logic
export function setupMobileMenu() {
  const menuBtn = document.getElementById('menu-toggle')
  const mobileMenu = document.getElementById('mobile-menu')
  const iconMenu = document.getElementById('icon-menu')
  const iconClose = document.getElementById('icon-close')

  if (!menuBtn || !mobileMenu) return

  menuBtn.addEventListener('click', () => {
    const isNowOpen = mobileMenu.classList.contains('hidden')

    if (isNowOpen) {
      mobileMenu.classList.remove('hidden')
      iconMenu?.classList.add('hidden')
      iconClose?.classList.remove('hidden')
      menuBtn.setAttribute('aria-expanded', 'true')
    } else {
      mobileMenu.classList.add('hidden')
      iconMenu?.classList.remove('hidden')
      iconClose?.classList.add('hidden')
      menuBtn.setAttribute('aria-expanded', 'false')
    }
  })
}
