# Security Policy

## Supported Versions

We take security seriously. The following versions of Cookie Cutter Designer are currently supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| Latest (main) | :white_check_mark: |
| < Latest | :x: |

We recommend always using the latest version from the `main` branch.

## Security Features

### Automated Security Scanning

This project uses multiple layers of security protection:

- **CodeQL Analysis**: Automated code scanning on every push and pull request
- **Dependabot Alerts**: Automatic detection of vulnerable dependencies
- **Dependabot Security Updates**: Automated PRs to fix known vulnerabilities
- **Branch Protection**: Required reviews and status checks before merging

### Code Review Process

All code changes go through:
1. Automated security scans (CodeQL)
2. Build verification
3. Manual code review by maintainers
4. Approval before merge

## Reporting a Vulnerability

If you discover a security vulnerability, please follow responsible disclosure:

### Do NOT:
- Open a public GitHub issue
- Discuss the vulnerability publicly
- Exploit the vulnerability

### DO:
1. **Email the maintainer** privately at the email listed in the GitHub profile
2. **Include details**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if you have one)

### Response Timeline

- **24-48 hours**: Initial response acknowledging receipt
- **7 days**: Assessment and severity classification
- **30 days**: Fix development and testing
- **Release**: Security patch with credit to reporter (if desired)

## Security Best Practices for Users

When using Cookie Cutter Designer:

### File Upload Safety
- Only upload files from trusted sources
- The app processes SVG/PNG/JPG files in the browser
- No files are uploaded to external servers
- All processing happens client-side

### 3D Printing Safety
- Always inspect generated STL files before printing
- Use food-safe filament (PLA or PETG) for cookie cutters
- Follow 3D printing best practices
- Hand wash only - do not use dishwasher

### Browser Security
- Use a modern, updated browser
- Keep JavaScript enabled (required for the app)
- The app runs entirely in your browser - no server-side processing

## Dependencies Security

We actively monitor and update dependencies:

- **Automated weekly scans** for vulnerable packages
- **Dependabot PRs** for security updates
- **Manual review** of all dependency updates
- **Lock file** (pnpm-lock.yaml) for reproducible builds

## Third-Party Services

This project uses:
- **GitHub Pages**: Static hosting (read-only)
- **GitHub Actions**: CI/CD pipeline (isolated builds)
- **No external APIs or tracking**

## Security Headers

When self-hosting, ensure your web server includes:
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

## Audit Trail

Security-related changes are tracked:
- All commits are signed and attributed
- Pull requests include security scan results
- Release notes highlight security fixes

## Contact

For security concerns, contact:
- **GitHub Issues**: For general bugs (non-security)
- **Private Email**: For security vulnerabilities (check GitHub profile)
- **GitHub Security Advisories**: For disclosed vulnerabilities

## Acknowledgments

We appreciate security researchers who responsibly disclose vulnerabilities. Contributors will be credited in:
- Release notes
- SECURITY.md (this file)
- Project acknowledgments

Thank you for helping keep Cookie Cutter Designer secure! 🔒
