import { readFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const SC = require("../docs/conditions.js");

const { features, tests } = JSON.parse(readFileSync(new URL("./fixtures.json", import.meta.url)));
let fail = 0;
for (const t of tests) {
  const got = features
    .filter((f) => SC.evaluateConditions(f, t.conditions))
    .map((f) => f.code)
    .sort();
  const exp = t.expected;
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (!ok) { fail++; console.error("NG", JSON.stringify(t.conditions), "js=", got, "py=", exp); }
  else console.log("OK", t.conditions.map(c=>c.type).join("+"), "->", got.join(","));
}
if (fail) { console.error(`\n${fail} 件不一致`); process.exit(1); }
console.log("\nPython と JS の条件評価が完全一致 ✓");
