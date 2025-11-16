(function () {
  document.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-copy-target]");
    if (!btn) return;

    const targetSelector = btn.getAttribute("data-copy-target");
    const field = document.querySelector(targetSelector);
    if (!field) return;

    const value = field.value || field.textContent || "";

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(
        function () {
          btn.classList.add("copied");
          setTimeout(function () {
            btn.classList.remove("copied");
          }, 800);
        },
        function () {
          fallbackCopy(field, btn);
        }
      );
    } else {
      fallbackCopy(field, btn);
    }
  });

  function fallbackCopy(field, btn) {
    // For readonly textareas this still works
    field.select();
    field.setSelectionRange(0, field.value.length || field.textContent.length);

    try {
      document.execCommand("copy");
      btn.classList.add("copied");
      setTimeout(function () {
        btn.classList.remove("copied");
      }, 800);
    } catch (err) {
      console.error("Copy failed", err);
    } finally {
      window.getSelection().removeAllRanges();
    }
  }
})();
