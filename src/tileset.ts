// ponytail: luminance-as-alpha, assumes the 1-bit black/white sheet this pack ships
export async function loadTileset(src: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = src;
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;
  for (let i = 0; i < px.length; i += 4) {
    px[i + 3] = px[i];
    px[i] = px[i + 1] = px[i + 2] = 255;
  }
  ctx.putImageData(image, 0, 0);

  return canvas;
}
