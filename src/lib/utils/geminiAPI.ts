/**
 * Gemini 2.5 Flash API Integration
 *
 * Uses user-provided free API key from Google AI Studio
 * https://aistudio.google.com/app/apikey
 */

const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export interface GeminiConfig {
  apiKey: string;
  temperature?: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
  responseMimeType?: string;
  responseSchema?: any;
}

export interface GeminiResponse {
  text: string;
  candidates: any[];
  error?: string;
}

/**
 * Call Gemini 2.5 Flash API with advanced options
 */
export async function callGemini(
  prompt: string,
  config: GeminiConfig
): Promise<GeminiResponse> {
  const {
    apiKey,
    temperature = 0.7,
    maxOutputTokens = 2048,
    systemInstruction,
    responseMimeType,
    responseSchema,
  } = config;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('Gemini API key is required');
  }

  try {
    const requestBody: any = {
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature,
        maxOutputTokens,
        topP: 0.95,
        topK: 40,
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
      ],
    };

    // Add system instruction if provided
    if (systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    // Add structured output configuration if provided
    if (responseMimeType) {
      requestBody.generationConfig.responseMimeType = responseMimeType;
    }
    if (responseSchema) {
      requestBody.generationConfig.responseSchema = responseSchema;
    }

    const response = await fetch(`${GEMINI_API_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error?.message || `API request failed: ${response.status}`
      );
    }

    const data = await response.json();

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('No response generated from Gemini');
    }

    const text = data.candidates[0]?.content?.parts?.[0]?.text || '';

    return {
      text,
      candidates: data.candidates,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Gemini API Error: ${error.message}`);
    }
    throw new Error('Unknown error occurred while calling Gemini API');
  }
}

/**
 * Optimize SVG paths using Gemini AI with system instruction
 */
export async function optimizeSVGWithAI(
  svgContent: string,
  apiKey: string
): Promise<string> {
  const systemInstruction = `You are a professional SVG optimization expert.
Your specialty is simplifying complex SVG paths for 3D printing while preserving visual accuracy.
You always return clean, valid SVG code without any explanations or formatting.`;

  const prompt = `Optimize this SVG for 3D printing cookie cutters.

**Optimization Strategy:**
1. Analyze the SVG structure and identify optimization opportunities
2. Simplify path data using fewer points while maintaining shape accuracy (±0.5% tolerance)
3. Remove redundant or invisible elements
4. Merge adjacent paths where possible
5. Preserve viewBox and dimensions exactly

**Critical Rules:**
- Output ONLY raw SVG code (start with <svg, end with </svg>)
- NO markdown, NO code blocks (\`\`\`), NO explanations
- Maintain visual fidelity within 0.5% of original
- Keep the same dimensions and aspect ratio

**Original SVG:**
${svgContent}

**Output Format:** Pure SVG XML starting with <svg`;

  const response = await callGemini(prompt, {
    apiKey,
    temperature: 0.2, // Lower temperature for more consistent, precise output
    maxOutputTokens: 4096,
    systemInstruction,
  });

  let svgText = response.text.trim();

  // Remove markdown code blocks if present
  svgText = svgText.replace(/```svg\n?/g, '').replace(/```\n?/g, '').replace(/```/g, '');

  // Extract SVG from response (in case there's extra text)
  const svgMatch = svgText.match(/<svg[\s\S]*?<\/svg>/i);
  if (!svgMatch) {
    throw new Error(
      'AI returned invalid response. Could not extract valid SVG. Try again or use the original SVG.'
    );
  }

  return svgMatch[0];
}

/**
 * Suggest design improvements using Gemini AI with structured output
 */
export async function suggestDesignImprovements(
  pathData: string,
  params: any,
  apiKey: string
): Promise<string[]> {
  const systemInstruction = `You are an expert 3D printing engineer with 10+ years of experience designing cookie cutters.
You provide practical, actionable advice focusing on structural integrity, printability, and user experience.
Think step-by-step before providing recommendations.`;

  const prompt = `Analyze this cookie cutter design and suggest improvements.

**Step 1: Assess Current Parameters**
- Wall thickness: ${params.wallThickness}mm (recommended: 1.0-1.5mm)
- Cutting height: ${params.cuttingHeight}mm (recommended: 10-15mm)
- Taper angle: ${params.taperAngle}° (recommended: 5-10°)
- Total height: ${params.totalHeight}mm
- Design complexity: ${pathData.length > 1000 ? 'High' : pathData.length > 500 ? 'Medium' : 'Low'}

**Step 2: Evaluate Against Best Practices**
Check for:
- Structural weaknesses (thin walls, sharp corners)
- Printability issues (overhangs, bridging, supports)
- Usability concerns (handle ergonomics, cookie release)
- Manufacturing constraints (minimum feature size)

**Step 3: Generate 3-5 Specific Suggestions**
Provide actionable improvements with priority levels.`;

  const response = await callGemini(prompt, {
    apiKey,
    temperature: 0.7,
    maxOutputTokens: 1536,
    systemInstruction,
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'object',
      properties: {
        suggestions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              priority: {
                type: 'string',
                enum: ['high', 'medium', 'low'],
                description: 'Importance level of this suggestion',
              },
              category: {
                type: 'string',
                enum: ['structural', 'printability', 'usability', 'design'],
                description: 'Type of improvement',
              },
              suggestion: {
                type: 'string',
                description: 'Clear, actionable recommendation',
              },
              reasoning: {
                type: 'string',
                description: 'Why this improvement matters',
              },
            },
            required: ['priority', 'category', 'suggestion', 'reasoning'],
          },
        },
      },
      required: ['suggestions'],
    },
  });

  try {
    const data = JSON.parse(response.text);
    return data.suggestions.map(
      (s: any) =>
        `[${s.priority.toUpperCase()}] ${s.suggestion} (${s.reasoning})`
    );
  } catch (e) {
    // Fallback to old parsing if JSON fails
    const suggestions = response.text
      .split('\n')
      .filter((line) => /^\d+\./.test(line.trim()))
      .map((line) => line.replace(/^\d+\.\s*/, '').trim())
      .filter((s) => s.length > 0);
    return suggestions;
  }
}

/**
 * Generate creative design variations using Gemini AI with structured output
 */
export async function generateDesignVariations(
  description: string,
  apiKey: string
): Promise<string[]> {
  const systemInstruction = `You are a creative designer specializing in cookie cutter designs.
You excel at generating diverse, imaginative variations while maintaining practical considerations for 3D printing and cookie cutting.
Think creatively but stay grounded in manufacturability.`;

  const prompt = `Generate 5 creative variations of a cookie cutter based on: "${description}"

**Creative Process:**
1. Brainstorm different artistic approaches (minimalist, detailed, geometric, whimsical)
2. Consider complexity levels (simple outline, moderate detail, intricate design)
3. Ensure each variation is distinct and practical for cookie cutting

**Requirements:**
- Each variation should be unique in style or approach
- Include details that would help visualize the design
- Keep 3D printing constraints in mind (no impossible overhangs)
- 1-2 sentences per variation

Examples of good variations:
- "Classic triangular Christmas tree with 5 simple tiers and a star on top"
- "Minimalist geometric tree using only straight lines in a modern angular style"
- "Detailed tree with individual branch textures and ornament impressions"`;

  const response = await callGemini(prompt, {
    apiKey,
    temperature: 0.95,
    maxOutputTokens: 1024,
    systemInstruction,
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'object',
      properties: {
        variations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              style: {
                type: 'string',
                description: 'Design style (e.g., minimalist, detailed, geometric)',
              },
              description: {
                type: 'string',
                description: 'Clear description of the variation',
              },
              complexity: {
                type: 'string',
                enum: ['simple', 'moderate', 'detailed'],
                description: 'Design complexity level',
              },
            },
            required: ['style', 'description', 'complexity'],
          },
          minItems: 5,
          maxItems: 5,
        },
      },
      required: ['variations'],
    },
  });

  try {
    const data = JSON.parse(response.text);
    return data.variations.map(
      (v: any) => `[${v.complexity.toUpperCase()}] ${v.style}: ${v.description}`
    );
  } catch (e) {
    // Fallback to old parsing if JSON fails
    const variations = response.text
      .split('\n')
      .filter((line) => /^\d+\./.test(line.trim()))
      .map((line) => line.replace(/^\d+\.\s*/, '').trim())
      .filter((s) => s.length > 0);
    return variations;
  }
}

/**
 * Validate and store API key in localStorage
 */
export function saveAPIKey(apiKey: string): void {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('API key cannot be empty');
  }
  localStorage.setItem('gemini_api_key', apiKey.trim());

  // Dispatch custom event to notify components
  window.dispatchEvent(new CustomEvent('gemini-api-key-changed'));
}

/**
 * Retrieve API key from localStorage
 */
export function getAPIKey(): string | null {
  return localStorage.getItem('gemini_api_key');
}

/**
 * Remove API key from localStorage
 */
export function clearAPIKey(): void {
  localStorage.removeItem('gemini_api_key');

  // Dispatch custom event to notify components
  window.dispatchEvent(new CustomEvent('gemini-api-key-changed'));
}

/**
 * Test if API key is valid
 */
export async function validateAPIKey(apiKey: string): Promise<boolean> {
  try {
    await callGemini('Hello', { apiKey, maxOutputTokens: 10 });
    return true;
  } catch (error) {
    return false;
  }
}
