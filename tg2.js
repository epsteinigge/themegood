let slides = document.querySelectorAll(".slide");
let dots = document.querySelectorAll(".dot");
let index = 0;

function showSlide(i) {
    slides[index].classList.remove("active");
    dots[index].classList.remove("active");
    index = (i + slides.length) % slides.length;
    slides[index].classList.add("active");
    dots[index].classList.add("active");
}

function nextSlide() { showSlide(index + 1); }
function prevSlide() { showSlide(index - 1); }
function goToSlide(i) { showSlide(i); }

setInterval(nextSlide, 5000);