export class Graphics {
  swordSprites: {
    default: HTMLImageElement | HTMLCanvasElement,
    yellowOutline: HTMLImageElement | HTMLCanvasElement,
    greenOutline: HTMLImageElement | HTMLCanvasElement,
  };
  arrowSprite: HTMLCanvasElement;
  xSprite: HTMLCanvasElement; // <-- Add xSprite

  constructor(canvas: HTMLCanvasElement) {
    // Load sword sprites
    this.swordSprites = {
      default: new Image(),
      yellowOutline: new Image(),
      greenOutline: new Image(),
    };
    const swordImage = new Image();
    swordImage.src = 'sword.png';

    // add a scaled sword image to elements once swordImage is loaded
    swordImage.addEventListener('load', () => {
      let scale_factor = (0.15 * canvas.width) / swordImage.width;
      this.swordSprites.default = scaleImage(swordImage, scale_factor, scale_factor);
      let untinted = makeGlow(this.swordSprites.default, 0.1);
      this.swordSprites.yellowOutline = tintImage(untinted, [1.0, 1.0, 0.2]);
      this.swordSprites.greenOutline = tintImage(untinted, [0.2, 1.0, 0.2]);
    });

    const arrowImage = new Image();
    arrowImage.src = 'arrow.png';
    this.arrowSprite = document.createElement('canvas');
    arrowImage.addEventListener('load', () => {
      let scale_factor = (0.05 * canvas.width) / arrowImage.width;
      const scaled = scaleImage(arrowImage, scale_factor, scale_factor);
      const glowBefore = makeGlow(scaled, 0.1);
      const glow = tintImage(glowBefore, [1.0, 0.5, 0.5]);
      
      // draw scaled onto glowBig
      const ctx2 = glow.getContext('2d')!;
      ctx2.drawImage(scaled, (glow.width - scaled.width) / 2, (glow.height - scaled.height) / 2);

      this.arrowSprite = glow;
    });

    // --- X sprite loading and glow ---
    const xImage = new Image();
    xImage.src = 'x.png';
    this.xSprite = document.createElement('canvas');
    xImage.addEventListener('load', () => {
      let scale_factor = (0.05 * canvas.width) / xImage.width;
      const scaled = scaleImage(xImage, scale_factor, scale_factor);
      const glowBefore = makeGlow(scaled, 0.1);
      const glow = tintImage(glowBefore, [1.0, 0.5, 0.5]);
      const ctx2 = glow.getContext('2d')!;
      ctx2.drawImage(scaled, (glow.width - scaled.width) / 2, (glow.height - scaled.height) / 2);
      this.xSprite = glow;
    });
  }
}

function scaleImage(image: HTMLImageElement | HTMLCanvasElement, scaleW: number, scaleH: number) {
  const newCanvas = document.createElement('canvas');
  newCanvas.width = image.width * scaleW;
  newCanvas.height = image.height * scaleH;
  const ctx = newCanvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0, newCanvas.width, newCanvas.height);
  return newCanvas;
}


// Make a white glow around the image or canvas.
// The glow is created by doing a blur on the image
function makeGlow(img: HTMLCanvasElement, range: number): HTMLCanvasElement {
  // first, make a version of the image with is black and white
  const canvas1 = document.createElement('canvas');
  canvas1.width = img.width;
  canvas1.height = img.height;
  const ctx1 = canvas1.getContext('2d')!;
  ctx1.drawImage(img, 0.0, 0.0);
  const imageData = ctx1.getImageData(0, 0, canvas1.width, canvas1.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i+3] > 0) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
  }
  ctx1.putImageData(imageData, 0, 0);

  const canvas = document.createElement('canvas');
  canvas.width = img.width*1.5;
  canvas.height = img.height*1.5;
  const ctx = canvas.getContext('2d')!;
  const blur_num_pxs = Math.floor(canvas.width * range);
  ctx.filter = `blur(${blur_num_pxs}px) brightness(100%)`;
  const drawX = (canvas.width - img.width) / 2;
  const drawY = (canvas.height - img.height) / 2;
  ctx.drawImage(canvas1, drawX, drawY);

  // get the image data and make alpha channel less transparent
  const imageData2 = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data2 = imageData2.data;
  for (let i = 0; i < data2.length; i += 4) {
    data2[i + 3] = Math.min(255, Math.pow(data2[i + 3], 1.5));
  }
  ctx.putImageData(imageData2, 0, 0);

  // also make a short bright outline around the image
  ctx.filter = 'blur(4px) brightness(1000%)';
  ctx.drawImage(canvas1, drawX, drawY);


  return canvas;
}


// given an image/canvas and a color multiplier, multiply each rgb value
// in the image by the color multiplier element-wise
// color multiplier is an array of 3 values
function tintImage(image: HTMLImageElement | HTMLCanvasElement, color_multiplier: [number, number, number]) {
  const newCanvas = document.createElement('canvas');
  newCanvas.width = image.width;
  newCanvas.height = image.height;
  const ctx = newCanvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0, newCanvas.width, newCanvas.height);
  const imageData = ctx.getImageData(0, 0, newCanvas.width, newCanvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] *= color_multiplier[0];
    data[i + 1] *= color_multiplier[1];
    data[i + 2] *= color_multiplier[2];
  }
  ctx.putImageData(imageData, 0, 0);
  return newCanvas;
}
