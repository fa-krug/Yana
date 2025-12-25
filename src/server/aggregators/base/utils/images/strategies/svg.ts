/**
 * SVG extraction strategy.
 */

import * as cheerio from "cheerio";
import sharp from "sharp";

import {
  MAX_HEADER_IMAGE_WIDTH,
  MAX_HEADER_IMAGE_HEIGHT,
} from "@server/aggregators/base/utils/compression";
import { logger } from "@server/utils/logger";

const MAX_IMAGE_WIDTH = 600;
const MAX_IMAGE_HEIGHT = 600;

interface SvgData {
  svgHtml: string;
  backgroundColor: string | null;
  textColor: string | null;
  width: number;
  height: number;
}

/**
 * Extract SVG data from the page using Playwright evaluation.
 */
async function extractSvgDataFromPage(page: any): Promise<SvgData | null> {
  if (!page?.locator) return null;

  const svgLocator = page.locator("svg").first();
  if ((await svgLocator.count()) === 0) return null;

  return (await svgLocator.evaluate((svg: SVGSVGElement) => {
    const parent = svg.parentElement;
    const parentStyle = parent ? window.getComputedStyle(parent) : null;
    const svgStyle = window.getComputedStyle(svg);

    const getBgColor = (style: CSSStyleDeclaration | null) => {
      const bg = style?.backgroundColor;
      return (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") ? bg : null;
    };

    const getTextColor = (style: CSSStyleDeclaration | null) => {
      const color = style?.color;
      return (color && color !== "rgba(0, 0, 0, 0)") ? color : null;
    };

    let textColor = getTextColor(parentStyle) || getTextColor(svgStyle);
    if (!textColor) {
      const firstElem = svg.querySelector("path, circle, rect, polygon, text");
      if (firstElem) {
        const fill = window.getComputedStyle(firstElem).fill;
        if (fill && fill !== "none" && fill !== "rgba(0, 0, 0, 0)") textColor = fill;
      }
    }

    return {
      svgHtml: svg.outerHTML,
      backgroundColor: getBgColor(parentStyle) || getBgColor(svgStyle),
      textColor,
      width: svg.width.baseVal.value || svg.viewBox.baseVal.width || 100,
      height: svg.height.baseVal.value || svg.viewBox.baseVal.height || 100,
    };
  })) as SvgData | null;
}

/**
 * Apply text and background colors to SVG content and wrap it.
 */
function applyColorsToSvg(data: SvgData): string {
  let innerContent = data.svgHtml.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");

  if (data.textColor) {
    const fillValue = `fill="${data.textColor}"`;
    innerContent = innerContent.replace(
      /<(path|circle|rect|polygon|polyline|line|ellipse|text|g)([^>]*?)>/gi,
      (match, tag, attrs) => {
        if (!/\bfill\s*=/i.test(attrs)) return `<${tag}${attrs} ${fillValue}>`;
        return `<${tag}${attrs.replace(/\bfill\s*=\s*["'][^"']*["']/gi, fillValue)}>`;
      },
    );
  }

  const padding = Math.min(data.width, data.height) * 0.1;
  const paddedWidth = data.width + padding * 2;
  const paddedHeight = data.height + padding * 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${paddedWidth}" height="${paddedHeight}" viewBox="0 0 ${paddedWidth} ${paddedHeight}">
    ${data.backgroundColor ? `<rect width="100%" height="100%" fill="${data.backgroundColor}"/>` : ""}
    <g transform="translate(${padding}, ${padding})">${innerContent}</g>
  </svg>`;
}

/**
 * Convert SVG HTML to PNG buffer.
 */
async function convertSvgToPng(svgHtml: string, isHeaderImage: boolean): Promise<Buffer> {
  const targetSize = isHeaderImage
    ? { width: MAX_HEADER_IMAGE_WIDTH, height: MAX_HEADER_IMAGE_HEIGHT }
    : { width: MAX_IMAGE_WIDTH, height: MAX_IMAGE_HEIGHT };

  return await sharp(Buffer.from(svgHtml, "utf-8"))
    .resize(targetSize.width, targetSize.height, { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
}

/**
 * Extract SVG from HTML using Cheerio or Regex fallback.
 */
function extractSvgFromHtml($: cheerio.CheerioAPI, html: string): string | null {
  const firstSvg = $("svg").first();
  if (firstSvg.length > 0) return $("<div>").append(firstSvg.clone()).html();

  const svgMatch = /<svg[^>]*>[\s\S]*?<\/svg>/i.exec(html);
  if (svgMatch?.[0] && svgMatch[0].length > 200) return svgMatch[0];

  return null;
}

/**
 * Handle inline SVG extraction from page.
 */
export async function handleInlineSvg(
  page: any,
  $: cheerio.CheerioAPI,
  html: string,
  _url: string,
  isHeaderImage: boolean,
): Promise<{ imageData: Buffer; contentType: string } | null> {
  if ($("svg").length === 0) return null;

  try {
    const svgData = await extractSvgDataFromPage(page);
    if (svgData?.svgHtml) {
      const finalSvgHtml = (svgData.backgroundColor || svgData.textColor) ? applyColorsToSvg(svgData) : svgData.svgHtml;
      const converted = await convertSvgToPng(finalSvgHtml, isHeaderImage);
      return { imageData: converted, contentType: "image/png" };
    }
  } catch (error) {
    logger.debug({ error }, "Failed to process SVG from page, falling back to HTML extraction");
  }

  const fallbackSvgHtml = extractSvgFromHtml($, html);
  if (fallbackSvgHtml && (fallbackSvgHtml.includes("<path") || fallbackSvgHtml.length > 500)) {
    try {
      const converted = await convertSvgToPng(fallbackSvgHtml, isHeaderImage);
      return { imageData: converted, contentType: "image/png" };
    } catch (error) {
      logger.warn({ error, svgLength: fallbackSvgHtml.length }, "Failed to convert fallback SVG");
    }
  }

  return null;
}