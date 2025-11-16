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
}

export interface GeminiResponse {
  text: string;
  candidates: any[];
  error?: string;
}

/**
 * Call Gemini 2.5 Flash API
 */
export async function callGemini(
  prompt: string,
  config: GeminiConfig
): Promise<GeminiResponse> {
  const { apiKey, temperature = 0.7, maxOutputTokens = 2048 } = config;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('Gemini API key is required');
  }

  try {
    const response = await fetch(`${GEMINI_API_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
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
      }),
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
 * Optimize SVG paths using Gemini AI
 */
export async function optimizeSVGWithAI(
  svgContent: string,
  apiKey: string
): Promise<string> {
  const prompt = `You are an SVG optimization expert. Analyze this SVG and provide an optimized version that:
1. Simplifies complex paths while maintaining visual accuracy
2. Removes unnecessary elements and attributes
3. Combines paths where possible
4. Maintains the original dimensions and aspect ratio
5. Ensures the result is valid SVG that can be used for 3D printing cookie cutters

Original SVG:
${svgContent}

Return ONLY the optimized SVG code, without any explanation or markdown formatting.`;

  const response = await callGemini(prompt, {
    apiKey,
    temperature: 0.3, // Lower temperature for more consistent output
    maxOutputTokens: 4096,
  });

  // Extract SVG from response (in case there's extra text)
  const svgMatch = response.text.match(/<svg[\s\S]*<\/svg>/i);
  if (svgMatch) {
    return svgMatch[0];
  }

  return response.text.trim();
}

/**
 * Suggest design improvements using Gemini AI
 */
export async function suggestDesignImprovements(
  pathData: string,
  params: any,
  apiKey: string
): Promise<string[]> {
  const prompt = `You are a 3D printing expert specializing in cookie cutters. Analyze this design and provide 3-5 specific, actionable suggestions to improve it for 3D printing.

Current parameters:
- Wall thickness: ${params.wallThickness}mm
- Cutting height: ${params.cuttingHeight}mm
- Taper angle: ${params.taperAngle}°
- Total height: ${params.totalHeight}mm

Path complexity: ${pathData.length} characters

Provide suggestions focusing on:
1. Structural integrity for 3D printing
2. Ease of use with cookie dough
3. Printability and support requirements
4. Design aesthetics and functionality

Return your response as a numbered list (1., 2., 3., etc.) with one suggestion per line.`;

  const response = await callGemini(prompt, {
    apiKey,
    temperature: 0.8,
    maxOutputTokens: 1024,
  });

  // Parse numbered list into array
  const suggestions = response.text
    .split('\n')
    .filter((line) => /^\d+\./.test(line.trim()))
    .map((line) => line.replace(/^\d+\.\s*/, '').trim())
    .filter((s) => s.length > 0);

  return suggestions;
}

/**
 * Generate creative design variations using Gemini AI
 */
export async function generateDesignVariations(
  description: string,
  apiKey: string
): Promise<string[]> {
  const prompt = `Generate 5 creative variations of a cookie cutter design based on this description: "${description}"

For each variation, provide a brief description (1-2 sentences) that could be used to create an SVG path.
Focus on:
- Different artistic styles (minimalist, detailed, geometric, organic)
- Various complexity levels
- Practical considerations for cookie cutting

Return your response as a numbered list (1., 2., 3., etc.) with one variation per line.`;

  const response = await callGemini(prompt, {
    apiKey,
    temperature: 0.9, // Higher temperature for more creative output
    maxOutputTokens: 1024,
  });

  // Parse numbered list into array
  const variations = response.text
    .split('\n')
    .filter((line) => /^\d+\./.test(line.trim()))
    .map((line) => line.replace(/^\d+\.\s*/, '').trim())
    .filter((s) => s.length > 0);

  return variations;
}

/**
 * Validate and store API key in localStorage
 */
export function saveAPIKey(apiKey: string): void {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('API key cannot be empty');
  }
  localStorage.setItem('gemini_api_key', apiKey.trim());
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
