// Apply theme immediately to prevent flash on reload
(function () {
  const stored = localStorage.getItem("theme");
  let theme = stored;

  if (
    !theme &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    theme = "dark";
  }

  if (theme === "dark") {
    document.documentElement.classList.add("dark-theme");
  }
})();
