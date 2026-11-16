// The web counterpart of WorkoutShareImageView.swift: draws the image the share button of a past workout shares on a
// canvas. Same layout and sizes as the SwiftUI view, in the appearance the app is shown in.

import { loadMuscleMask } from "@/components/ui/HighlightedBody";
import {
  moreExercisesText,
  SHARE_IMAGE_LIST,
  shareImageColumnHeight,
  shareImageExerciseHeight,
  workoutShareImageFileName,
  type WorkoutShareImageContent,
} from "@/lib/domain/workout-share-image";
import type { Muscle } from "@/types/models";

// 2:3, in points like the SwiftUI view. Drawn at 2x.
const WIDTH = 800;
const HEIGHT = 1200;
const SCALE = 2;

const PADDING = 36;
const CARD_RADIUS = 24;
const CARD_PADDING = 24;
const LOGO_SIZE = 44;
const OVERVIEW_TOP = 156;
const OVERVIEW_HEIGHT = 304;
const BODY_ASPECT = 1051 / 1261;
const SUMMARY_COLUMNS = 2;
const SUMMARY_ROWS = 4;
const LIST_TOP = 476;
const LIST_PADDING = 16;
const INDEX_WIDTH = 32;

const BODY_SRC = "/images/Highlighted%20Body";

interface Palette {
  dark: boolean;
  background: string;
  card: string;
  label: string;
  secondaryLabel: string;
  secondaryMuscle: string;
  sans: string;
  rounded: string;
}

/** The colors and fonts of the page, so the image looks like the app does right now */
function readPalette(): Palette {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const theme = root.dataset.theme;
  const dark = theme === "dark" || (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const sans = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  return {
    dark,
    // In the dark appearance the page is black: the cards are told apart by their color alone
    background: token("--grouped-bg", dark ? "#000000" : "#f2f2f7"),
    card: token("--cell-bg", dark ? "#1c1c1e" : "#ffffff"),
    label: token("--foreground", dark ? "#ffffff" : "#000000"),
    secondaryLabel: token("--secondary-label", dark ? "rgba(235, 235, 245, 0.6)" : "rgba(60, 60, 67, 0.6)"),
    secondaryMuscle: token("--secondary-muscle", "#ff9500"),
    sans,
    rounded: `ui-rounded, "SF Pro Rounded", ${sans}`,
  };
}

/** Null if the image can't be loaded (e.g. offline without cache): the image is then drawn without it */
async function loadImage(src: string): Promise<HTMLImageElement | null> {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  try {
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

/** The text, shortened with "…" if it is wider than `maxWidth` in the current font */
function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text;
  const characters = Array.from(text);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = `${characters.slice(0, middle).join("").trimEnd()}…`;
    if (context.measureText(candidate).width <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return `${characters.slice(0, low).join("").trimEnd()}…`;
}

function fillCard(context: CanvasRenderingContext2D, palette: Palette, x: number, y: number, width: number, height: number) {
  context.save();
  if (!palette.dark) {
    context.shadowColor = "rgba(0, 0, 0, 0.06)";
    context.shadowBlur = 10 * SCALE;
    context.shadowOffsetY = 4 * SCALE;
  }
  context.fillStyle = palette.card;
  context.beginPath();
  context.roundRect(x, y, width, height, CARD_RADIUS);
  context.fill();
  context.restore();
}

/** The mask of a muscle in a color, in the box of the body */
function drawMuscle(
  context: CanvasRenderingContext2D,
  mask: HTMLImageElement,
  color: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const layer = document.createElement("canvas");
  layer.width = Math.round(width * SCALE);
  layer.height = Math.round(height * SCALE);
  const layerContext = layer.getContext("2d");
  if (!layerContext) return;
  drawContained(layerContext, mask, 0, 0, layer.width, layer.height);
  layerContext.globalCompositeOperation = "source-in";
  layerContext.fillStyle = color;
  layerContext.fillRect(0, 0, layer.width, layer.height);
  context.drawImage(layer, x, y, width, height);
}

/** Like `object-fit: contain`, centered */
function drawContained(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (width - drawnWidth) / 2, y + (height - drawnHeight) / 2, drawnWidth, drawnHeight);
}

/** The image of the workout as a PNG file: the logo, the body with the totals and the first exercises */
export async function renderWorkoutShareImage(
  content: WorkoutShareImageContent,
  muscles: { primary: readonly Muscle[]; secondary: readonly Muscle[] },
): Promise<File> {
  const palette = readPalette();
  const loadMasks = (list: readonly Muscle[]) =>
    Promise.all(
      list.map(async (muscle) => {
        const mask = await loadMuscleMask(muscle);
        return mask ? loadImage(mask) : null;
      }),
    );
  const [logo, outline, primaryMasks, secondaryMasks] = await Promise.all([
    loadImage("/icon.png"),
    loadImage(`${BODY_SRC}/highlighted_body_${palette.dark ? "white" : "black"}.png`),
    loadMasks(muscles.primary),
    loadMasks(muscles.secondary),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = HEIGHT * SCALE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas");
  context.scale(SCALE, SCALE);
  context.textBaseline = "middle";

  context.fillStyle = palette.background;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  // The logo in the top left corner, the date on the right
  const headerCenter = 32 + LOGO_SIZE / 2;
  if (logo) {
    context.save();
    context.beginPath();
    context.roundRect(PADDING, 32, LOGO_SIZE, LOGO_SIZE, 11);
    context.clip();
    context.drawImage(logo, PADDING, 32, LOGO_SIZE, LOGO_SIZE);
    context.restore();
    if (palette.dark) {
      // the black icon would disappear on the dark background without its edge
      context.strokeStyle = "rgba(255, 255, 255, 0.2)";
      context.lineWidth = 1;
      context.beginPath();
      context.roundRect(PADDING + 0.5, 32.5, LOGO_SIZE - 1, LOGO_SIZE - 1, 10.5);
      context.stroke();
    }
  }
  context.fillStyle = palette.label;
  context.font = `700 24px ${palette.rounded}`;
  const wordmarkX = PADDING + (logo ? LOGO_SIZE + 12 : 0);
  context.fillText("Gym 2.0", wordmarkX, headerCenter);
  const wordmarkEnd = wordmarkX + context.measureText("Gym 2.0").width;

  context.fillStyle = palette.secondaryLabel;
  context.font = `400 19px ${palette.sans}`;
  context.textAlign = "right";
  context.fillText(fitText(context, content.date, WIDTH - PADDING - wordmarkEnd - 40), WIDTH - PADDING, headerCenter);
  context.textAlign = "left";

  context.fillStyle = palette.label;
  context.font = `700 40px ${palette.sans}`;
  context.fillText(fitText(context, content.name, WIDTH - 2 * PADDING), PADDING, 118);

  // The body with the totals of the workout next to it
  const cardWidth = WIDTH - 2 * PADDING;
  fillCard(context, palette, PADDING, OVERVIEW_TOP, cardWidth, OVERVIEW_HEIGHT);
  const bodyHeight = OVERVIEW_HEIGHT - 2 * CARD_PADDING;
  const bodyWidth = bodyHeight * BODY_ASPECT;
  const bodyX = PADDING + CARD_PADDING;
  const bodyY = OVERVIEW_TOP + CARD_PADDING;
  for (const mask of secondaryMasks) {
    if (mask) drawMuscle(context, mask, palette.secondaryMuscle, bodyX, bodyY, bodyWidth, bodyHeight);
  }
  for (const mask of primaryMasks) {
    if (mask) drawMuscle(context, mask, "#ff0000", bodyX, bodyY, bodyWidth, bodyHeight);
  }
  if (outline) drawContained(context, outline, bodyX, bodyY, bodyWidth, bodyHeight);

  const summaryX = bodyX + bodyWidth + 40;
  const summaryColumnWidth = (PADDING + cardWidth - CARD_PADDING - summaryX) / SUMMARY_COLUMNS;
  const summaryRowHeight = bodyHeight / SUMMARY_ROWS;
  content.lines.slice(0, SUMMARY_ROWS * SUMMARY_COLUMNS).forEach((line, index) => {
    const x = summaryX + (index % SUMMARY_COLUMNS) * summaryColumnWidth;
    const center = bodyY + Math.floor(index / SUMMARY_COLUMNS) * summaryRowHeight + summaryRowHeight / 2;
    context.fillStyle = palette.secondaryLabel;
    context.font = `400 18px ${palette.sans}`;
    context.fillText(fitText(context, line.title, summaryColumnWidth - 16), x, center - 20);
    context.fillStyle = palette.label;
    context.font = `600 32px ${palette.rounded}`;
    context.fillText(fitText(context, line.value, summaryColumnWidth - 16), x, center + 14);
  });

  // The exercises with their sets, column by column
  const listHeight = Math.max(0, ...content.columns.map(shareImageColumnHeight)) + 2 * LIST_PADDING;
  if (content.columns.length > 0) fillCard(context, palette, PADDING, LIST_TOP, cardWidth, listHeight);
  const columnWidth = (cardWidth - 2 * CARD_PADDING) / Math.max(1, content.columns.length);
  const textWidth = columnWidth - INDEX_WIDTH - 16;
  content.columns.forEach((column, columnIndex) => {
    const x = PADDING + CARD_PADDING + columnIndex * columnWidth;
    let y = LIST_TOP + LIST_PADDING;
    for (const exercise of column) {
      const nameCenter = y + SHARE_IMAGE_LIST.nameHeight / 2;
      context.fillStyle = palette.secondaryLabel;
      context.font = `600 18px ${palette.rounded}`;
      context.fillText(String(exercise.number), x, nameCenter);
      context.fillStyle = palette.label;
      context.font = `600 20px ${palette.sans}`;
      context.fillText(fitText(context, exercise.name, textWidth), x + INDEX_WIDTH, nameCenter);
      context.fillStyle = palette.secondaryLabel;
      context.font = `400 16px ${palette.sans}`;
      exercise.lines.forEach((line, index) => {
        const center = y + SHARE_IMAGE_LIST.nameHeight + (index + 0.5) * SHARE_IMAGE_LIST.lineHeight;
        context.fillText(fitText(context, line, textWidth), x + INDEX_WIDTH, center);
      });
      y += shareImageExerciseHeight(exercise) + SHARE_IMAGE_LIST.gap;
    }
  });

  // The indicator that the workout had more exercises
  const more = moreExercisesText(content.moreExercises);
  if (more) {
    context.fillStyle = palette.secondaryLabel;
    context.font = `500 18px ${palette.sans}`;
    context.textAlign = "center";
    context.fillText(more, WIDTH / 2, (LIST_TOP + listHeight + HEIGHT) / 2);
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The image could not be made");
  return new File([blob], workoutShareImageFileName(content.name), { type: "image/png" });
}
