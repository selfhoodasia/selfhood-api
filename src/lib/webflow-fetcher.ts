// webflow-fetcher.ts - Optimized and Cleaned-up Version

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
  markdown: string;
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

// Data types specific to Webflow responses
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
  private componentCache = new Map<string, WebflowNode[]>();
  private turndownService = new TurndownService({ emDelimiter: "*" });

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
   * Fetches and processes all necessary data concurrently.
   */
  public async processPage(): Promise<FetchResult> {
    const [dom, caseStudiesData, systemPromptData] = await Promise.all([
      this.fetchData<WebflowNode[] | WebflowNode>(`pages/${Config.data.CONTEXT_ID}/dom`),
      this.fetchData<{ items: WebflowCaseStudyItem[] }>(`collections/${Config.data.COLLECTIONS.CASE_STUDIES}/items/live`),
      this.fetchData<WebflowSystemPromptItem>(`collections/${Config.data.COLLECTIONS.SYSTEM_PROMPT}/items/${Config.data.ITEMS.SYSTEM_PROMPT}/live`),
    ]);

    // Normalize the DOM nodes – account for both array and object responses.
    let nodes: WebflowNode[];
    if (Array.isArray(dom)) {
      nodes = dom;
    } else if (dom && Array.isArray(dom.children)) {
      nodes = dom.children;
    } else {
      nodes = [dom];
    }

    // Process nested components
    const processedNodes = await this.processComponents(nodes);
    return {
      pages: this.extractContent(processedNodes),
      caseStudies: this.transformCaseStudies(caseStudiesData.items),
      systemPrompt: this.transformSystemPrompt(systemPromptData),
    };
  }

  /**
   * Recursively process component-instance nodes to resolved definitions.
   */
  private async processComponents(nodes: WebflowNode[]): Promise<WebflowNode[]> {
    return Promise.all(
      nodes.map(async (node) => {
        if (node.type === "component-instance" && node.componentId) {
          node.children = await this.getComponentDefinition(node.componentId);
        }
        if (node.children && node.children.length > 0) {
          node.children = await this.processComponents(node.children);
        }
        return node;
      })
    );
  }

  /**
   * Recursively traverses nodes to extract page content, converting HTML to Markdown.
   */
  private extractContent(nodes: WebflowNode[]): Record<string, PageContent> {
    const content: Record<string, PageContent> = {};
    let currentPage: string | null = null;

    const traverse = (node: WebflowNode): void => {
      if (node.type === "text" && node.text?.html) {
        // Identify page title via a CSS class indicator.
        if (node.text.html.includes('class="page-title"')) {
          currentPage = node.text.text.trim();
          content[currentPage] = {
            title: currentPage,
            slug: this.createSlug(currentPage),
            markdown: "",
          };
        } else if (currentPage) {
          content[currentPage].markdown += `${this.turndownService.turndown(node.text.html)}\n`;
        }
      }
      node.children?.forEach(traverse);
    };

    nodes.forEach(traverse);
    return content;
  }

  /**
   * Utility function to create a slug from a title.
   */
  private createSlug(title: string): string {
    return title.toLowerCase() === "index"
      ? "/in"
      : `/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  }

  /**
   * Retrieves component definitions from cache or via API.
   */
  private async getComponentDefinition(componentId: string): Promise<WebflowNode[]> {
    if (this.componentCache.has(componentId)) {
      return this.componentCache.get(componentId)!;
    }
    const data = await this.fetchData<WebflowNode[]>(`sites/${Config.data.SITE_ID}/components/${componentId}/dom`);
    this.componentCache.set(componentId, data);
    return data;
  }

  /**
   * Performs a GET request to the Webflow API with error handling.
   */
  private async fetchData<T>(endpoint: string): Promise<T> {
    try {
      const { data } = await this.axiosInstance.get<T>(endpoint);
      return data;
    } catch (error: unknown) {
      let errorMessage = "An unknown error occurred";
      if (axios.isAxiosError(error)) {
        errorMessage = error.message || errorMessage;
      }
      throw new Error(`Failed to fetch ${endpoint}: ${errorMessage}`);
    }
  }

  /**
   * Transforms raw Webflow case study items into a key/value map.
   */
  private transformCaseStudies(items: WebflowCaseStudyItem[]): Record<string, CaseStudy> {
    return Object.fromEntries(
      items.map((item) => {
        const name = item.fieldData.name.trim();
        return [
          name.toLowerCase(),
          {
            title: name,
            slug: `/casestudies/${item.fieldData.slug}`,
            content: this.sanitizeContent(
              this.turndownService.turndown(item.fieldData.content || "")
            ),
          },
        ];
      })
    );
  }

  /**
   * Transforms raw system prompt data into a formatted object.
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
   * Sanitizes content by stripping out unwanted Webflow-specific link patterns.
   */
  private sanitizeContent(content: string): string {
    return content.replace(
      /\[__wf_reserved_inherit\]\(https:\/\/cdn\.prod\.website-files\.com\/[^\)]*\)/g,
      ""
    );
  }
}
