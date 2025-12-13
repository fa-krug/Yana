/**
 * YouTube content building utilities.
 */

import { fetchVideoComments } from "./comments";

/**
 * Escape HTML special characters.
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
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
  if (description) {
    // Convert newlines to paragraphs for better formatting
    const paragraphs = description.split("\n\n");
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (trimmed) {
        // Convert single newlines to <br>
        const withBreaks = trimmed.replace(/\n/g, "<br>");
        contentParts.push(`<p>${withBreaks}</p>`);
      }
    }
  }

  // Comments section
  const commentSectionParts: string[] = [
    `<h3><a href="${videoUrl}" target="_blank" rel="noopener">Comments</a></h3>`,
  ];

  // Fetch and format comments
  if (commentLimit > 0) {
    const comments = await fetchVideoComments(videoId, commentLimit, apiKey);
    if (comments.length > 0) {
      // Format comments with videoId for proper comment links
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
  } else {
    commentSectionParts.push("<p><em>Comments disabled.</em></p>");
  }

  // Wrap comments in section tag
  contentParts.push(`<section>${commentSectionParts.join("\n")}</section>`);

  return contentParts.join("\n");
}
