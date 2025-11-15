# Contributing to Cookie Cutter Designer

Thank you for your interest in contributing to Cookie Cutter Designer! This document provides guidelines and instructions for contributing to the project.

## 🌟 How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- **Clear title and description**
- **Steps to reproduce** the behavior
- **Expected behavior** vs actual behavior
- **Screenshots** if applicable
- **Browser/OS information**
- **Console errors** if any

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description** of the suggested enhancement
- **Explain why this enhancement would be useful**
- **Include mockups or examples** if applicable

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Install dependencies**: `pnpm install`
3. **Make your changes** following the code style guidelines below
4. **Test your changes**: `pnpm run dev` and verify everything works
5. **Run type checking**: `pnpm run check`
6. **Commit your changes** with clear, descriptive commit messages
7. **Push to your fork** and submit a pull request

## 📝 Code Style Guidelines

### TypeScript

- Use **TypeScript strict mode** - no `any` types unless absolutely necessary
- Add **JSDoc comments** to all exported functions
- Prefer **async/await** over promises
- Extract **magic numbers** to constants or parameters

### Svelte

- Use **Svelte 5 runes** syntax (`$state()`, `$derived()`, `$effect()`)
- Keep components **focused and small**
- Separate **UI logic from business logic**
- Put business logic in `src/lib/utils/`

### File Organization

```
src/lib/
├── components/
│   ├── ui/              # UI components
│   └── viewer/          # 3D viewer components
├── stores/              # Svelte stores for state management
├── types/               # TypeScript type definitions
└── utils/               # Business logic and utilities
```

### Naming Conventions

- **Components**: PascalCase (e.g., `FileUpload.svelte`)
- **Utilities**: camelCase (e.g., `pathOperations.ts`)
- **Types**: PascalCase (e.g., `CookieCutterParams`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `DEFAULT_PARAMS`)

## 🏗️ Development Setup

### Prerequisites

- **Node.js 18+**
- **pnpm** (package manager)

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/cookie-cutter-designer.git
cd cookie-cutter-designer

# Install dependencies
pnpm install

# Start development server
pnpm run dev
```

The app will be available at `http://localhost:5173/`

### Development Commands

```bash
# Start dev server
pnpm run dev

# Type checking
pnpm run check

# Build for production
pnpm run build

# Preview production build
pnpm run preview
```

## 🎯 Areas for Contribution

### High Priority

- **Performance optimizations** for large SVG files
- **Additional export formats** (3MF, OBJ)
- **Better mobile support** and responsive design
- **Internationalization** (i18n) support
- **Unit tests** for utilities and components

### Feature Enhancements

- **Advanced path editing** tools
- **Texture mapping** for embossing
- **Print cost estimation** calculator
- **Cloud storage** integration
- **Community gallery** of designs
- **AR preview** for mobile devices

### Documentation

- **Video tutorials** for using the app
- **3D printing guides** for different materials
- **API documentation** for utilities
- **Translation** of docs to other languages

## 🧪 Testing Guidelines

Before submitting a PR, please test:

1. **Simple shapes** (test-star.svg in public/)
2. **Complex SVGs** with many paths and curves
3. **Large raster images** (>5MB)
4. **Parameter edge cases** (min/max values)
5. **Different browsers** (Chrome, Firefox, Safari)
6. **STL export** in a slicer (PrusaSlicer, Cura, etc.)

## 🔧 Technical Notes

### Important Constraints

- **Path Operations**: Always use Clipper.js (`pathOperations.ts`) for offsetting or boolean operations - native JavaScript operations lack precision
- **Web Workers**: Use for CPU-intensive operations (>100ms) to keep UI responsive
- **Memory Management**: Dispose Three.js meshes when replacing to prevent memory leaks
- **3D Printing**: Respect physical constraints (wall thickness, angles, etc.)

### Key Architecture Patterns

- **State Management**: Centralized in `cookieCutterStore.ts`
- **Reactive Updates**: Svelte 5 runes for component state, stores for global state
- **Pipeline**: Upload → Process → Generate → Render → Export
- **Path Precision**: Use Clipper.js for all geometric operations

See `CLAUDE.md` for detailed architectural documentation.

## 📄 Commit Message Guidelines

Use clear, descriptive commit messages:

```
Add text embossing feature with font selection

- Implement TextEmbosser component
- Add 9 font options
- Support for mirroring text for stamps
- Add depth control (0.5-5mm)
```

**Format**:
- First line: Brief summary (50 chars or less)
- Blank line
- Detailed description with bullet points
- Reference issues if applicable (#123)

## 🤝 Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inspiring community for all. Please be respectful and constructive in all interactions.

### Expected Behavior

- Be **respectful** and **inclusive**
- Provide **constructive feedback**
- Focus on **what is best for the community**
- Show **empathy** towards other community members

### Unacceptable Behavior

- Harassment, discrimination, or trolling
- Personal or political attacks
- Publishing others' private information
- Any conduct inappropriate in a professional setting

## 📞 Questions?

- **Issues**: For bugs and feature requests
- **Discussions**: For questions and general discussion
- **Email**: For private inquiries (check README for contact)

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to Cookie Cutter Designer!** 🍪✨

Your contributions help make 3D-printable cookie cutter design accessible to everyone.
