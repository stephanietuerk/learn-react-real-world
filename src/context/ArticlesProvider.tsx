import {
  createContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useParams } from 'react-router';
import { useApiClient } from '../api/useApiClient';
import { useUser } from '../api/useUser';
import { API_ROOT } from '../shared/constants/api';
import { NONE_TAG } from '../shared/feed/feed-controls/tag-options/TagOptions';
import type {
  ArticleMetadata,
  ArticlesContextType,
  FeedSelections,
  ProfileFeed,
} from '../types/articles.types';

interface ApiArticles {
  articles: ArticleMetadata[];
  articlesCount: number;
}

interface ArticlesProviderProps {
  feedControlsDefaults: FeedSelections;
  children: ReactNode;
}

type ArticlesEndpoint = 'global' | 'user';

const ARTICLES_ENDPOINT: Record<ArticlesEndpoint, string> = {
  global: 'articles',
  user: 'articles/feed',
};

export const ArticlesContext = createContext<ArticlesContextType | undefined>(
  undefined,
);

function getSortedArticles(data: ApiArticles): ArticleMetadata[] {
  return data.articles
    .map((article: ArticleMetadata) => {
      return {
        ...article,
        createdAt: new Date(article.createdAt),
        updatedAt: new Date(article.updatedAt),
      };
    })
    .slice()
    .sort((a, b) => b.updatedAt.valueOf() - a.updatedAt.valueOf());
}

function getFilteredArticles(
  articles: ArticleMetadata[],
  feedSelections: FeedSelections,
): ArticleMetadata[] {
  return articles.filter((a) => {
    const conditions = [];
    if (feedSelections.tags.length && !feedSelections.tags.includes(NONE_TAG)) {
      conditions.push(
        a.tagList.some((tag) => feedSelections.tags.includes(tag)),
      );
    }
    return conditions.every(Boolean);
  });
}

function isUsersFeed(feed: FeedSelections['feed']) {
  return feed === 'following';
}

function isProfileView(feed: FeedSelections['feed']): feed is ProfileFeed {
  return feed === 'author' || feed === 'favorited';
}

export function ArticlesProvider({
  feedControlsDefaults,
  children,
}: ArticlesProviderProps) {
  const { callApiWithAuth } = useApiClient();
  const { user } = useUser();
  const { username } = useParams();
  const [articles, setArticles] = useState<ArticleMetadata[]>([]);
  const [feedSelections, setFeedSelections] =
    useState<FeedSelections>(feedControlsDefaults);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showLoading, setShowLoading] = useState(false);
  const [pendingArticles, setPendingArticles] = useState<
    ArticleMetadata[] | null
  >(null);

  const filteredArticles = useMemo(
    () => getFilteredArticles(pendingArticles ?? articles, feedSelections),
    [pendingArticles, articles, feedSelections],
  );

  const fetchArticles = () => {
    setIsLoading(true);

    const endpointType = isUsersFeed(feedSelections.feed) ? 'user' : 'global';
    let url = API_ROOT + ARTICLES_ENDPOINT[endpointType];
    if (isProfileView(feedSelections.feed) && username) {
      url += `?${feedSelections.feed}=${encodeURIComponent(username)}`;
    }

    callApiWithAuth<ApiArticles>(url)
      .then((data) => {
        const articles = getSortedArticles(data);
        setPendingArticles(articles);
      })
      .catch((error) => {
        console.log('Failed to fetch articles:', error);
        setPendingArticles([]);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchArticles();
  }, [feedSelections, user]);

  useEffect(() => {
    if (!isLoading && pendingArticles !== null) {
      setArticles(pendingArticles);
      setPendingArticles(null);
    }
  }, [isLoading, pendingArticles]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (isLoading) {
      timeout = setTimeout(() => setShowLoading(true), 300);
    } else {
      setShowLoading(false);
      clearTimeout(timeout);
    }

    return () => clearTimeout(timeout);
  }, [isLoading]);

  return (
    <ArticlesContext.Provider
      value={{
        articles,
        feedSelections,
        filteredArticles,
        isLoading,
        showLoading,
        refreshArticles: fetchArticles,
        setFeedSelections,
      }}
    >
      {children}
    </ArticlesContext.Provider>
  );
}
