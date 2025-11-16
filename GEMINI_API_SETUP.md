# Gemini AI Features Setup Guide

This document explains how to configure and use the AI features powered by Google's Gemini 2.5 Flash model.

## Overview

Cookie Cutter Designer integrates with Google's Gemini 2.5 Flash API to provide intelligent design assistance:

- 🎨 **SVG Optimization**: Automatically simplify and optimize complex paths
- 💡 **Design Suggestions**: Get AI-powered recommendations for better 3D printing
- 🔄 **Design Variations**: Generate creative alternatives based on descriptions
- 🤖 **Smart Recommendations**: Parameter optimization for your specific design

## Getting Your Free API Key

### Step 1: Visit Google AI Studio

Go to [Google AI Studio](https://aistudio.google.com/app/apikey)

### Step 2: Sign In

Sign in with your Google account (personal or workspace account)

### Step 3: Create API Key

1. Click **"Create API Key"** button
2. Select **"Create API key in new project"** (or choose an existing project)
3. Copy the generated API key (starts with `AIzaSy...`)

**Important**: Keep your API key secure and don't share it publicly!

### Step 4: Configure in the App

1. Open Cookie Cutter Designer
2. Look for the **"🤖 Gemini AI Configuration"** section
3. Paste your API key
4. Click **"Save & Validate"**

The app will test your key and confirm it's working.

## API Quota & Pricing

### Free Tier

Gemini 2.5 Flash offers a generous free tier:

- **15 requests per minute**
- **1,500 requests per day**
- **1 million requests per month**

This is more than enough for personal use!

### Rate Limits

If you exceed the rate limits, you'll see an error message. Simply wait a minute and try again.

## Using AI Features

### 1. Design Suggestions

Get AI-powered recommendations to improve your design:

1. Upload and design your cookie cutter
2. Click **"🤖 AI Assistant"**
3. Go to **"💡 Suggestions"** tab
4. Click **"Get Suggestions"**

The AI will analyze:

- Wall thickness and structural integrity
- 3D printability concerns
- Design aesthetics
- Functional improvements

### 2. SVG Optimization

Simplify complex SVG paths while maintaining shape accuracy:

1. Upload your SVG file
2. Click **"🤖 AI Assistant"**
3. Go to **"⚡ Optimize"** tab
4. Click **"Optimize SVG"**

The AI will:

- Simplify complex paths
- Remove unnecessary elements
- Combine paths where possible
- Maintain original dimensions

### 3. Design Variations

Generate creative alternatives:

1. Click **"🤖 AI Assistant"**
2. Go to **"🎨 Variations"** tab
3. Click **"Generate Variations"**
4. Enter a description (e.g., "star cookie cutter")

The AI will suggest 5 different design approaches.

## Model Information

### Gemini 2.5 Flash

- **Model ID**: `gemini-2.5-flash`
- **Speed**: Fast responses (typically <2 seconds)
- **Quality**: High-quality suggestions optimized for coding and technical tasks
- **Context**: 1 million token context window
- **Strengths**: Code generation, technical analysis, structured output

### Why Flash vs Pro?

We use **Gemini 2.5 Flash** instead of Pro because:

- ✅ **Free tier is generous** (1.5M requests/month)
- ✅ **Much faster responses** (important for interactive UI)
- ✅ **Excellent for technical tasks** (SVG optimization, code analysis)
- ✅ **Lower cost** if you upgrade to paid tier
- ✅ **More than capable** for design suggestions

## Privacy & Security

### Local Storage

- Your API key is stored **locally in your browser** using `localStorage`
- The key **never leaves your device** except for API calls to Google
- No server stores your API key

### Data Sent to Gemini API

When you use AI features, the following data is sent to Google:

- **SVG content** (for optimization)
- **Design parameters** (wall thickness, height, etc.)
- **Text descriptions** (for generating variations)

**No personal information is sent.**

### Clearing Your API Key

To remove your API key:

1. Open Gemini AI Configuration
2. Click **"Clear Key"**
3. The key is permanently deleted from browser storage

## Troubleshooting

### "Invalid API key" Error

**Cause**: The API key is incorrect or expired

**Solution**:

1. Double-check you copied the entire key (should start with `AIzaSy`)
2. Generate a new API key from Google AI Studio
3. Make sure there are no extra spaces

### "Rate limit exceeded" Error

**Cause**: You've made too many requests too quickly

**Solution**:

- Wait 60 seconds and try again
- Free tier: 15 requests/minute, 1,500/day

### "Failed to validate API key" Error

**Cause**: Network issue or API service temporarily unavailable

**Solution**:

1. Check your internet connection
2. Visit [Google Cloud Status](https://status.cloud.google.com/) to check for outages
3. Try again in a few minutes

### API Key Not Saving

**Cause**: Browser localStorage might be disabled

**Solution**:

1. Check browser settings allow local storage
2. Try a different browser
3. Disable private/incognito mode

## API Usage Best Practices

### 1. Use Sparingly

AI features consume API quota. Use them when you need intelligent suggestions, not for every small change.

### 2. Cache Results

If you get good suggestions, save them! The app doesn't cache AI responses to respect your quota.

### 3. Batch Operations

Instead of optimizing multiple SVGs one by one, combine them first if possible.

### 4. Monitor Usage

Check your API usage at [Google AI Studio](https://aistudio.google.com/app/apikey) if you're approaching limits.

## Technical Details

### API Endpoint

```
https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
```

### Request Format

The app sends POST requests with:

```json
{
  "contents": [
    {
      "parts": [{ "text": "your prompt here" }]
    }
  ],
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 2048
  }
}
```

### Safety Settings

All requests include content safety filters:

- Harassment: BLOCK_MEDIUM_AND_ABOVE
- Hate Speech: BLOCK_MEDIUM_AND_ABOVE
- Sexually Explicit: BLOCK_MEDIUM_AND_ABOVE
- Dangerous Content: BLOCK_MEDIUM_AND_ABOVE

## Upgrading to Paid Tier

If you need more quota, you can upgrade to paid tier:

1. Visit [Google Cloud Console](https://console.cloud.google.com/)
2. Enable billing for your project
3. Gemini 2.5 Flash pricing: **$0.075 per 1M input tokens, $0.30 per 1M output tokens**

Very affordable for most use cases!

## Alternatives

If you prefer not to use Google's API:

- The app works perfectly fine **without AI features**
- All core functionality (SVG upload, 3D preview, STL export) is **client-side only**
- AI features are **optional enhancements**

## Support

### Questions About API Keys

- Google AI Studio: https://aistudio.google.com/
- Gemini API Docs: https://ai.google.dev/gemini-api/docs

### Questions About the App

- GitHub Issues: https://github.com/razorglyon/cookie-cutter-designer/issues
- CONTRIBUTING.md for contribution guidelines

---

**Enjoy intelligent design assistance with Gemini 2.5 Flash!** 🤖✨
