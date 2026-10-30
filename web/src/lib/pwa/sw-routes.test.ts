import { describe, expect, it } from "vitest";

import { fillTemplate, findPage, matchPage, normalizePathname, pageEntry, placeholder } from "../../../scripts/sw/routes.mjs";

const pages = ["/home", "/workout/schemes/add", "/workout/schemes/[schemeId]", "/workout/schemes/[schemeId]/edit", "/"].map(
  (route) => pageEntry(route)!,
);

describe("pageEntry", () => {
  it("keeps static routes", () => {
    expect(pageEntry("/home")).toEqual({ route: "/home", url: "/home", segments: ["home"], params: [] });
    expect(pageEntry("/")).toEqual({ route: "/", url: "/", segments: [], params: [] });
  });

  it("puts placeholders into dynamic routes", () => {
    expect(pageEntry("/workout/schemes/[schemeId]/edit")).toEqual({
      route: "/workout/schemes/[schemeId]/edit",
      url: `/workout/schemes/${placeholder("schemeId")}/edit`,
      segments: ["workout", "schemes", "[schemeId]", "edit"],
      params: ["schemeId"],
    });
  });

  it("skips catch-all routes", () => {
    expect(pageEntry("/docs/[...slug]")).toBeNull();
    expect(pageEntry("/docs/[[...slug]]")).toBeNull();
  });
});

describe("findPage", () => {
  it("prefers static pages", () => {
    expect(findPage("/workout/schemes/add", pages)?.page.url).toBe("/workout/schemes/add");
    expect(findPage("/home/", pages)?.page.url).toBe("/home");
    expect(findPage("/", pages)?.page.url).toBe("/");
  });

  it("matches templates with the values of the URL", () => {
    const id = "0b6a3f0e-8d1f-4c55-9b1a-2f3c4d5e6f70";
    expect(findPage(`/workout/schemes/${id}`, pages)).toEqual({
      page: pages[2],
      values: { [placeholder("schemeId")]: id },
    });
    expect(findPage(`/workout/schemes/${id}/edit`, pages)?.page).toBe(pages[3]);
  });

  it("finds nothing for unknown pages", () => {
    expect(findPage("/unknown", pages)).toBeNull();
    expect(findPage("/workout/schemes/1/edit/more", pages)).toBeNull();
  });

  it("refuses values that would need escaping in the HTML", () => {
    expect(matchPage("/workout/schemes/<script>", pages[2])).toBeNull();
    expect(matchPage('/workout/schemes/a"b', pages[2])).toBeNull();
    expect(matchPage("/workout/schemes/a%20b", pages[2])).toEqual({ [placeholder("schemeId")]: "a%20b" });
  });
});

describe("fillTemplate", () => {
  it("replaces every placeholder", () => {
    const key = placeholder("schemeId");
    const html = `<a href="/workout/schemes/${key}"></a><script>self.__next_f.push([1,"[\\"schemeId\\",\\"${key}\\",\\"d\\"]"])</script>`;
    expect(fillTemplate(html, { [key]: "42" })).toBe(
      `<a href="/workout/schemes/42"></a><script>self.__next_f.push([1,"[\\"schemeId\\",\\"42\\",\\"d\\"]"])</script>`,
    );
  });
});

describe("normalizePathname", () => {
  it("removes trailing slashes", () => {
    expect(normalizePathname("/home/")).toBe("/home");
    expect(normalizePathname("/")).toBe("/");
    expect(normalizePathname("")).toBe("/");
  });
});
