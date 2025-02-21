import axios, { AxiosInstance } from "axios";
import TurndownService from "turndown";

// -----------------------------------------------------------------------
// Configuration & Data Types
// -----------------------------------------------------------------------

interface WebflowConfig {
  API_KEY: string;
  SITE_ID: string;
  CONTEXT_ID: string;
  BASE_URL: string;
  COLLECTIONS: {
    CASE_STUDIES: string;
    SYSTEM_PROMPT: string;
  };
  ITEMS: {
    SYSTEM_PROMPT: string;
  };
}

export interface PageContent {
  title: string;
  slug: string;
  content: string;
}

export interface CaseStudy {
  title: string;
  slug: string;
  content: string;
}

export interface SystemPromptData {
  styleGuidelines: string;
  questionPatterns: string;
}

export interface FetchResult {
  pages: Record<string, PageContent>;
  caseStudies: Record<string, CaseStudy>;
  systemPrompt: SystemPromptData;
}

// Webflow response specific types
interface WebflowNode {
  type: string;
  componentId?: string;
  children?: WebflowNode[];
  text?: {
    html: string;
    text: string;
  };
}

interface WebflowCaseStudyItem {
  fieldData: {
    name: string;
    slug: string;
    content?: string;
  };
}

interface WebflowSystemPromptItem {
  fieldData: {
    "style-guidelines"?: string;
    "specific-question-patterns"?: string;
  };
}

// -----------------------------------------------------------------------
// Config Class
// -----------------------------------------------------------------------

class Config {
  static readonly data: WebflowConfig = {
    API_KEY: process.env.WEBFLOW_API_TOKEN || "",
    SITE_ID: "674045e3bdb2d16d7e73efd5",
    CONTEXT_ID: "679528029097b958606ec2ed",
    BASE_URL: "https://api.webflow.com/v2",
    COLLECTIONS: {
      CASE_STUDIES: "67405a6bc01960d426e5da3f",
      SYSTEM_PROMPT: "67409359ef24c542fe79ed6c",
    },
    ITEMS: {
      SYSTEM_PROMPT: "674093e0ef24c542fe7a83b1",
    },
  };

  static validate(): void {
    if (!this.data.API_KEY) {
      throw new Error("WEBFLOW_API_TOKEN environment variable is not set");
    }
  }
}

// -----------------------------------------------------------------------
// WebflowFetcher Class
// -----------------------------------------------------------------------

export class WebflowFetcher {
  private axiosInstance: AxiosInstance;
  private turndownService = new TurndownService({ emDelimiter: "*" });
  private componentCache = new Map<string, WebflowNode[]>();

  constructor() {
    Config.validate();
    this.axiosInstance = axios.create({
      baseURL: Config.data.BASE_URL,
      headers: {
        Authorization: `Bearer ${Config.data.API_KEY}`,
        Accept: "application/json",
      },
    });
  }

  /**
   * Fetches all necessary data concurrently and processes it.
   */
  public async processPage(): Promise<FetchResult> {
    const [domResponse, caseStudiesData, systemPromptData] = await Promise.all([
      this.fetchData<{ nodes: WebflowNode[] }>(`pages/${Config.data.CONTEXT_ID}/dom`),
      this.fetchData<{ items: WebflowCaseStudyItem[] }>(
        `collections/${Config.data.COLLECTIONS.CASE_STUDIES}/items/live`
      ),
      this.fetchData<WebflowSystemPromptItem>(
        `collections/${Config.data.COLLECTIONS.SYSTEM_PROMPT}/items/${Config.data.ITEMS.SYSTEM_PROMPT}/live`
      ),
    ]);

    // Use debug logging or remove in production
    console.debug("Initial DOM data:", JSON.stringify(domResponse, null, 2));

    // Recursively resolve nested component instances
    const processedNodes = await this.recursivelyFetchComponents(domResponse.nodes);
    console.debug(
      "Processed DOM data:",
      JSON.stringify({ ...domResponse, nodes: processedNodes }, null, 2)
    );

    return {
      pages: this.extractContent(Array.isArray(processedNodes) ? processedNodes : [processedNodes]),
      caseStudies: this.transformCaseStudies(caseStudiesData.items),
      systemPrompt: this.transformSystemPrompt(systemPromptData),
    };
  }

  /**
   * Recursively processes nodes and fetches nested component instances.
   */
  private async recursivelyFetchComponents(nodes: WebflowNode[]): Promise<WebflowNode[]> {
    const processNode = async (node: WebflowNode): Promise<WebflowNode> => {
      if (node.type === "component-instance" && node.componentId) {
        // Use the cache-aware helper to fetch component DOM
        const componentNodes = await this.getComponentDefinition(node.componentId);
        node.children = await this.recursivelyFetchComponents(componentNodes);
        return node;
      }

      if (node.children && node.children.length) {
        node.children = await Promise.all(node.children.map(processNode));
      }
      return node;
    };

    return Promise.all(nodes.map(processNode));
  }

  /**
   * Traverses DOM nodes, converting HTML text to markdown and extracting page content.
   */
  private extractContent(nodes: WebflowNode[]): Record<string, PageContent> {
    const pages: Record<string, PageContent> = {};
    let currentPage: string | null = null;

    const traverse = (node: WebflowNode): void => {
      if (node.type === "text" && node.text?.html) {
        // Detect a page title using a CSS indicator.
        if (node.text.html.includes('class="page-title"')) {
          currentPage = node.text.text.trim();
          pages[currentPage] = {
            title: currentPage,
            slug: this.createSlug(currentPage),
            content: "",
          };
        } else if (currentPage) {
          const markdownContent = this.turndownService.turndown(node.text.html);
          pages[currentPage].content += this.sanitizeContent(markdownContent) + "\n";
        }
      }
      node.children?.forEach(traverse);
    };

    nodes.forEach(traverse);

    // Standardize content for each page
    Object.values(pages).forEach(page => {
      page.content = this.standardizeContent(page.content);
    });

    return pages;
  }

  /**
   * Cleans and standardizes content.
   */
  private standardizeContent(content: string): string {
    return content
      .replace(/\s+/g, " ") // Collapse multiple spaces
      .replace(/\n\s*\n/g, "\n") // Collapse multiple newlines
      .trim()
      .replace(/\[|\]|\*|_/g, "") // Remove markdown formatting characters
      .replace(/\(https?:\/\/[^\)]+\)/g, ""); // Remove URLs
  }

  /**
   * Creates a URL-friendly slug from the provided title.
   */
  private createSlug(title: string): string {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle === "index") return "/in";
    return (
      "/" +
      lowerTitle
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    );
  }

  /**
   * Retrieves component definitions from cache or via API.
   */
  private async getComponentDefinition(componentId: string): Promise<WebflowNode[]> {
    if (this.componentCache.has(componentId)) {
      return this.componentCache.get(componentId)!;
    }
    const data = await this.fetchData<{ nodes: WebflowNode[] }>(
      `sites/${Config.data.SITE_ID}/components/${componentId}/dom`
    );
    this.componentCache.set(componentId, data.nodes);
    return data.nodes;
  }

  /**
   * Performs a GET request to the Webflow API with error handling.
   */
  private async fetchData<T>(endpoint: string): Promise<T> {
    try {
      const response = await this.axiosInstance.get<T>(endpoint);
      return response.data;
    } catch (error: unknown) {
      const errorMsg = axios.isAxiosError(error) ? error.message : "Unknown error";
      throw new Error(`Failed to fetch ${endpoint}: ${errorMsg}`);
    }
  }

  /**
   * Transforms raw case study items into a standardized record.
   */
  private transformCaseStudies(items: WebflowCaseStudyItem[]): Record<string, CaseStudy> {
    return Object.fromEntries(
      items.map(item => {
        const title = item.fieldData.name.trim();
        const markdownContent = this.turndownService.turndown(item.fieldData.content || "");
        return [
          title.toLowerCase(),
          {
            title,
            slug: `/casestudies/${item.fieldData.slug}`,
            content: this.sanitizeContent(markdownContent),
          },
        ];
      })
    );
  }

  /**
   * Transforms raw system prompt data into a structured object.
   */
  private transformSystemPrompt(data: WebflowSystemPromptItem): SystemPromptData {
    const {
      fieldData: {
        "style-guidelines": styleGuidelines = "",
        "specific-question-patterns": questionPatterns = "",
      },
    } = data;
    return { styleGuidelines, questionPatterns };
  }

  /**
   * Sanitizes markdown content by removing unwanted Webflow leftovers.
   */
  private sanitizeContent(content: string): string {
    return content.replace(
      /\[__wf_reserved_inherit\]\(https:\/\/cdn\.prod\.website-files\.com\/[^\)]*\)/g,
      ""
    );
  }
}