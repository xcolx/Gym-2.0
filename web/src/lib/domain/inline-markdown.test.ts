import { describe, expect, it } from "vitest";

import { parseInlineMarkdown, plainText } from "./inline-markdown";

describe("parseInlineMarkdown", () => {
  it("keeps plain text and whitespace", () => {
    expect(parseInlineMarkdown("Hello\n\n  world")).toEqual([{ type: "text", text: "Hello\n\n  world" }]);
  });

  it("parses bold, italic and both", () => {
    expect(parseInlineMarkdown("a **b** c")).toEqual([
      { type: "text", text: "a " },
      { type: "strong", children: [{ type: "text", text: "b" }] },
      { type: "text", text: " c" },
    ]);
    expect(parseInlineMarkdown("_i_ and *j*")).toEqual([
      { type: "emphasis", children: [{ type: "text", text: "i" }] },
      { type: "text", text: " and " },
      { type: "emphasis", children: [{ type: "text", text: "j" }] },
    ]);
    expect(parseInlineMarkdown("***x***")).toEqual([
      { type: "strong", children: [{ type: "emphasis", children: [{ type: "text", text: "x" }] }] },
    ]);
  });

  it("nests strong inside emphasis", () => {
    expect(parseInlineMarkdown("*a **b** c*")).toEqual([
      {
        type: "emphasis",
        children: [
          { type: "text", text: "a " },
          { type: "strong", children: [{ type: "text", text: "b" }] },
          { type: "text", text: " c" },
        ],
      },
    ]);
  });

  it("leaves list markers, math and snake_case alone", () => {
    expect(plainText(parseInlineMarkdown("* item\n2 * 3 * 4\nsnake_case_name"))).toBe("* item\n2 * 3 * 4\nsnake_case_name");
    expect(parseInlineMarkdown("snake_case_name")).toEqual([{ type: "text", text: "snake_case_name" }]);
    expect(parseInlineMarkdown("# Heading")).toEqual([{ type: "text", text: "# Heading" }]);
  });

  it("leaves unclosed delimiters as text", () => {
    expect(parseInlineMarkdown("**open")).toEqual([{ type: "text", text: "**open" }]);
    expect(parseInlineMarkdown("`code")).toEqual([{ type: "text", text: "`code" }]);
  });

  it("parses code spans without formatting inside", () => {
    expect(parseInlineMarkdown("use `**not bold**` here")).toEqual([
      { type: "text", text: "use " },
      { type: "code", text: "**not bold**" },
      { type: "text", text: " here" },
    ]);
    expect(parseInlineMarkdown("`` a ` b ``")).toEqual([{ type: "code", text: "a ` b" }]);
  });

  it("parses strikethrough and escapes", () => {
    expect(parseInlineMarkdown("~~old~~ \\*not\\*")).toEqual([
      { type: "strikethrough", children: [{ type: "text", text: "old" }] },
      { type: "text", text: " *not*" },
    ]);
  });

  it("parses safe links only", () => {
    expect(parseInlineMarkdown("see [the **docs**](https://example.com/a) now")).toEqual([
      { type: "text", text: "see " },
      {
        type: "link",
        href: "https://example.com/a",
        children: [
          { type: "text", text: "the " },
          { type: "strong", children: [{ type: "text", text: "docs" }] },
        ],
      },
      { type: "text", text: " now" },
    ]);
    expect(parseInlineMarkdown("[x](javascript:alert(1))")).toEqual([{ type: "text", text: "[x](javascript:alert(1))" }]);
    expect(parseInlineMarkdown("<https://example.com>")).toEqual([
      { type: "link", href: "https://example.com", children: [{ type: "text", text: "https://example.com" }] },
    ]);
  });
});
