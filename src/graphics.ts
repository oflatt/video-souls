export class Graphics {
  swordSprites: {
    default: HTMLImageElement | HTMLCanvasElement,
    yellowOutline: HTMLImageElement | HTMLCanvasElement,
    greenOutline: HTMLImageElement | HTMLCanvasElement,
    orangeOutline: HTMLImageElement | HTMLCanvasElement, // <-- add orange outline
  };
  arrowSprite: HTMLCanvasElement;
  xSprite: HTMLCanvasElement;
  criticalSprite: HTMLCanvasElement;
  centerCriticalSprite: HTMLCanvasElement; // <-- new property

  constructor(canvas: HTMLCanvasElement) {
    // Load sword sprites
    this.swordSprites = {
      default: new Image(),
      yellowOutline: new Image(),
      greenOutline: new Image(),
      orangeOutline: new Image(), // <-- initialize orange outline
    };
    const swordImage = new Image();
    swordImage.src = 'sword.png';

    // add a scaled sword image to elements once swordImage is loaded
    swordImage.addEventListener('load', () => {
      // Use a fixed large size for the sword, similar to arrow/x
      const swordSize = 200;
      let scale_factor = swordSize / swordImage.width;
      const scaledSword = scaleImage(swordImage, scale_factor, scale_factor);

      // Center the sword in a square canvas of swordSize
      const finalSwordCanvas = document.createElement('canvas');
      finalSwordCanvas.width = swordSize;
      finalSwordCanvas.height = swordSize;
      const finalSwordCtx = finalSwordCanvas.getContext('2d')!;
      finalSwordCtx.drawImage(
        scaledSword,
        (swordSize - scaledSword.width) / 2,
        (swordSize - scaledSword.height) / 2
      );
      this.swordSprites.default = finalSwordCanvas;

      let untinted = makeGlow(this.swordSprites.default, 0.1);
      this.swordSprites.yellowOutline = tintImage(untinted, [1.0, 1.0, 0.2]);
      this.swordSprites.greenOutline = tintImage(untinted, [0.2, 1.0, 0.2]);
      this.swordSprites.orangeOutline = tintImage(untinted, [1.0, 0.55, 0.2]); // <-- precompute orange
    });

    const arrowImage = new Image();
    arrowImage.src = 'arrow.png';
    this.arrowSprite = document.createElement('canvas');
    arrowImage.addEventListener('load', () => {
      const arrowSize = 200;
      let scale_factor = arrowSize / arrowImage.width;
      const scaled = scaleImage(arrowImage, scale_factor, scale_factor);
      const glowBefore = makeGlow(scaled, 0.1);
      const glow = tintImage(glowBefore, [1.0, 0.5, 0.5]);

      // Make the final canvas larger to fit the glow (add margin for blur)
      const margin = Math.ceil(Math.max(glow.width, glow.height) * 0.15);
      const finalSize = Math.max(arrowSize, glow.width, glow.height) + margin * 2;
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = finalSize;
      finalCanvas.height = finalSize;
      const finalCtx = finalCanvas.getContext('2d')!;
      // Center the glow in the final canvas
      finalCtx.drawImage(
        glow,
        (finalSize - glow.width) / 2,
        (finalSize - glow.height) / 2
      );
      // Draw the arrow on top of the glow, centered
      finalCtx.drawImage(
        scaled,
        (finalSize - scaled.width) / 2,
        (finalSize - scaled.height) / 2
      );

      this.arrowSprite = finalCanvas;
    });

    // Load critical sprite
    const criticalImage = new Image();
    criticalImage.src = 'critical.png';
    this.criticalSprite = document.createElement('canvas');
    criticalImage.addEventListener('load', () => {
      const size = 200;
      let scale_factor = size / criticalImage.width;
      const scaled = scaleImage(criticalImage, scale_factor, scale_factor);
      // Remove glow: just draw the scaled image centered
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = size;
      finalCanvas.height = size;
      const finalCtx = finalCanvas.getContext('2d')!;
      finalCtx.drawImage(
        scaled,
        (size - scaled.width) / 2,
        (size - scaled.height) / 2
      );
      this.criticalSprite = finalCanvas;
    });

    // Load center critical sprite
    const centerCriticalImage = new Image();
    centerCriticalImage.src = 'centercritical.png';
    this.centerCriticalSprite = document.createElement('canvas');
    centerCriticalImage.addEventListener('load', () => {
      const size = 200;
      let scale_factor = size / centerCriticalImage.width;
      const scaled = scaleImage(centerCriticalImage, scale_factor, scale_factor);
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = size;
      finalCanvas.height = size;
      const finalCtx = finalCanvas.getContext('2d')!;
      finalCtx.drawImage(
        scaled,
        (size - scaled.width) / 2,
        (size - scaled.height) / 2
      );
      this.centerCriticalSprite = finalCanvas;
    });

    const xSize = 200;
    const xCanvas = document.createElement('canvas');
    xCanvas.width = xSize;
    xCanvas.height = xSize;
    const xCtx = xCanvas.getContext('2d')!;
    xCtx.save();
    xCtx.strokeStyle = "#000";
    xCtx.lineWidth = xSize * 0.08;
    xCtx.lineCap = "round";
    xCtx.beginPath();
    xCtx.moveTo(xSize * 0.2, xSize * 0.2);
    xCtx.lineTo(xSize * 0.8, xSize * 0.8);
    xCtx.moveTo(xSize * 0.8, xSize * 0.2);
    xCtx.lineTo(xSize * 0.2, xSize * 0.8);
    xCtx.stroke();
    xCtx.restore();

    // Apply glow and tint to match arrow style, but with less blur for the X
    const glowBefore = makeGlow(xCanvas, 0.05);
    const glow = tintImage(glowBefore, [1.0, 0.5, 0.5]);
    const ctx2 = glow.getContext('2d')!;
    ctx2.drawImage(xCanvas, (glow.width - xCanvas.width) / 2, (glow.height - xCanvas.height) / 2);
    this.xSprite = glow;
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
