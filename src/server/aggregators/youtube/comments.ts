/**
 * YouTube comment fetching utilities.
 */

import axios from "axios";
import { logger } from "../../utils/logger";

/**
 * YouTube comment interface.
 */
export interface YouTubeComment {
  id: string;
  snippet: {
    topLevelComment: {
      snippet: {
        textDisplay: string;
        textOriginal: string;
        authorDisplayName: string;
        authorProfileImageUrl?: string;
        likeCount: number;
        publishedAt: string;
        updatedAt: string;
      };
    };
    totalReplyCount: number;
    canReply: boolean;
  };
}

/**
 * YouTube comments response interface.
 */
interface YouTubeCommentsResponse {
  items: YouTubeComment[];
  nextPageToken?: string;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
}

/**
 * Fetch comments for a YouTube video.
 */
export async function fetchVideoComments(
  videoId: string,
  commentLimit: number,
  apiKey: string,
): Promise<YouTubeComment[]> {
  if (commentLimit <= 0) {
    return [];
  }

  try {
    const comments: YouTubeComment[] = [];
    let nextPageToken: string | undefined;

    while (comments.length < commentLimit) {
      const response = await axios.get<YouTubeCommentsResponse>(
        "https://www.googleapis.com/youtube/v3/commentThreads",
        {
          params: {
            part: "snippet",
            videoId,
            maxResults: Math.min(100, commentLimit - comments.length),
            order: "relevance", // Sort by relevance (most liked/engaging first)
            textFormat: "html", // Get HTML formatted text
            pageToken: nextPageToken,
            key: apiKey,
          },
          timeout: 10000,
        },
      );

      const items = response.data.items || [];
      if (items.length === 0) {
        break;
      }

      // Filter out comments with no text or deleted comments
      const validComments = items.filter(
        (comment) =>
          comment.snippet.topLevelComment.snippet.textDisplay &&
          comment.snippet.topLevelComment.snippet.textDisplay !== "[deleted]" &&
          comment.snippet.topLevelComment.snippet.textDisplay !== "[removed]",
      );

      comments.push(...validComments);
      nextPageToken = response.data.nextPageToken;
      if (!nextPageToken) {
        break;
      }
    }

    return comments.slice(0, commentLimit);
  } catch (error) {
    logger.warn({ error, videoId }, "Error fetching YouTube comments");
    // Don't throw - return empty array so video aggregation can continue
    return [];
  }
}
