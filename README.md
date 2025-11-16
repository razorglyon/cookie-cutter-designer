# Cookie Cutter Designer

[![Deploy to GitHub Pages](https://github.com/razorglyon/cookie-cutter-designer/actions/workflows/deploy.yml/badge.svg)](https://github.com/razorglyon/cookie-cutter-designer/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Made with Svelte](https://img.shields.io/badge/Made%20with-Svelte-FF3E00?logo=svelte&logoColor=white)](https://svelte.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A web application for designing custom 3D-printable cookie cutters from vector images or raster graphics.

**🔗 [Live Demo](https://razorglyon.github.io/cookie-cutter-designer/)**

## Features

### Core Features

- **File Support**: Upload SVG, PNG, or JPG files
- **Auto-Vectorization**: Automatically converts raster images to vector paths
- **3D Preview**: Real-time 3D visualization with Three.js
- **Customizable Parameters**:
  - Wall thickness (0.8-2.0mm)
  - Cutting height (8-25mm)
  - Total height (15-40mm)
  - Taper angle (0-15°)
  - Scale adjustment
- **Handle Styles**: Round, chamfered, rectangular, flat, or no handle
- **Embossing/Stamping**: Optional raised or indented designs
- **STL Export**: Download 3D-printable STL files (binary format)
- **Printability Validation**: Real-time warnings and recommendations

### 🤖 AI-Powered Features (Optional)

Powered by **Gemini 2.5 Flash** with your free API key:

- **Image Generation**: Create cookie cutter designs from text descriptions (NEW!)
- **Smart Suggestions**: AI-powered design improvement recommendations
- **SVG Analysis**: Get optimization recommendations for complex paths
- **Design Variations**: Generate creative alternatives from descriptions

**[📖 How to set up AI features](GEMINI_API_SETUP.md)**
**[🔧 Technical Documentation](GEMINI_API_TECHNICAL.md)** (for developers)

⚠️ **Security Note:** This app uses client-side API calls for simplicity. For production use, implement a backend proxy to protect your API key. See [technical docs](GEMINI_API_TECHNICAL.md#security-considerations) for details.

## Technology Stack

- **Frontend Framework**: Svelte 5 + TypeScript
- **Build Tool**: Vite
- **3D Rendering**: Three.js
- **Image Vectorization**: imagetracer
- **Package Manager**: pnpm

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (or npm/yarn)

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm run dev

# Build for production
pnpm run build

# Preview production build
pnpm run preview
```

The application will be available at `http://localhost:5173/`

## Usage

1. **Upload a Design**
   - Drag and drop or click to browse
   - Supported formats: SVG, PNG, JPG (max 10MB)
   - Or try the test circle to get started

2. **Adjust Parameters**
   - Use the parameter panel to customize your cookie cutter
   - See real-time 3D preview of changes
   - Check warnings and recommendations for 3D printing

3. **Export STL**
   - Click "Download STL File" to export
   - File will be in binary STL format (smaller file size)
   - Ready for slicing and 3D printing!

## 3D Printing Recommendations

### Material
- **PLA (Natural/Undyed)**: Best for cookie cutters
- **PETG**: More durable, food-safe

### Settings
- **Layer Height**: 0.2mm (0.15mm for detailed stamps)
- **Infill**: 20%
- **Wall Lines**: 2-3 perimeters
- **Orientation**: Print upside down (cutting edge facing up)
- **Supports**: Generally not needed

### Best Practices
- Minimum wall thickness: 0.8mm (recommended 1.0mm)
- Cutting height: 10-15mm for standard cookies
- Taper angle: 5-10° for easy cookie removal
- Hand wash only (no dishwasher)
- Store in cool, dry place away from direct sunlight

## Project Structure

```
src/
├── lib/
│   ├── components/
│   │   ├── ui/
│   │   │   ├── FileUpload.svelte
│   │   │   ├── ParameterPanel.svelte
│   │   │   └── PrintabilityInfo.svelte
│   │   └── viewer/
│   │       └── ThreeViewer.svelte
│   ├── stores/
│   │   └── cookieCutterStore.ts
│   ├── types/
│   │   └── CookieCutter.ts
│   └── utils/
│       ├── cookieCutterGenerator.ts
│       ├── imageProcessor.ts
│       └── stlExporter.ts
├── App.svelte
└── main.ts
```

## Future Enhancements

- [ ] Advanced path editing tools
- [ ] Multi-layer cutters
- [ ] Custom text embossing
- [ ] Path offsetting with Clipper.js for precise wall control
- [ ] Web Workers for heavy computation
- [ ] Cloud storage for user designs
- [ ] Slicer profile export
- [ ] Material cost estimation

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Acknowledgments

- Based on research into existing cookie cutter design tools
- Inspired by CookieCAD, Cookie Design Lab, and BuildBee
- Built with modern web technologies for optimal performance

## Support

For issues or questions, please open an issue on GitHub.

---

Made with Svelte, Three.js, and passion for 3D printing!
