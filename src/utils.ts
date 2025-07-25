// Rotate a vector by radians, clockwise
export function roatate_vec2(vec: [number, number], clockwise_angle: number): [number, number] {
  let angle = -clockwise_angle;
  let x = vec[0];
  let y = vec[1];
  let rotated_x = x * Math.cos(angle) - y * Math.sin(angle);
  let rotated_y = x * Math.sin(angle) + y * Math.cos(angle);
  return [rotated_x, rotated_y];
}

// Floating notification helper for editor
export function showFloatingAlert(
  message: string,
  fontSize: number = 40,
  position: string = "20px",
  color: string = 'white',
  font: string = 'Arial'
) {
  const alertText = document.createElement('div');
  alertText.classList.add("fading-alert");
  alertText.style.fontSize = `${fontSize}px`;
  alertText.style.top = position;
  alertText.style.color = color;
  alertText.style.fontFamily = font;
  alertText.textContent = message;
  alertText.style.position = "absolute";
  alertText.style.left = "50%";
  alertText.style.transform = "translateX(-50%)";
  alertText.style.zIndex = "2000";
  document.body.appendChild(alertText);
  setTimeout(() => {
    alertText.style.opacity = "0";
    setTimeout(() => alertText.remove(), 600);
  }, 1800);
}
