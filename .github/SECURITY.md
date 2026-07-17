# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| latest (`main` / npm `cuporacle-mcp`) | ✅ |

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities. Instead,
report them privately:

- Email **edy.cu@live.com**, or
- Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) (Security → Report a vulnerability).

You'll get an acknowledgment within 48 hours and a resolution timeline after
triage. Please give us a reasonable window to patch before public disclosure.

## Handling the Payer Wallet & Keys

`cuporacle-mcp` signs x402 payments with a local private key
(`CUPORACLE_PRIVATE_KEY`). Please keep these practices in mind when reporting or
reproducing issues:

- The payer wallet is a **throwaway** funded with only cents of USDC — never use
  a main seed. The AES-256-GCM keystore and `.env.local` are git-ignored.
- The x402 client signs EIP-3009 authorizations **locally** and enforces a
  per-session spend cap; report any path that could exceed the cap, sign without
  authorization, or leak a key to stdout/logs as a security issue.
- Never paste a real private key into an issue, PR, or CI log.
