// Rotate a vector by radians, clockwise
export function roatate_vec2(vec: [number, number], clockwise_angle: number): [number, number] {
  let angle = -clockwise_angle;
  let x = vec[0];
  let y = vec[1];
  let rotated_x = x * Math.cos(angle) - y * Math.sin(angle);
  let rotated_y = x * Math.sin(angle) + y * Math.cos(angle);
  return [rotated_x, rotated_y];
}

const FRAME_LENGTH = 0.05; 

export function frameIndex(timestamp: number | { time: number }): number {
  if (typeof timestamp === "number") {
    return Math.floor(timestamp / FRAME_LENGTH);
  }
  return Math.floor(timestamp.time / FRAME_LENGTH);
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
  console.log("showFloatingAlert", message);
  document.body.appendChild(alertText);
  setTimeout(() => {
    alertText.style.opacity = "0";
    setTimeout(() => alertText.remove(), 2000);
  }, 1800);
}


// Helper function to extract the video ID from a YouTube URL, including Shorts
export function extractVideoID(url: string) {
  // Match regular, short, and shorts URLs
  const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:shorts\/|(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=))|youtu\.be\/)([^"&?/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}
