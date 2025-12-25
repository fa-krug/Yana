import { ArticleSkipError } from "../base/errors";
import { fetchVideoComments } from "./fetching";

/**
 * Escape HTML special characters.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Format video description into HTML paragraphs.
 */
function formatDescription(description: string): string {
  if (!description) return "";

  const contentParts: string[] = [];
  const paragraphs = description.split("\n\n");

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (trimmed) {
      // Convert single newlines to <br>
      const withBreaks = trimmed.replace(/\n/g, "<br>");
      contentParts.push(`<p>${withBreaks}</p>`);
    }
  }

  return contentParts.join("\n");
}

/**
 * Fetch and format comments section.
 */
async function formatCommentsSection(
  videoId: string,
  videoUrl: string,
  commentLimit: number,
  apiKey: string,
): Promise<string> {
  const commentSectionParts: string[] = [
    `<h3><a href="${videoUrl}" target="_blank" rel="noopener">Comments</a></h3>`,
  ];

  if (commentLimit <= 0) {
    commentSectionParts.push("<p><em>Comments disabled.</em></p>");
    return `<section>${commentSectionParts.join("\n")}</section>`;
  }

  try {
    const comments = await fetchVideoComments(videoId, commentLimit, apiKey);
    if (comments.length > 0) {
      const commentHtmls = comments.map((comment) => {
        const author =
          comment.snippet.topLevelComment.snippet.authorDisplayName ||
          "[deleted]";
        const body = comment.snippet.topLevelComment.snippet.textDisplay || "";
        const likeCount =
          comment.snippet.topLevelComment.snippet.likeCount || 0;
        const commentId = comment.id;
        const commentUrl = `https://www.youtube.com/watch?v=${videoId}&lc=${commentId}`;

        return `
<blockquote>
<p><strong>${escapeHtml(author)}</strong> | ${likeCount} likes | <a href="${commentUrl}">source</a></p>
<div>${body}</div>
</blockquote>
`;
      });
      commentSectionParts.push(commentHtmls.join(""));
    } else {
      commentSectionParts.push("<p><em>No comments yet.</em></p>");
    }
  } catch (error) {
    if (error instanceof ArticleSkipError) {
      throw error;
    }
    commentSectionParts.push("<p><em>Comments unavailable.</em></p>");
  }

  return `<section>${commentSectionParts.join("\n")}</section>`;
}

/**
 * Build video content with comments.
 */
export async function buildVideoContent(
  description: string,
  videoId: string,
  videoUrl: string,
  commentLimit: number,
  apiKey: string,
): Promise<string> {
  const contentParts: string[] = [];

  // Video description
  const formattedDescription = formatDescription(description);
  if (formattedDescription) {
    contentParts.push(formattedDescription);
  }

  // Comments section
  const commentsSection = await formatCommentsSection(
    videoId,
    videoUrl,
    commentLimit,
    apiKey,
  );
  contentParts.push(commentsSection);

  return contentParts.join("\n");
}
