/**
 * Image extraction strategies.
 * Re-exports all strategy functions.
 */

export {
  handleDirectImageUrl,
  handleYouTubeThumbnail,
  handleTwitterImage,
  handleMetaTagImage,
} from "./basic";
export { handleInlineSvg } from "./svg";
export { handlePageImages } from "./page";
