import { AppStoreButton } from "./AppStoreButton";
import { BRAND_GRADIENT } from "./brand";
import { StartButton } from "./StartButton";

export function FinalCallToAction() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pt-24 md:px-6 md:pt-32">
      <div className={`relative overflow-hidden rounded-[36px] px-6 py-14 text-center text-white md:py-20 ${BRAND_GRADIENT}`}>
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-black/10" aria-hidden />
        <h2 className="relative text-[34px] leading-tight font-black tracking-tight md:text-5xl">Ready for your next workout?</h2>
        <p className="relative mx-auto mt-4 max-w-xl text-[17px] leading-7 text-white/85">
          Free, without ads, on every device. Your first workout is a tap away.
        </p>
        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-4">
          <StartButton size="small" />
          <AppStoreButton />
        </div>
      </div>
    </section>
  );
}
