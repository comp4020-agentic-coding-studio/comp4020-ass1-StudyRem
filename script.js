// Your prototype's JavaScript goes here. This file exists so the lint
// sensor has something to check from day one.
const intro = document.querySelector('[data-testid="intro"]');
if (intro) {
  intro.dataset.ready = "true";
}
