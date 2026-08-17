// Sets theme before first paint to prevent flash of wrong theme.
// Must be loaded as the first script in <head>.
document.documentElement.dataset.theme = localStorage.getItem('jk_theme') || 'dark';
document.documentElement.dataset.contrast = localStorage.getItem('jk_contrast') || 'low';
