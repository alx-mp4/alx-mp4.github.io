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
  setTimeout(function() {
    setupCarousel("crosshair");
    setupCarousel("viewmodel");
  }, 100);
});

function setupCarousel(carouselId) {
  const carousel = document.getElementById(`${carouselId}-carousel`);
  if (!carousel) return;

  const prevBtn = document.getElementById(`prev-${carouselId}`);
  const nextBtn = document.getElementById(`next-${carouselId}`);
  const images = carousel.querySelectorAll(`.preview-img`);
  const indicators = document.querySelectorAll(
    `.preview-dot[data-target="${carouselId}"]`
  );

  if (!prevBtn || !nextBtn || images.length === 0) return;

  let currentIndex = 0;

  function showImage(index) {
    images.forEach(img => {
      img.classList.remove('active');
      img.style.display = 'none';
    });
    
    if (indicators && indicators.length > 0) {
      indicators.forEach(dot => {
        dot.classList.remove('active');
      });
      
      if (indicators[index]) {
        indicators[index].classList.add('active');
      }
    }
    
    if (images[index]) {
      images[index].classList.add('active');
      images[index].style.display = 'block';
      currentIndex = index;
    }
  }

  showImage(0);

  prevBtn.addEventListener('click', function(e) {
    e.preventDefault();
    let newIndex = currentIndex - 1;
    if (newIndex < 0) {
      newIndex = images.length - 1;
    }
    showImage(newIndex);
  });

  nextBtn.addEventListener('click', function(e) {
    e.preventDefault();
    let newIndex = currentIndex + 1;
    if (newIndex >= images.length) {
      newIndex = 0;
    }
    showImage(newIndex);
  });

  indicators.forEach(dot => {
    dot.addEventListener('click', function() {
      const index = parseInt(this.getAttribute('data-index'), 10);
      showImage(index);
    });
  });
}

window.copyCode = copyCode;