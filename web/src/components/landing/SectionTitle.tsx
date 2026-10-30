import { BRAND_TEXT } from "./brand";

export function SectionTitle({ eyebrow, title, align = "center" }: { eyebrow: string; title: string; align?: "center" | "left" }) {
  return (
    <div className={align === "center" ? "mx-auto max-w-3xl text-center" : ""}>
      <p className={`text-footnote font-bold tracking-[0.14em] uppercase ${BRAND_TEXT}`}>{eyebrow}</p>
      <h2 className="mt-3 text-[32px] leading-[1.1] font-black tracking-tight md:text-5xl">{title}</h2>
    </div>
  );
}
