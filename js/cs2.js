function copyCode(button) {
  const codeBlock = button.previousElementSibling;
  const text = codeBlock.innerText;

  navigator.clipboard.writeText(text).then(
    function () {
      const originalText = button.innerHTML;
      button.innerHTML = '<i class="fas fa-check"></i>';

      setTimeout(function () {
        button.innerHTML = originalText;
      }, 3000);
    },
    function () {
      alert("Failed to copy text");
    }
  );
}

document.addEventListener("DOMContentLoaded", function () {
  initCarousel("crosshair");
});

function initCarousel(carouselId) {
  const prevBtn = document.getElementById(`prev-${carouselId}`);
  const nextBtn = document.getElementById(`next-${carouselId}`);
  const images = document.querySelectorAll(`.${carouselId}-img`);
  const indicators = document.querySelectorAll(
    `.indicator[data-target="${carouselId}"]`
  );

  if (!prevBtn || !nextBtn || images.length === 0) return;

  let currentIndex = 0;

  function showImage(index) {
    images.forEach((img) => {
      img.classList.remove("active");
    });

    if (indicators.length > 0) {
      indicators.forEach((dot) => {
        dot.classList.remove("active");
      });
      indicators[index].classList.add("active");
    }

    images[index].classList.add("active");

    currentIndex = index;
  }

  prevBtn.addEventListener("click", function () {
    let newIndex = currentIndex - 1;
    if (newIndex < 0) {
      newIndex = images.length - 1;
    }
    showImage(newIndex);
  });

  nextBtn.addEventListener("click", function () {
    let newIndex = currentIndex + 1;
    if (newIndex >= images.length) {
      newIndex = 0;
    }
    showImage(newIndex);
  });

  indicators.forEach((dot) => {
    dot.addEventListener("click", function () {
      const index = parseInt(this.getAttribute("data-index"));
      showImage(index);
    });
  });
}

window.copyCode = copyCode;
window.initCarousel = initCarousel;
