import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = JSON.parse(
  fs.readFileSync(
    path.join(root, "docs/research/ubicatec/extracted-shell-literals.json"),
    "utf8",
  ),
);

const out = `/**
 * Static UI literals extracted from the source bundle
 * (docs/research/ubicatec/extracted-shell-literals.json).
 * Regenerate with: node scripts/gen-literals.mjs
 */

/** Search filter chips (source \`ei\`). */
export const EI: { id: string; label: string }[] = ${JSON.stringify(src.ei, null, 2)};

/** Weekday chips (source \`Q\`). */
export const DAYS: { id: string; label: string; shortLabel: string }[] = ${JSON.stringify(src.Q, null, 2)};

/** Feature labels (source \`ep\`). */
export const FEATURE_LABELS: Record<string, string> = ${JSON.stringify(src.ep, null, 2)};

/** Building code fallbacks keyed by building id/name/slug (source \`buildingCodes\`). */
export const BUILDING_CODES: Record<string, string> = ${JSON.stringify(src.buildingCodes, null, 2)};
`;

fs.writeFileSync(path.join(root, "src/lib/literals.ts"), out + "\n", "utf8");
console.log("wrote src/lib/literals.ts");
