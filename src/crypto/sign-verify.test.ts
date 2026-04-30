import { describe, test, expect } from "bun:test";
import { generateKeyPair } from "./keys";
import {
  canonicalize,
  sign,
  verify,
  parseFrontMatter,
  parseDecisionSection,
  signFile,
  verifyFile,
} from "./sign-verify";

const kp = generateKeyPair();

const STUB_FILE = `---
id: tv_2026-04-29T14-21_abc1234_auth-validate-test
created_at: 2026-04-29T14:21:00Z
severity: CRITICAL
status: approved
llm_enriched: true
test_file: src/lib/auth/validate.test.ts
commit: abc1234567890abcdef
diff_hash: sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
---

# Test change in \`src/lib/auth/validate.test.ts\`

## Findings (rule engine)

- **CRITICAL** \`it.skip\` introduced on line 42

## Diff

\`\`\`diff
-it('rejects expired tokens', async () => {
+it.skip('rejects expired tokens', async () => {
\`\`\`

## Analysis

Risk: HIGH. Disabling a security-critical test.

## Decision

(Empty until enrichment is complete and a human approves or rejects.)
`;

describe("canonicalize", () => {
  test("produces deterministic output", () => {
    const input = { diffHash: "sha256:abc123", decisionText: "approved by dev@example.com" };
    const a = canonicalize(input);
    const b = canonicalize(input);
    expect(a.equals(b)).toBe(true);
  });

  test("includes both diffHash and decisionText", () => {
    const buf = canonicalize({ diffHash: "sha256:abc", decisionText: "rationale: ok" });
    const str = buf.toString("utf-8");
    expect(str).toBe("sha256:abc\nrationale: ok");
  });
});

describe("sign and verify roundtrip", () => {
  const input = { diffHash: "sha256:deadbeef", decisionText: "approved by alice@co.com\nrationale: looks good" };

  test("signature verifies with matching public key", () => {
    const sig = sign(kp.privateKey, input);
    expect(typeof sig).toBe("string");
    expect(sig.length).toBeGreaterThan(0);
    expect(verify(kp.publicKey, input, sig)).toBe(true);
  });

  test("signature fails with wrong public key", () => {
    const other = generateKeyPair();
    const sig = sign(kp.privateKey, input);
    expect(verify(other.publicKey, input, sig)).toBe(false);
  });

  test("signature fails with tampered diffHash", () => {
    const sig = sign(kp.privateKey, input);
    const tampered = { ...input, diffHash: "sha256:00000000" };
    expect(verify(kp.publicKey, tampered, sig)).toBe(false);
  });

  test("signature fails with tampered decisionText", () => {
    const sig = sign(kp.privateKey, input);
    const tampered = { ...input, decisionText: "approved by mallory@evil.com\nrationale: trust me" };
    expect(verify(kp.publicKey, tampered, sig)).toBe(false);
  });

  test("signature is base64 encoded", () => {
    const sig = sign(kp.privateKey, input);
    expect(() => Buffer.from(sig, "base64")).not.toThrow();
    expect(Buffer.from(sig, "base64").length).toBe(64);
  });
});

describe("parseFrontMatter", () => {
  test("extracts key-value pairs", () => {
    const fm = parseFrontMatter(STUB_FILE);
    expect(fm["id"]).toBe("tv_2026-04-29T14-21_abc1234_auth-validate-test");
    expect(fm["severity"]).toBe("CRITICAL");
    expect(fm["diff_hash"]).toBe("sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08");
  });

  test("throws on missing front matter", () => {
    expect(() => parseFrontMatter("no front matter here")).toThrow("No front matter found");
  });
});

describe("parseDecisionSection", () => {
  test("extracts decision text", () => {
    const decision = parseDecisionSection(STUB_FILE);
    expect(decision).toContain("Empty until enrichment");
  });

  test("throws on missing section", () => {
    expect(() => parseDecisionSection("no decision here")).toThrow("No Decision section found");
  });
});

describe("signFile and verifyFile roundtrip", () => {
  test("signs a stub file and verifies it", () => {
    const signed = signFile(kp.privateKey, STUB_FILE, "dev@example.com", "safe to skip, covered by integration tests");
    expect(signed).toContain("## Decision");
    expect(signed).toContain("approved by dev@example.com");
    expect(signed).toContain("rationale: safe to skip, covered by integration tests");
    expect(signed).toContain("signature: ed25519:");

    expect(verifyFile(kp.publicKey, signed)).toBe(true);
  });

  test("verification fails with wrong key", () => {
    const other = generateKeyPair();
    const signed = signFile(kp.privateKey, STUB_FILE, "dev@example.com", "looks fine");
    expect(verifyFile(other.publicKey, signed)).toBe(false);
  });

  test("verification fails if decision text is tampered", () => {
    const signed = signFile(kp.privateKey, STUB_FILE, "dev@example.com", "legitimate reason");
    const tampered = signed.replace("legitimate reason", "tampered reason");
    expect(verifyFile(kp.publicKey, tampered)).toBe(false);
  });

  test("verification fails if front matter hash is tampered", () => {
    const signed = signFile(kp.privateKey, STUB_FILE, "dev@example.com", "good reason");
    const tampered = signed.replace(
      "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    );
    expect(verifyFile(kp.publicKey, tampered)).toBe(false);
  });

  test("throws if file has no diff_hash", () => {
    const noDiffHash = STUB_FILE.replace("diff_hash: sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08\n", "");
    expect(() => signFile(kp.privateKey, noDiffHash, "dev@example.com", "reason")).toThrow("No diff_hash");
  });

  test("throws if signed file has no signature", () => {
    expect(() => verifyFile(kp.publicKey, STUB_FILE)).toThrow("No ed25519 signature");
  });
});
