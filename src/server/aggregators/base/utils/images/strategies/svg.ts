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

/**
 * Handle inline SVG extraction from page.
 */
export async function handleInlineSvg(
  page: {
    evaluate: (fn: () => unknown) => Promise<unknown>;
    locator?: (selector: string) => {
      first: () => {
        count: () => Promise<number>;
        evaluate: (fn: (svg: SVGSVGElement) => unknown) => Promise<unknown>;
        locator?: (selector: string) => {
          first: () => {
            count: () => Promise<number>;
            elementHandle: () => Promise<unknown>;
          };
        };
      };
      elementHandle: () => Promise<unknown>;
    };
  } | null,
  $: cheerio.CheerioAPI,
  html: string,
  url: string,
  isHeaderImage: boolean,
): Promise<{ imageData: Buffer; contentType: string } | null> {
  const inlineSvgs = $("svg");

  if (inlineSvgs.length > 0) {
    // Try to find the SVG element on the page and screenshot it (including background from parent)
    try {
      // Find the first SVG element - check if it or its parent has a background
      const firstSvg = inlineSvgs.first();
      let _elementToScreenshot = firstSvg[0];

      // Check if parent has background color/style
      const parent = firstSvg.parent();
      if (parent.length > 0) {
        const parentStyle = parent.attr("style") || "";
        const parentClass = parent.attr("class") || "";
        // If parent has background-related styles/classes, screenshot the parent instead
        if (
          parentStyle.includes("background") ||
          parentClass.includes("background") ||
          parentStyle.match(/background-?color/i)
        ) {
          // Try to find the parent element on the page
          const parentSelector = parent.length > 0 ? `:has(> svg)` : null;
          if (parentSelector && page?.locator) {
            try {
              const svgElement = page.locator("svg").first();
              const parentElement = svgElement.locator?.("..").first();
              if (parentElement && (await parentElement.count()) > 0) {
                _elementToScreenshot = (await parentElement.elementHandle()) as any;
              }
            } catch {
              // Fallback to SVG itself
            }
          }
        }
      }

      // Try to extract SVG with its background color
      if (page?.locator) {
        const svgLocator = page.locator("svg").first();
        if ((await svgLocator.count()) > 0) {
          // Get SVG HTML, background color, and text color from parent
          const svgData = (await svgLocator.evaluate((svg: SVGSVGElement) => {
            const parent = svg.parentElement;
            const parentStyle = parent ? window.getComputedStyle(parent) : null;
            const svgStyle = window.getComputedStyle(svg);

            // Get background color from parent or SVG itself
            let backgroundColor: string | null = null;
            if (parentStyle) {
              const bgColor = parentStyle.backgroundColor;
              if (
                bgColor &&
                bgColor !== "rgba(0, 0, 0, 0)" &&
                bgColor !== "transparent"
              ) {
                backgroundColor = bgColor;
              }
            }
            if (!backgroundColor) {
              const bgColor = svgStyle.backgroundColor;
              if (
                bgColor &&
                bgColor !== "rgba(0, 0, 0, 0)" &&
                bgColor !== "transparent"
              ) {
                backgroundColor = bgColor;
              }
            }

            // Get text/foreground color from parent or SVG itself
            let textColor: string | null = null;
            if (parentStyle) {
              const color = parentStyle.color;
              if (color && color !== "rgba(0, 0, 0, 0)") {
                textColor = color;
              }
            }
            if (!textColor) {
              const color = svgStyle.color;
              if (color && color !== "rgba(0, 0, 0, 0)") {
                textColor = color;
              }
            }

            // Also check for fill color in SVG elements (common for SVG icons)
            if (!textColor) {
              const firstElement = svg.querySelector(
                "path, circle, rect, polygon, text",
              );
              if (firstElement) {
                const elementStyle = window.getComputedStyle(firstElement);
                const fill = elementStyle.fill;
                if (fill && fill !== "none" && fill !== "rgba(0, 0, 0, 0)") {
                  textColor = fill;
                }
              }
            }

            // Get SVG dimensions
            const viewBox = svg.viewBox.baseVal;
            const width = svg.width.baseVal.value || viewBox.width || 100;
            const height = svg.height.baseVal.value || viewBox.height || 100;

            // Get SVG outer HTML
            const svgHtml = svg.outerHTML;

            return {
              svgHtml,
              backgroundColor,
              textColor,
              width,
              height,
            };
          })) as {
            svgHtml: string;
            backgroundColor: string | null;
            textColor: string | null;
            width: number;
            height: number;
          } | null;

          if (svgData && svgData.svgHtml) {
            logger.debug(
              {
                hasBackground: !!svgData.backgroundColor,
                backgroundColor: svgData.backgroundColor,
                hasTextColor: !!svgData.textColor,
                textColor: svgData.textColor,
                width: svgData.width,
                height: svgData.height,
              },
              "Extracted SVG with background and text color",
            );

            // Extract inner SVG content (without the outer <svg> tag)
            let innerSvgContent = svgData.svgHtml
              .replace(/^<svg[^>]*>/, "")
              .replace(/<\/svg>$/, "");

            // Apply text color to SVG elements if it exists and elements don't have explicit fill
            if (svgData.textColor) {
              // Add fill to elements that don't have it, or replace existing fill with text color
              innerSvgContent = innerSvgContent.replace(
                /<(path|circle|rect|polygon|polyline|line|ellipse|text|g)([^>]*?)>/gi,
                (match: string, tag: string, attrs: string) => {
                  // Check if element already has fill attribute
                  if (!attrs.match(/\bfill\s*=/i)) {
                    // Add fill attribute with text color
                    return `<${tag}${attrs} fill="${svgData.textColor}">`;
                  } else {
                    // Replace existing fill with text color
                    return `<${tag}${attrs.replace(/\bfill\s*=\s*["'][^"']*["']/gi, `fill="${svgData.textColor}"`)}>`;
                  }
                },
              );
            }

            // Create SVG with background rectangle if background color exists
            let finalSvgHtml = svgData.svgHtml;
            if (svgData.backgroundColor || svgData.textColor) {
              // Add padding (10% on each side) to create breathing room
              const padding = Math.min(svgData.width, svgData.height) * 0.1;
              const paddedWidth = svgData.width + padding * 2;
              const paddedHeight = svgData.height + padding * 2;

              // Wrap SVG in a new SVG with background rectangle and updated content
              const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${paddedWidth}" height="${paddedHeight}" viewBox="0 0 ${paddedWidth} ${paddedHeight}">
${svgData.backgroundColor ? `  <rect width="100%" height="100%" fill="${svgData.backgroundColor}"/>` : ""}
  <g transform="translate(${padding}, ${padding})">
    ${innerSvgContent}
  </g>
</svg>`;
              finalSvgHtml = bgSvg;
            }

            // Convert to PNG
            const targetSize = isHeaderImage
              ? {
                  width: MAX_HEADER_IMAGE_WIDTH,
                  height: MAX_HEADER_IMAGE_HEIGHT,
                }
              : { width: MAX_IMAGE_WIDTH, height: MAX_IMAGE_HEIGHT };

            const converted = await sharp(Buffer.from(finalSvgHtml, "utf-8"))
              .resize(targetSize.width, targetSize.height, {
                fit: "inside",
                withoutEnlargement: false,
              })
              .png()
              .toBuffer();

            logger.debug(
              {
                originalSize: finalSvgHtml.length,
                convertedSize: converted.length,
              },
              "Successfully converted SVG with background to PNG",
            );

            return {
              imageData: converted,
              contentType: "image/png",
            };
          }
        }
      }
    } catch (error) {
      logger.debug(
        { error },
        "Failed to screenshot SVG, falling back to conversion",
      );
      // Fallback to converting SVG HTML
    }

    // Fallback: try to extract and convert SVG from HTML
    let svgHtml: string | null = null;
    if (inlineSvgs.length > 0) {
      const firstSvg = inlineSvgs.first();
      svgHtml = $("<div>").append(firstSvg.clone()).html();
    } else {
      // Fallback: try to extract SVG from raw HTML string
      const svgMatch = html.match(/<svg[^>]*>[\s\S]*?<\/svg>/i);
      if (svgMatch && svgMatch[0] && svgMatch[0].length > 200) {
        svgHtml = svgMatch[0];
        logger.debug(
          { svgLength: svgHtml.length },
          "Found inline SVG in raw HTML (cheerio didn't parse it)",
        );
      }
    }

    logger.debug(
      {
        svgCount: inlineSvgs.length,
        svgHtmlLength: svgHtml?.length,
        htmlLength: html.length,
      },
      "Checking for inline SVGs",
    );

    if (svgHtml && svgHtml.length > 200) {
      // Check if SVG has meaningful content (has path elements)
      const hasPaths =
        svgHtml.includes("<path") || svgHtml.includes("&lt;path");

      if (hasPaths || svgHtml.length > 500) {
        logger.debug(
          {
            size: svgHtml.length,
            hasPaths,
          },
          "Found inline SVG, converting to PNG",
        );
        try {
          const targetSize = isHeaderImage
            ? { width: MAX_HEADER_IMAGE_WIDTH, height: MAX_HEADER_IMAGE_HEIGHT }
            : { width: MAX_IMAGE_WIDTH, height: MAX_IMAGE_HEIGHT };
          const converted = await sharp(Buffer.from(svgHtml, "utf-8"))
            .resize(targetSize.width, targetSize.height, {
              fit: "inside",
              withoutEnlargement: false,
            })
            .png()
            .toBuffer();
          logger.debug(
            { originalSize: svgHtml.length, convertedSize: converted.length },
            "Successfully converted inline SVG to PNG",
          );
          return {
            imageData: converted,
            contentType: "image/png",
          };
        } catch (error) {
          logger.warn(
            { error, svgLength: svgHtml.length },
            "Failed to convert inline SVG",
          );
        }
      }
    }
  }
  return null;
}
