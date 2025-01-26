import axios from "axios";

export class WebflowFetcher {
  static CONFIG = {
    API_KEY: process.env.WEBFLOW_API_TOKEN,
    SITE_ID: "674045e3bdb2d16d7e73efd5",
    BASE_URL: "https://api.webflow.com/v2",
    COLLECTIONS: {
      CASE_STUDIES: "67405a6bc01960d426e5da3f",
      SYSTEM_PROMPT: "67409359ef24c542fe79ed6c"
    },
    ITEMS: {
      SYSTEM_PROMPT: "674093e0ef24c542fe7a83b1"
    }
  };

  #componentCache = new Map();
  #axios;

  constructor() {
    if (!WebflowFetcher.CONFIG.API_KEY) {
      throw new Error("WEBFLOW_API_TOKEN environment variable is not set");
    }

    this.#axios = axios.create({
      baseURL: WebflowFetcher.CONFIG.BASE_URL,
      headers: {
        Authorization: `Bearer ${WebflowFetcher.CONFIG.API_KEY}`,
        Accept: "application/json"
      }
    });
  }

  // Simple HTML to Markdown converter
  #htmlToMarkdown(html) {
    if (!html) return '';
    
    // Basic HTML to Markdown conversions
    return html
      .replace(/<h[1-6]>(.*?)<\/h[1-6]>/gi, '## $1\n\n')
      .replace(/<p>(.*?)<\/p>/gi, '$1\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<em>(.*?)<\/em>/gi, '*$1*')
      .replace(/<a href="(.*?)">(.*?)<\/a>/gi, '[$2]($1)')
      .replace(/<ul>(.*?)<\/ul>/gis, '$1\n')
      .replace(/<li>(.*?)<\/li>/gi, '- $1\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  async processPage(pageId) {
    try {
      const [dom, caseStudies, systemPrompt] = await Promise.all([
        this.#getDom(`pages/${pageId}/dom`),
        this.#getCollectionItems(WebflowFetcher.CONFIG.COLLECTIONS.CASE_STUDIES),
        this.#getSystemPrompt()
      ]);

      return {
        pages: this.#extractContent(await this.#processComponents(dom.nodes)),
        caseStudies: this.#transformCaseStudies(caseStudies.items),
        systemPrompt: this.#transformSystemPrompt(systemPrompt)
      };
    } catch (error) {
      return { error: error.message, details: error.cause };
    }
  }

  async #processComponents(nodes) {
    return Promise.all(nodes.map(async node => {
      if (node.type === "component-instance") {
        const components = await this.#getComponentDefinition(node.componentId);
        node.children = await this.#processComponents(components);
      }
      return node.children?.length 
        ? { ...node, children: await this.#processComponents(node.children) } 
        : node;
    }));
  }

  #extractContent(nodes) {
    const content = {};
    let currentPage = null;

    const traverse = (node) => {
      if (node.type === "text") {
        const html = node.text?.html || "";
        if (html.includes('class="page-title"')) {
          currentPage = node.text.text.trim();
          content[currentPage] = {
            title: currentPage,
            slug: this.#createSlug(currentPage),
            markdown: ""
          };
        } else if (currentPage) {
          content[currentPage].markdown += this.#htmlToMarkdown(html) + "\n";
        }
      }
      node.children?.forEach(traverse);
    };

    nodes.forEach(traverse);
    return content;
  }

  #createSlug(title) {
    return title.toLowerCase() === "index" ? "/in" : 
      `/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  }

  // API methods
  async #getDom(endpoint) {
    return this.#fetchData(endpoint);
  }

  async #getComponentDefinition(componentId) {
    return this.#componentCache.get(componentId) || 
      this.#fetchData(`sites/${WebflowFetcher.CONFIG.SITE_ID}/components/${componentId}/dom`)
        .then(data => (this.#componentCache.set(componentId, data.nodes), data.nodes));
  }

  async #getCollectionItems(collectionId) {
    return this.#fetchData(`collections/${collectionId}/items/live`);
  }

  async #getSystemPrompt() {
    return this.#fetchData(
      `collections/${WebflowFetcher.CONFIG.COLLECTIONS.SYSTEM_PROMPT}/items/${WebflowFetcher.CONFIG.ITEMS.SYSTEM_PROMPT}/live`
    );
  }

  async #fetchData(endpoint) {
    const { data } = await this.#axios.get(endpoint);
    return data;
  }

  // Transformers
  #transformCaseStudies(items) {
    return items.reduce((acc, item) => {
      const key = item.fieldData.name.toLowerCase();
      acc[key] = {
        title: item.fieldData.name,
        slug: `/casestudies/${item.fieldData.slug}`,
        content: this.#htmlToMarkdown(item.fieldData.content || '')
      };
      return acc;
    }, {});
  }

  #transformSystemPrompt(data) {
    return {
      styleGuidelines: data.fieldData["style-guidelines"] || "",
      questionPatterns: data.fieldData["specific-question-patterns"] || ""
    };
  }
}