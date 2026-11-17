import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [inner, text] of flatten(value, path)) out.set(inner, text);
  }
  return out;
}

/** Names of the ICU arguments a message uses: {name}, {count, plural, …}. */
function argumentsOf(message: string): string[] {
  const names = new Set<string>();
  let depth = 0;
  for (let index = 0; index < message.length; index += 1) {
    const char = message[index];
    if (char === "{") {
      if (depth === 0) {
        const match = /^\{\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(message.slice(index));
        if (match) names.add(match[1]);
      }
      depth += 1;
    } else if (char === "}") depth -= 1;
  }
  return [...names].sort();
}

describe("message catalogues", () => {
  const spanish = flatten(es as Tree);
  const english = flatten(en as Tree);

  it("Spanish and English have exactly the same keys", () => {
    expect([...english.keys()].filter((key) => !spanish.has(key))).toEqual([]);
    expect([...spanish.keys()].filter((key) => !english.has(key))).toEqual([]);
  });

  it("no message is empty", () => {
    const empty = [...spanish, ...english].filter(([, text]) => text.trim() === "").map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it("each message takes the same arguments in both languages", () => {
    const different = [...spanish.keys()].filter((key) => argumentsOf(spanish.get(key)!).join() !== argumentsOf(english.get(key) ?? "").join());
    expect(different).toEqual([]);
  });
});
