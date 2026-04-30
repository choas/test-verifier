import { sign as cryptoSign, verify as cryptoVerify, createPrivateKey, createPublicKey } from "node:crypto";

export interface SignInput {
  diffHash: string;
  decisionText: string;
}

export interface SignedDecision extends SignInput {
  signature: string;
  approver: string;
}

export function canonicalize(input: SignInput): Buffer {
  const canonical = `${input.diffHash}\n${input.decisionText}`;
  return Buffer.from(canonical, "utf-8");
}

export function sign(privateKeyPem: string, input: SignInput): string {
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error(`Expected ed25519 key, got ${key.asymmetricKeyType}`);
  }
  const sig = cryptoSign(null, canonicalize(input), key);
  return sig.toString("base64");
}

export function verify(publicKeyPem: string, input: SignInput, signature: string): boolean {
  const key = createPublicKey(publicKeyPem);
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error(`Expected ed25519 key, got ${key.asymmetricKeyType}`);
  }
  return cryptoVerify(null, canonicalize(input), key, Buffer.from(signature, "base64"));
}

export function parseFrontMatter(fileContent: string): Record<string, string> {
  const match = fileContent.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error("No front matter found");
  const fields: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (key && value) fields[key] = value;
  }
  return fields;
}

export function parseDecisionSection(fileContent: string): string {
  const marker = "## Decision";
  const idx = fileContent.indexOf(marker);
  if (idx === -1) throw new Error("No Decision section found");
  return fileContent.slice(idx + marker.length).trim();
}

export function signFile(
  privateKeyPem: string,
  fileContent: string,
  status: string,
  approver: string,
  rationale: string,
): string {
  const fm = parseFrontMatter(fileContent);
  const diffHash = fm["diff_hash"];
  if (!diffHash) throw new Error("No diff_hash in front matter");

  const decisionText = `${status} by ${approver}\nrationale: ${rationale}`;
  const sig = sign(privateKeyPem, { diffHash, decisionText });

  const marker = "## Decision";
  const idx = fileContent.indexOf(marker);
  if (idx === -1) throw new Error("No Decision section found");

  const before = fileContent.slice(0, idx + marker.length);
  const decision = `\n\n${decisionText}\nsignature: ed25519:${sig}\n`;
  return (before + decision).replace(/^status: pending$/m, `status: ${status}`);
}

export function verifyFile(publicKeyPem: string, fileContent: string): boolean {
  const fm = parseFrontMatter(fileContent);
  const diffHash = fm["diff_hash"];
  if (!diffHash) throw new Error("No diff_hash in front matter");

  const decisionRaw = parseDecisionSection(fileContent);
  const sigMatch = decisionRaw.match(/^signature:\s*ed25519:(.+)$/m);
  if (!sigMatch) throw new Error("No ed25519 signature found in Decision section");

  const signature = sigMatch[1].trim();
  const decisionText = decisionRaw.replace(/\nsignature:\s*ed25519:.+$/m, "").trim();

  return verify(publicKeyPem, { diffHash, decisionText }, signature);
}
