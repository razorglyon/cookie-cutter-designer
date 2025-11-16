# Gemini API - Technical Documentation

This document provides technical details about the Gemini API integration in Cookie Cutter Designer.

## Architecture Overview

```
User Browser (Client)
    ↓
geminiAPI.ts (API Wrapper)
    ↓
Google Gemini API (REST)
    ↓
Response (JSON/Image)
```

## API Models Used

### 1. Text Generation: `gemini-2.5-flash`
- **Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
- **Use Cases:**
  - Design improvement suggestions
  - SVG analysis
  - Design variations
- **Features:**
  - System instructions
  - Structured JSON output
  - Response schemas

### 2. Image Generation: `gemini-2.5-flash-image`
- **Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`
- **Use Cases:**
  - Text-to-image generation
  - Cookie cutter silhouette creation
- **Output:** Base64-encoded image (PNG/JPEG)

## Implementation Details

### System Instructions (Best Practice)

All API calls use `systemInstruction` to define the AI's role and behavior:

```typescript
const systemInstruction = `You are an expert 3D printing engineer with 10+ years of experience.
You provide practical, actionable advice focusing on structural integrity, printability, and user experience.`;
```

**Benefits:**
- Consistent behavior across requests
- Better quality responses
- Clear role definition

### Structured Output (JSON Mode)

Functions use `responseMimeType` and `responseSchema` for guaranteed JSON responses:

```typescript
responseMimeType: 'application/json',
responseSchema: {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          category: { type: 'string' },
          suggestion: { type: 'string' },
          reasoning: { type: 'string' }
        }
      }
    }
  }
}
```

**Benefits:**
- Parsable responses (no manual regex parsing)
- Type-safe output
- Fallback handling if parsing fails

### Temperature Settings

Different tasks use different temperatures:

| Task | Temperature | Reasoning |
|------|-------------|-----------|
| SVG Analysis | 0.2 | Precise, deterministic output |
| Suggestions | 0.7 | Balanced creativity and accuracy |
| Variations | 0.95 | Maximum creativity |
| Image Generation | 0.4 | Consistent but creative silhouettes |

### Chain-of-Thought Prompting

Complex tasks use step-by-step reasoning:

```typescript
**Step 1: Assess Current Parameters**
- Wall thickness: ${params.wallThickness}mm (recommended: 1.0-1.5mm)
- Cutting height: ${params.cuttingHeight}mm (recommended: 10-15mm)

**Step 2: Evaluate Against Best Practices**
Check for:
- Structural weaknesses
- Printability issues

**Step 3: Generate Recommendations**
```

**Benefits:**
- Better reasoning quality
- More accurate suggestions
- Transparent thought process

## Security Considerations

### ⚠️ CRITICAL: API Key Exposure

**Current Implementation:**
- API key stored in `localStorage` (client-side)
- All API calls made directly from browser
- Key exposed in network traffic

**Risk Level:** 🔴 **HIGH** for production applications

**Why This is a Problem:**
1. Anyone can inspect browser DevTools and extract the key
2. Key visible in network requests (even with HTTPS)
3. Rate limits apply to the key (abuse possible)
4. No server-side validation

### ✅ Recommended Production Architecture

For production deployment, implement a backend proxy:

```
User Browser
    ↓
Your Backend API (Node.js/Express/Cloud Function)
    ↓ (API key stored server-side)
Google Gemini API
```

**Example Backend (Node.js/Express):**

```javascript
// server.js
const express = require('express');
const app = express();

app.post('/api/gemini', async (req, res) => {
  const { prompt, config } = req.body;

  // API key stored in environment variable (secure)
  const apiKey = process.env.GEMINI_API_KEY;

  // Make request to Gemini API
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: config
      })
    }
  );

  const data = await response.json();
  res.json(data);
});

app.listen(3000);
```

**Frontend Update:**

```typescript
// Instead of calling Gemini directly:
// const response = await fetch(`${GEMINI_API_ENDPOINT}?key=${apiKey}`, ...)

// Call your backend:
const response = await fetch('/api/gemini', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt, config })
});
```

### Alternative: Serverless Functions

**Vercel/Netlify Functions:**

```typescript
// api/gemini.ts
export default async function handler(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  // ... proxy request
}
```

**Deploy:**
```bash
# Vercel
vercel --prod

# Netlify
netlify deploy --prod
```

### Current Use Case Justification

**Why we use client-side for now:**
1. ✅ **Educational/Demo purposes** - easier to understand the flow
2. ✅ **User-provided keys** - users bring their own free API keys
3. ✅ **No cost to developers** - no backend infrastructure needed
4. ✅ **Transparent operation** - users see exactly what's happening

**This is acceptable for:**
- Personal projects
- Learning/experimentation
- Demos and prototypes
- When users understand they're sharing their own API key

**NOT acceptable for:**
- Production SaaS applications
- Public-facing services
- Apps with your own API key
- Commercial products

## Rate Limits

Gemini 2.5 Flash Free Tier:
- **15 requests per minute**
- **1,500 requests per day**
- **1 million requests per month**

**Handling Rate Limits:**

The current implementation throws an error if rate limited. For production, implement exponential backoff:

```typescript
async function callGeminiWithRetry(prompt, config, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await callGemini(prompt, config);
    } catch (error) {
      if (error.message.includes('429') && i < retries - 1) {
        // Wait exponentially: 1s, 2s, 4s
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
        continue;
      }
      throw error;
    }
  }
}
```

## Error Handling

All functions implement try-catch with informative error messages:

```typescript
try {
  const response = await callGemini(prompt, config);
  const data = JSON.parse(response.text);
  return data.suggestions.map(/* ... */);
} catch (e) {
  // Fallback to regex parsing if JSON fails
  // This should rarely happen with structured output
  console.warn('Structured output parsing failed, using fallback');
  return parseLegacyFormat(response.text);
}
```

## Testing

### Manual Testing

```bash
# Start dev server
pnpm run dev

# 1. Configure API key in UI
# 2. Try each AI feature:
#    - Generate: "Christmas tree"
#    - Suggestions: Upload a design
#    - Analyze: Check console for analysis
#    - Variations: "star cookie cutter"
```

### API Testing (Direct)

```bash
# Test with curl
curl -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "Hello"}]}]
  }'
```

## Performance Optimization

### 1. Response Caching

Currently not implemented. For production, cache common requests:

```typescript
const cache = new Map();

async function callGeminiCached(prompt, config) {
  const key = `${prompt}-${JSON.stringify(config)}`;
  if (cache.has(key)) {
    return cache.get(key);
  }

  const result = await callGemini(prompt, config);
  cache.set(key, result);
  return result;
}
```

### 2. Request Debouncing

For real-time features, debounce requests:

```typescript
let debounceTimer;

function debouncedGenerateSuggestions(params) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    generateSuggestions(params);
  }, 500);
}
```

## Monitoring and Logging

### Console Logging

All functions log to console for debugging:

```typescript
console.log('SVG Optimization Analysis:', data);
console.error('Image generation error:', err);
```

### Production Monitoring

For production, implement proper logging:

```typescript
// Using a service like Sentry, LogRocket, etc.
try {
  const result = await callGemini(prompt, config);
  analytics.track('gemini_request_success', {
    model: 'gemini-2.5-flash',
    tokens: result.candidates[0].usage.totalTokens
  });
} catch (error) {
  Sentry.captureException(error, {
    tags: { feature: 'ai_suggestions' }
  });
}
```

## Future Improvements

### 1. Streaming Responses

Gemini supports streaming for real-time output:

```typescript
async function* streamGemini(prompt, config) {
  const response = await fetch(endpoint, {
    method: 'POST',
    body: JSON.stringify({ ...requestBody, stream: true })
  });

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield new TextDecoder().decode(value);
  }
}
```

### 2. Multi-turn Conversations

Implement chat history for iterative refinement:

```typescript
const history = [];

async function chatWithGemini(userMessage) {
  history.push({ role: 'user', parts: [{ text: userMessage }] });

  const response = await callGemini({
    contents: history,
    // ...
  });

  history.push({ role: 'model', parts: [{ text: response.text }] });
  return response;
}
```

### 3. Image Understanding

Add image input analysis (Gemini 2.5 Pro Vision):

```typescript
async function analyzeUploadedImage(imageBlob) {
  const base64 = await blobToBase64(imageBlob);

  const response = await callGemini({
    contents: [{
      parts: [
        { text: "Analyze this cookie cutter design and suggest improvements" },
        { inlineData: { mimeType: 'image/png', data: base64 } }
      ]
    }]
  });
}
```

## References

- [Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
- [Prompting Strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies)
- [Structured Output Guide](https://ai.google.dev/gemini-api/docs/json-mode)
- [Safety Settings](https://ai.google.dev/gemini-api/docs/safety-settings)
- [Rate Limits](https://ai.google.dev/gemini-api/docs/quota)

## Support

For issues with the Gemini API integration:
1. Check browser console for detailed error messages
2. Verify API key is valid at [Google AI Studio](https://aistudio.google.com/app/apikey)
3. Check rate limits in AI Studio dashboard
4. Open an issue on GitHub with error details

---

**Last Updated:** 2025-11-16
**API Version:** v1beta
**Models:** gemini-2.5-flash, gemini-2.5-flash-image
