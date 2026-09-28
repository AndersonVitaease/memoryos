import { execFileSync } from "node:child_process"; import { createHash } from "node:crypto"; import { readFileSync } from "node:fs"; import path from "node:path";
const root = process.argv[2]; const ref = process.argv[3];
const files = execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean).sort();
const h = createHash("sha256");
for (const f of files) { let data; if (ref) { try { data = execFileSync("git", ["-C", root, "show", `${ref}:./${f}`], { maxBuffer: 1 << 28 }); } catch { continue; } } else { try { data = readFileSync(path.join(root, f)); } catch { continue; } } h.update(f).update("\0").update(data).update("\0"); }
console.log(h.digest("hex"));
