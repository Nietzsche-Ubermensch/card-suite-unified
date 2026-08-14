# Security Policy

## Supported Versions

The following versions of card-suite-unified are currently supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 3.x     | :white_check_mark: |
| < 3.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in card-suite-unified, please report it privately to help us address it before public disclosure.

### How to Report

1. **Do not** open a public GitHub issue for security vulnerabilities
2. Report via GitHub Security Advisories: https://github.com/Nietzsche-Ubermensch/card-suite-unified/security/advisories/new
3. Or email the maintainer directly through your GitHub profile

### What to Include

Please include the following information in your report:
- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Suggested fix (if available)

### Response Timeline

- **Initial Response**: Within 48 hours of report
- **Status Updates**: Every 7 days until resolved
- **Resolution**: We aim to address critical vulnerabilities within 30 days

### What to Expect

**If Accepted:**
- We'll work with you to understand and reproduce the issue
- A fix will be developed and tested
- Credit will be given in the security advisory (unless you prefer to remain anonymous)
- A security update will be released

**If Declined:**
- We'll provide a detailed explanation of why the report doesn't constitute a security vulnerability
- Suggestions for alternative solutions if applicable

## Security Considerations

This project handles:
- API keys for Venice AI and external services (stored in `.env`)
- File uploads for image processing
- Server-side image manipulation with Sharp

**Best Practices:**
- Never commit `.env` files or API keys to the repository
- Keep dependencies updated regularly
- Use HTTPS in production deployments
- Validate and sanitize all file uploads
- Review `server.js` CORS configuration for production use
