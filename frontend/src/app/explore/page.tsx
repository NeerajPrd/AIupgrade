"use client";

import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  createContext,
  useContext,
  useTransition,
} from "react";
import axios, { AxiosError } from "axios";
// import { debounce } from "lodash";
import {
  Search,
  Compass,
  ExternalLink,
  Clock,
  Globe,
  ThumbsUp,
  MessageCircle,
  Bookmark,
  Share2,
  Filter,
  Grid,
  List,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { showSuccessToast, showErrorToast } from "@/utils/toast";

// Types
export type Category =
  | "Business"
  | "Entertainment"
  | "General"
  | "Health"
  | "Science"
  | "Sports"
  | "Technology";

export type Layout = "grid" | "list";

export interface NewsSource {
  id: string | null;
  name: string;
}

export interface NewsData {
  id: string;
  source: NewsSource;
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
  category?: Category;
  likes?: number;
  comments?: number;
  bookmarked?: boolean;
  readTime?: string;
}

interface NewsContextType {
  bookmarks: Set<string>;
  addBookmark: (url: string) => void;
  removeBookmark: (url: string) => void;
  layout: Layout;
  setLayout: (layout: Layout) => void;
}

// Constants
const ITEMS_PER_PAGE = 9;
const CATEGORIES: Category[] = [
  "Business",
  "Entertainment",
  "General",
  "Health",
  "Science",
  "Sports",
  "Technology",
];

const DEFAULT_ERROR_MESSAGE = "An unexpected error occurred. Please try again.";
const API_ENDPOINT = "/api/news-api";
const DEBOUNCE_DELAY = 300;

// Context
const NewsContext = createContext<NewsContextType | null>(null);

// Custom Hooks
const useNews = () => {
  const context = useContext(NewsContext);
  if (!context) {
    throw new Error("useNews must be used within a NewsProvider");
  }
  return context;
};

const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

// Utility Functions
const formatDate = (date: string): string => {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
};

const processNewsData = (data: NewsData[]): NewsData[] => {
  return data.map((item) => ({
    ...item,
    id: crypto.randomUUID(),
    category: CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)],
    likes: Math.floor(Math.random() * 1000),
    comments: Math.floor(Math.random() * 100),
    readTime: `${Math.floor(Math.random() * 10) + 2}`,
  }));
};

// NewsCard Component
const NewsCard: React.FC<{ item: NewsData; layout?: Layout }> = React.memo(({ item, layout = "grid" }) => {
  const { bookmarks, addBookmark, removeBookmark } = useNews();

  const handleBookmark = useCallback(() => {
    if (bookmarks.has(item.url)) {
      removeBookmark(item.url);
    } else {
      addBookmark(item.url);
    }
  }, [item.url, bookmarks, addBookmark, removeBookmark]);

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: item.title,
          text: item.description ?? undefined,
          url: item.url,
        });
      } else {
        await navigator.clipboard.writeText(item.url);
        showSuccessToast("Article URL has been copied to your clipboard.");
      }
    } catch (error) {
      console.error("Share failed:", error);
      showErrorToast("Unable to share the article. Please try again.");
    }
  };

  const CardComponent = layout === "grid" ? GridCard : ListCard;

  return <CardComponent item={item} onBookmark={handleBookmark} onShare={handleShare} />;
});

// GridCard Component
const GridCard: React.FC<{
  item: NewsData;
  onBookmark: () => void;
  onShare: () => void;
}> = React.memo(({ item, onBookmark, onShare }) => {
  const { bookmarks } = useNews();

  return (
    <Card className="group h-full flex flex-col transition-all duration-300 hover:shadow-xl dark:hover:shadow-indigo-500/30 border-0 bg-white/80 dark:bg-black/40 backdrop-blur-sm">
      <CardContent className="p-0 flex-1">
        <div className="relative aspect-video">
          <img
            src={item.urlToImage || "/placeholder-news.jpg"}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            alt={item.title}
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
          {item.category && (
            <span className="absolute top-4 left-4 px-3 py-1 bg-primary/90 text-white text-xs rounded-full dark:text-black">
              {item.category}
            </span>
          )}
          {item.readTime && (
            <span className="absolute top-4 right-4 px-3 py-1 bg-black/50 text-white text-xs rounded-full">
              {item.readTime} min read
            </span>
          )}
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <time dateTime={item.publishedAt} className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {formatDate(item.publishedAt)}
            </time>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              <span>{item.source.name}</span>
            </div>
          </div>

          <h3 className="text-xl font-semibold leading-tight line-clamp-2 group-hover:text-primary transition-colors">
            {item.title}
          </h3>

          <p className="text-sm text-muted-foreground line-clamp-2">
            {item.description}
          </p>
        </div>
      </CardContent>

      <CardFooter className="p-6 pt-0">
        <div className="flex items-center justify-between w-full pt-4 border-t border-border/50">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <ThumbsUp className="w-4 h-4" />
              {item.likes?.toLocaleString()}
            </span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <MessageCircle className="w-4 h-4" />
              {item.comments?.toLocaleString()}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onBookmark}
              aria-label={bookmarks.has(item.url) ? "Remove bookmark" : "Add bookmark"}
            >
              <Bookmark className={`w-4 h-4 ${bookmarks.has(item.url) ? "fill-primary" : ""}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onShare}
              aria-label="Share article"
            >
              <Share2 className="w-4 h-4" />
            </Button>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
            >
              Read <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
});

// ListCard Component
const ListCard: React.FC<{
  item: NewsData;
  onBookmark: () => void;
  onShare: () => void;
}> = React.memo(({ item, onBookmark, onShare }) => {
  const { bookmarks } = useNews();

  return (
    <Card className="group transition-all duration-300 hover:shadow-lg dark:hover:shadow-indigo-500/20 border-0 bg-white/80 dark:bg-black/40 backdrop-blur-sm">
      <CardContent className="p-4 flex gap-4">
        <div className="relative w-48 aspect-video flex-shrink-0">
          <img
            src={item.urlToImage || "/placeholder-news.jpg"}
            className="w-full h-full object-cover rounded-lg"
            alt={item.title}
            loading="lazy"
          />
          {item.category && (
            <span className="absolute top-2 left-2 px-2 py-1 bg-primary/90 text-white text-xs rounded-full">
              {item.category}
            </span>
          )}
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
            <time dateTime={item.publishedAt} className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {formatDate(item.publishedAt)}
            </time>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              <span>{item.source.name}</span>
            </div>
          </div>

          <h3 className="text-lg font-semibold mb-2 line-clamp-2 group-hover:text-primary transition-colors">
            {item.title}
          </h3>

          <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
            {item.description}
          </p>

          <div className="flex items-center justify-between mt-auto">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <ThumbsUp className="w-4 h-4" />
                {item.likes?.toLocaleString()}
              </span>
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <MessageCircle className="w-4 h-4" />
                {item.comments?.toLocaleString()}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onBookmark}
                aria-label={bookmarks.has(item.url) ? "Remove bookmark" : "Add bookmark"}
              >
                <Bookmark className={`w-4 h-4 ${bookmarks.has(item.url) ? "fill-primary" : ""}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onShare}
                aria-label="Share article"
              >
                <Share2 className="w-4 h-4" />
              </Button>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                Read <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

// Main Component
const AINewsExplorer: React.FC = () => {
  const [news, setNews] = useState<NewsData[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [layout, setLayout] = useState<Layout>("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [error, setError] = useState<Error | null>(null);
  const [isPending, startTransition] = useTransition();

  const debouncedSearchTerm = useDebounce(searchTerm, DEBOUNCE_DELAY);

  const fetchNews = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(API_ENDPOINT);
      const processedNews = processNewsData(response.data);
      setNews(processedNews);
    } catch (error) {
      const errorMessage =
        error instanceof AxiosError
          ? error.response?.data?.message || error.message
          : DEFAULT_ERROR_MESSAGE;
      setError(new Error(errorMessage));
      showErrorToast(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  const filteredNews = useMemo(() => {
    return news
      .filter((item) => {
        const matchesSearch =
          !debouncedSearchTerm ||
          item.title.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
          item.description?.toLowerCase().includes(debouncedSearchTerm.toLowerCase());

        const matchesCategory =
          !selectedCategory || item.category === selectedCategory;

        return matchesSearch && matchesCategory;
      })
      .map((item) => ({
        ...item,
        bookmarked: bookmarks.has(item.url),
      }));
  }, [news, debouncedSearchTerm, selectedCategory, bookmarks]);

  const paginatedNews = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredNews.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredNews, currentPage]);

  const totalPages = Math.ceil(filteredNews.length / ITEMS_PER_PAGE);

  const addBookmark = useCallback((url: string) => {
    setBookmarks((prev) => new Set(prev).add(url));
    showSuccessToast("Article has been added to your bookmarks.");
  }, []);

  const removeBookmark = useCallback((url: string) => {
    setBookmarks((prev) => {
      const newBookmarks = new Set(prev);
      newBookmarks.delete(url);
      return newBookmarks;
    });
    showSuccessToast("Article has been removed from your bookmarks.");
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    startTransition(() => {
      setCurrentPage(1);
    });
  };

  const handleCategoryChange = (category: Category | null) => {
    setSelectedCategory(category);
    setCurrentPage(1);
  };

  const toggleLayout = () => setLayout((l) => (l === "grid" ? "list" : "grid"));

  const contextValue = useMemo(
    () => ({
      bookmarks,
      addBookmark,
      removeBookmark,
      layout,
      setLayout,
    }),
    [bookmarks, addBookmark, removeBookmark, layout]
  );

  return (
    <NewsContext.Provider value={contextValue}>
      <div className="min-h-screen bg-brand-50 dark:bg-[#1A202C]">
        <div className="container mx-auto px-4 py-8 max-w-7xl ">
          
        <section className="text-center mb-20 relative">
          <div className="absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-grid-slate-200/50 dark:bg-grid-slate-800/50 bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black,transparent)]" />
          </div>

          <div className="inline-flex items-center justify-center gap-2 mb-6 px-4 py-2 rounded-full bg-blue-500/10 dark:bg-blue-400/10">
            <Sparkles className="h-5 w-5 text-blue-500 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
              Explore Latest News
            </span>
          </div>

          <h1 className="text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-200 dark:to-slate-400">
          AI News Explorer
          </h1>

          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          Your premium source for AI and technology insights
          </p>
        </section>
          <header className="mb-12">

            <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search articles..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={handleSearch}
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Filter className="w-4 h-4" />
                    {selectedCategory || "All Categories"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => handleCategoryChange(null)}>
                    All Categories
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {CATEGORIES.map((category) => (
                    <DropdownMenuItem
                      key={category}
                      onClick={() => handleCategoryChange(category)}
                    >
                      {category}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
                
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={fetchNews}
                  disabled={loading}
                >
                  <RefreshCw
                    className={` ${loading ? "animate-spin" : ""}`}
                  />
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={toggleLayout}
                >
                  {layout === "grid" ? (
                    <List className="w-4 h-4" />
                  ) : (
                    <Grid className="w-4 h-4" />
                  )}
                  {layout === "grid" ? "List View" : "Grid View"}
                </Button>
              </div>
              </DropdownMenu>
            </div>
          </header>

          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}

          <div
            className={`grid gap-6 ${
              layout === "grid"
                ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                : "grid-cols-1"
            }`}
          >
            {paginatedNews.map((item) => (
              <NewsCard key={item.id} item={item} layout={layout} />
            ))}
          </div>

          {!loading && filteredNews.length === 0 && (
            <div className="text-center py-12">
              <h3 className="text-xl font-semibold mb-2">No articles found</h3>
              <p className="text-muted-foreground">
                Try adjusting your search or filters to find more articles
              </p>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 mt-8">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </NewsContext.Provider>
  );
};

export default AINewsExplorer;